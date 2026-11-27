// One way to call the model, whoever runs it: Claude through the Anthropic SDK, or any
// OpenAI-compatible chat API (Kimi, OpenRouter, Qwen, ...) through fetch.
// Messages use the Anthropic shape everywhere (text / image / document blocks); they are converted here.
import Anthropic from '@anthropic-ai/sdk';

// US$ per million tokens: input, output, cached input read, cache write (Claude only).
// Check against the providers' price pages; SCAN_PRICE="in,out,cached" overrides the scan model's row.
const PRICES = [
  [/claude-opus-5-5/, [4, 20, 0.4, 5]],
  [/claude-sonnet-5-5/, [2, 10, 0.2, 2.5]],
  [/claude-haiku-5-5/, [0.1, 0.5, 0.01, 0.125]],
  [/kimi-k3\.1-pro/, [2, 10, 0.2, 0]],
];
const priceOf = (model, override) => {
  const own = override?.split(',').map(Number);
  if (own?.length >= 2 && own.every(n => n >= 0)) return [own[0], own[1], own[2] ?? own[0], own[3] ?? 0];
  return PRICES.find(([re]) => re.test(model))?.[1] || null;
};
/* Tokens of one call → { model, input, cached, cacheWrite, output, usd, source }.
   source "provider" = the API reported the price itself (OpenRouter); "estimate" = tokens × price table. */
function bill(model, price, u, providerUsd) {
  const usd = providerUsd ?? (price ? (u.input * price[0] + u.output * price[1] + u.cached * price[2] + u.cacheWrite * price[3]) / 1e6 : null);
  return { model, ...u, usd: usd == null ? null : Math.round(usd * 10000) / 10000, source: providerUsd != null ? 'provider' : price ? 'estimate' : 'no price' };
}

export class AiError extends Error {
  constructor(message, status, where) { super(message); this.status = status; this.where = where; }
}

/* Claude: streams text, returns the whole reply. ask(…, { maxTokens }) may lower the reply limit for one call (the
   scan's spending limit, server/pricing.js); count() is the API's own token count of a request, free and not billed. */
function anthropic({ model, maxTokens, priceOverride }) {
  const client = new Anthropic();
  const price = priceOf(model, priceOverride);
  return {
    name: 'Claude', model, price, maxTokens,
    async count(messages) { return (await client.messages.countTokens({ model, messages })).input_tokens; },
    async ask(messages, { onText, onUsage, signal, maxTokens: cap } = {}) {
      const stream = client.messages.stream({ model, max_tokens: Math.min(maxTokens, cap || maxTokens), messages }, { signal });
      if (onText) stream.on('text', onText);
      const msg = await stream.finalMessage();
      const u = msg.usage || {}; // input_tokens excludes the cached part; output_tokens includes thinking
      onUsage?.(bill(model, price, { input: u.input_tokens || 0, cached: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, output: u.output_tokens || 0 }));
      if (msg.stop_reason === 'refusal') throw new AiError('The AI declined to read these photos. Try clearer photos of the manual pages.');
      if (msg.stop_reason === 'max_tokens') throw new AiError('The guide was too long to finish. Try fewer pages at once.');
      return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    },
  };
}

/* OpenAI-compatible chat API (POST {baseUrl}/chat/completions, server-sent events). */
function openaiCompatible({ baseUrl, apiKey, model, maxTokens, reasoning, priceOverride }) {
  const price = priceOf(model, priceOverride);
  const openrouter = /openrouter\.ai/.test(baseUrl);
  const toPart = b => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
    // the server's PDF fallback reacts to a 400 that mentions "pdf": the browser then sends the pages as pictures
    if (b.type === 'document') throw new AiError('This model cannot read PDF documents directly.', 400);
    throw new AiError(`Unsupported content block "${b.type}".`, 400);
  };
  const toMessage = m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(toPart) });
  return {
    name: model, model, price, maxTokens,
    // no counting endpoint here: about 1,600 tokens a picture (the usual cap for one image), 4 characters a token for text
    async count(messages) {
      let n = 0;
      for (const m of messages) for (const b of typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content) n += b.type === 'text' ? Math.ceil(b.text.length / 4) : 1600;
      return n;
    },
    async ask(messages, { onText, onThink, onUsage, signal, maxTokens: cap } = {}) {
      const body = {
        model, max_tokens: Math.min(maxTokens, cap || maxTokens), stream: true, messages: messages.map(toMessage),
        stream_options: { include_usage: true }, // token counts arrive in the last chunk
        ...(openrouter ? { usage: { include: true } } : {}), // OpenRouter adds the real price it charged
        ...(reasoning ? { reasoning_effort: reasoning } : {}),
      };
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal, body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new AiError(err?.error?.message || `${res.status} ${res.statusText}`, res.status, new URL(baseUrl).hostname);
      }
      let text = '', finish = null, buf = '', usage = null;
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let ev; try { ev = JSON.parse(data); } catch { continue; }
          if (ev.error) throw new AiError(ev.error.message || 'The AI stopped with an error.', ev.error.code || 500);
          const choice = ev.choices?.[0];
          if (ev.usage || choice?.usage) usage = ev.usage || choice.usage; // Moonshot puts it on the choice
          const delta = choice?.delta?.content; // reasoning_content (thinking) is not part of the reply
          if (delta) { text += delta; onText?.(delta); }
          else if (choice?.delta?.reasoning_content) onThink?.();
          if (choice?.finish_reason) finish = choice.finish_reason;
        }
      }
      if (usage) {
        const cached = usage.prompt_tokens_details?.cached_tokens || usage.cached_tokens || 0; // prompt_tokens includes them
        onUsage?.(bill(model, price, { input: (usage.prompt_tokens || 0) - cached, cached, cacheWrite: 0, output: usage.completion_tokens || 0 }, typeof usage.cost === 'number' ? usage.cost : null));
      } else onUsage?.({ model, input: 0, cached: 0, cacheWrite: 0, output: 0, usd: null, source: 'not reported' });
      if (finish === 'content_filter') throw new AiError('The AI declined to read these photos. Try clearer photos of the manual pages.');
      if (finish === 'length') throw new AiError('The guide was too long to finish. Try fewer pages at once.');
      return text;
    },
  };
}

/* The model that reads manuals (and repairs and compares): SCAN_* settings if complete, else Claude. */
export function scanModel(env = process.env) {
  const maxTokens = Number(env.SCAN_MAX_TOKENS || 64000);
  // an empty SCAN_API_KEY means "not set up yet": keep using Claude
  if (env.SCAN_BASE_URL && env.SCAN_API_KEY && env.SCAN_MODEL) {
    return openaiCompatible({ baseUrl: env.SCAN_BASE_URL, apiKey: env.SCAN_API_KEY, model: env.SCAN_MODEL, maxTokens, reasoning: env.SCAN_REASONING, priceOverride: env.SCAN_PRICE });
  }
  return env.ANTHROPIC_API_KEY ? anthropic({ model: env.CLAUDE_MODEL || 'claude-opus-5-5', maxTokens }) : null;
}

/* The small model behind "Stuck on this step?": Claude Haiku if there is a Claude key, else the scan model. */
export function askModel(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return anthropic({ model: env.CLAUDE_ASK_MODEL || 'claude-haiku-5-5', maxTokens: 400 });
  return env.SCAN_BASE_URL && env.SCAN_API_KEY ? openaiCompatible({ baseUrl: env.SCAN_BASE_URL, apiKey: env.SCAN_API_KEY, model: env.SCAN_ASK_MODEL || env.SCAN_MODEL, maxTokens: 2000, reasoning: env.SCAN_ASK_REASONING }) : null;
}
