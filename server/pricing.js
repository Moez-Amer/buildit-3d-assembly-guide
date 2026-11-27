// What a scan costs the person, and the most Buildit may spend on AI for it. Paid scans are not open yet, but every scan
// already runs under these limits, so no manual can cost more to read than its price brings in.
// The website's Pricing section (web/index.html) shows the same prices: keep the two in step.

export const MAX_PAGES = 60; // per scan; the scan card stops at 60 too (web/src/scan.js)

// A page of a real manual takes 0.9k–3.1k tokens, the instructions included (kit sheets up to a 52-page chest of
// drawers). A page that takes more (small print, a catalogue, a text-heavy PDF) counts as more than one page, so a
// "32-page" upload that holds 60 pages' worth of content is priced and limited like 60 pages.
export const TOKENS_PER_PAGE = 4000;

// eur: the price with VAT. budgetUsd: the most the AI calls for one scan may cost. It is the price without VAT (19%) and
// card fees (1.5% + €0.25), at $1.05 per euro, less a 20% margin. Real scans stay well under it: 4 pages $0.21,
// 16 pages $0.38, 24 pages $0.80, 52 pages $2.06–2.78 (with the compare pass, which is now off).
export const TIERS = [
  { pages: 16, eur: 1.99, budgetUsd: 1.15 },
  { pages: 32, eur: 2.99, budgetUsd: 1.85 },
  { pages: 60, eur: 5.99, budgetUsd: 3.90 },
];

/** The tier a scan falls in: by its pages, or by its content when the pages hold more than pages usually do.
 *  tier is null when even the largest tier is too small. */
export function tierFor(pages, tokens) {
  const weighted = Math.max(pages, Math.ceil((tokens || 0) / TOKENS_PER_PAGE));
  return { pages, weighted, tier: TIERS.find(t => weighted <= t.pages) || null };
}

/** The most output tokens a call may write without the scan going over its budget. price = [in, out, cached, cacheWrite]
 *  in US$ per million tokens; inputUsd = what the call's input will cost. Returns Infinity without a price or budget. */
export function outputRoom(budgetUsd, spentUsd, inputUsd, price) {
  if (!price || !Number.isFinite(budgetUsd)) return Infinity;
  return Math.floor(Math.max(0, budgetUsd - spentUsd - inputUsd) / price[1] * 1e6);
}
