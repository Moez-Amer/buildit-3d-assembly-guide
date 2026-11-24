# Buildit: rules and project context for every AI tool

Claude Code, Codex, Gemini, Cursor and teammates all read this file; Claude reads it through `CLAUDE.md` (`@AGENTS.md`).
Put rules and project facts here, not in one tool's own file, so every tool works from the same page.

## Rules for every AI tool
- Never credit an AI tool or agent for work in this repo: no `Co-Authored-By` or "Generated with …" lines, no tool or
  agent names in commit messages, pull request text or code comments, and no bot as author. The person who runs the tool
  is the author.
- Commit messages are clear and professional. A summary line in the imperative mood, at most 72 characters, no full stop
  ("Add pause control to the build screen"). Then a blank line and a short body that says what changed and why, wrapped
  at 72 characters and grouped by area when the change is large. No emojis, no filler, one logical change per commit.
- Log every fix, issue or improvement as one row in `IMPROVEMENTS.md` (date, area, problem, change, status). It is local and
  gitignored: never commit it.
- Ask a human before anything that publishes or cannot be undone: push, merge, deploy, sending email, deleting data or
  migrations, money. Committing your own finished work on your own branch is fine.
- Never commit `.env`, `server/data/`, `CLAUDE.md`, `IMPROVEMENTS.md`, `HANDOFF.md`, `.claude/`, `.agents/`, `.codex/`, `.impeccable/`.
- Private business context lives only in the local `CLAUDE.md` ("Business context"). Read it if you need it; never copy it
  into a committed file.
- Accuracy beats polish: a wrong instruction is worse than a missing one. Re-run any bug a reviewer claims before fixing it.

## Switching between Claude and Codex
Both tools read this file and see the same folder and git branch, so you can switch at any point. The conversation does not
carry over, so it goes in `HANDOFF.md` (project root, local, gitignored).
- **"hand off" / "handoff"** (the user's message alone is enough; also do it before stopping in the middle of a task):
  overwrite `HANDOFF.md` with 1. the task and its goal, 2. branch and folder, 3. what is done (commits), 4. the next step,
  5. how to check it (commands, screenshots, expected numbers), 6. decisions taken and open questions, 7. uncommitted changes
  (`git status --short`). Reply with one line saying it is written and what the next step is.
- **"pick up"** (alone is enough): read `HANDOFF.md`, then `git status` and `git log --oneline -5`; say in two lines what you
  are picking up and the next step, then carry on. No `HANDOFF.md`: say so and ask what to work on. When the task is
  finished, delete `HANDOFF.md`.
- At the start of any session, if `HANDOFF.md` exists, mention it in one line (task and date) even if not asked.
- **Giving a task to the other tool from inside a session** (it runs in the same folder and reports back):
  - Claude → Codex: `codex exec -C <folder> "<brief>" </dev/null` (without `</dev/null` it can wait forever for more input
    when started from another tool). Codex's sandbox may not be allowed to write git metadata inside a
    worktree; let it leave its changes uncommitted, then review and commit them yourself.
  - Codex → Claude: `claude -p "<brief>"` in the folder, or `claude --bg -w <name> "<brief>"` for its own worktree in the background.
  - A brief names the goal, the files it may touch, how to check the result, and asks for `HANDOFF.md` at the end.
- Design work uses the impeccable skill in both tools: Claude finds it in `.claude/skills/`, Codex in `.agents/skills/`
  (links to the same folders), and its design hook runs in both (`.claude/settings.local.json`, `.codex/hooks.json`).

## Team workflow
- Lead: Moez-Amer. The lead merges pull requests and is the only one who pushes to `main` directly.
- Everyone else never pushes to `main`. The way in:
  1. `git switch -c task/<name>` from an up-to-date `main` (`git pull` first),
  2. commit on that branch, then `git push -u origin task/<name>`,
  3. open a pull request into `main` on GitHub (the template lists the checks); the lead reviews and merges it.
  GitHub enforces this (ruleset "main: pull requests only, the lead merges"): `main` only changes through a pull request,
  only the lead can merge or push to it, and it cannot be force-pushed or deleted.
- One task per person or agent, on its own branch `task/<name>`, ideally in its own worktree (see "Several agents at once").
- Each task gets a file `tasks/<name>.md` made from `tasks/_template.md`: owner, branch, goal, the files it may touch, and an
  acceptance check. Claim it with one line in `docs/STATUS.md` before starting. Never two people or agents on the same files.
- Changes to shared contracts (the guide format in `web/src/guide.js`, API routes, the database) are agreed with the lead first.
- Before opening a pull request: `git fetch origin && git merge origin/main`, fix conflicts, run `npm run build` and
  `node scripts/check-guide.mjs web/public/examples/bookcase.json`. UI changes: add desktop (1280×860) and phone (390×844) screenshots.

## Several agents at once
One agent per task, each in its own git worktree and branch.
- Claude: start each from the project root with `claude -w <task-name>` (worktree in `.claude/worktrees/<task-name>`).
  `.worktreeinclude` copies `.env`, `server/data/`, the local skills and the Codex setup into it. Run `npm install` there first.
- Codex: open that worktree folder as the project, or use Codex's own worktree option and copy `.env` into it.
- 5173/8787 belong to the main copy. In a worktree, run the app on its own pair, e.g. `WEB_PORT=5174 PORT=8788 npm run dev`
  (vite.config.js, the server's sign-in links and the xcheck/eval scripts all read WEB_PORT and PORT).
- Keep each task to its own files where possible (pipeline: server/; capture: web/src/scan.js; editor/viewer: web/src/build.js,
  viewer/).

## What this is
Buildit is an app that turns a flat-pack furniture manual (IKEA-style) into an interactive 3D assembly guide.
The user scans the paper manual with their phone camera. Claude (via the API) reads the pages and returns a
structured guide. The app then shows:
- a 3D view where each step animates: boards fly into place, dowels and cam screws go in, cam locks turn
- realistic parts (hole patterns, real hardware shapes) so people can match the screen to the real parts in front of them
- simple written instructions, a "take these parts now" list, tips and safety warnings
- a parts bench with a picture, label, count and a "how to recognise it" line for every part
- an actual-size view of hardware (calibrated with a bank card) so a real screw can be laid on the phone to check it
- a "Stuck on this step?" box that asks Claude about the current step

Core product insight: the 3D view must let a person cross-match virtual parts with the real objects
(which board, which way it faces, which hole, which screw). Accuracy matters more than polish.
A wrong instruction is worse than a missing one.

## Status (26 Oct 2026)
- Working: example bookcase guide (`web/public/examples/bookcase.json`) renders and animates correctly
  on desktop and phone widths. Server, routing, saved guides and the camera/upload UI are built.
- NOT yet tested: real AI scanning end to end (needs an API key and a real manual).
- The owner's main complaint so far: earlier demos did not match their real manual. That was because
  no manual had actually been read: the bookcase is invented. The next job is to scan their real
  manual and make the output match the paper.

## Run
```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY
npm run dev              # API on :8787 + Vite (https) on :5173
```
Phone on the same Wi-Fi: open the Network URL Vite prints (https, self-signed cert, accept the warning).
HTTPS is required for getUserMedia (live camera) on phones.

## Layout
- `web/index.html`: both screens (home/scan, build) and the actual-size dialog
- `web/src/main.js`: routing (`#/guide/<id>`), guide list, screen wake lock
- `web/src/scan.js`: live camera with a shutter, photo/video/PDF upload (video → de-duplicated frames; PDF is sent whole,
  up to 24 MB, and the server passes it to Claude as a `document` block; if Claude rejects the PDF the server replies
  `code:"pdf_rejected"` and the browser renders the pages to JPEGs with pdfjs-dist and resends), POST /api/analyze (NDJSON stream)
- `web/src/build.js`: build screen UI: step card, parts bench, info popover, ask box
- `web/src/guide.js`: **the guide format + `normalizeGuide()` validation, shared by server and client**
- `web/src/check.js`: automatic guide check, shared: board overlaps/gaps/floating, board and hardware counts vs. parts list,
  hardware off its board or on the wrong face, dowels/cam screws that point into no board, cam screw ↔ cam lock pairing,
  nails that miss the board behind, "take these parts" lists that miss hardware used in the step.
  Shaped and tilted parts are tested on their real surfaces by `web/src/collide.js` (surface samples + signed distance per
  primitive; side test for thin grilles/domes). Overlaps that are meant (pole in socket, shaft in hub) are declared with
  panel `into: [keys]`; open grille centres with `hole`.
  Server runs it after each scan and, if it finds errors/warnings, does a repair pass (env `CHECK_REPAIR=0` turns it off;
  the fix is kept only if it has fewer problems and the same step count). Then a compare pass, OFF by default since 15 Nov 2026 (env `RENDER_COMPARE=1` turns it on; it never corrected a real
  instruction error in 14 scans and its renders frame the loose floor parts too, so the assembly is too small to check):
  `server/render.js` renders the guide with headless Chrome (playwright-core, `web/render.html`) at the parts check and up to 7 steps,
  and Claude compares the pictures with the manual (reply `NO_CHANGES` or a corrected guide, kept if the check is not worse).
  Joints (4 Nov 2026, guide.js, used up in normalizeGuide so stored guides hold exact numbers): panel `attach:{to, face, x/y/z:
  start|center|end|mm, gap}` places a board flush on another board's face; hardware `at`+`to`+`n` = an evenly spaced row;
  a cam lock without `at` is put where a cam screw pointing into its board ends (`camLockSpot`). autofix also moves
  unpaired cam locks there, board by board. The repair gets at most 60 problem lines (errors first).
  Before each AI repair, `web/src/autofix.js` makes safe corrections in code (slide a part out of a small overlap, turn a screw on a
  shaped part that points at the part it should join); each is kept only if the check gets better. Repair and compare replies are
  edit lists (`web/src/edits.js`: `{"edits":[{"panel":"B1","set":{...}}, ...]}`), not whole guides (4 Nov 2026: Kimi took 12–14 min per
  full rewrite). Screws next to a bracket on the same board are not expected to reach another board.
  The build screen shows a dashed
  "3D view may be wrong in this step" box per step. CLI: `node scripts/check-guide.mjs <guide.json>`.
- `web/src/viewer/Viewer.js`: Three.js scene; builds everything from the guide: floor layout for step 0,
  keyframes, staggered timing, auto camera (wide + close-up), labels, tap-to-identify, thumbnails
- `web/src/viewer/parts3d.js`: 3D models: panel with holes, dowel, cam_screw, cam_lock, nail, shelf_pin, screw, bolt, bracket
- Manual next to each step (7 Nov 2026): scans keep their manual in `server/data/pages/<id>/` (the PDF, or page JPEGs when
  the browser made them from a PDF; photos are not stored, their order is not page order). Guide field `manual`.
  The step card shows "Compare with the manual · page N" (`web/src/manual.js` renders the PDF page with pdf.js).
- Working positions: guide `groups:[{key, panels, until, rot, pos?}]` = boards built together in another pose (lying flat, on
  the back) from each board's step until `until`; the viewer turns the group as one and sets it on the floor.
  Check `merged-boards` warns when a part's shape is several thin boards (a drawer drawn as one box).
- `npm run xcheck -- <id> [from] [to]` (dev server running): manual page next to the app's 3D view for every step,
  into server/data/xcheck/<id>/. Use it after every scan: the automatic check cannot see disagreement with the paper.
- Hardware models (7 Nov 2026): `assets/blender/hardware.py` builds them in Blender (`npm run models`, needs Blender 5.2) and
  exports `web/public/models/hardware.glb` (~200 KB: dowel, cam_screw, cam_lock, screw, allen_bolt, knob, foot, cap; each
  under 2,000 triangles). Viewer axes, mm, built along +x; children "head"/"shaft" scale with d_mm/len_mm; materials are
  names swapped for the viewer's own. parts3d.js loads it (`hardwareReady`) and falls back to the built-in models.
  The viewer builds one model per part and copies it (shared geometry), and shares materials per part+step:
  the 74-step test manual went from 1,829 to 935 draw calls and 1,788 to 257 geometries.
- `web/src/actualSize.js`: true-size SVG profiles per hardware kind
- `server/index.js`: Express: `/api/analyze` (images → Claude → normalized guide saved to `server/data/guides/<id>.json`),
  `/api/ask`, `/api/guides`, `/api/guides/:id`, serves `dist/` in production
- `server/prompt.js`: **the instructions Claude gets with the manual photos (main lever for accuracy)**
- `scripts/make-example.mjs`: generates the example bookcase JSON

## Accounts and website (8 Nov 2026)
- Landing page (`#/`, live 3D hero from the example, `web/src/landing.js`), sign-in (`#/signin`, `#/signin/<token>`), My guides (`#/app`),
  privacy/imprint DRAFTS with [placeholders] (`web/src/legal.js`), routing in `web/src/main.js`. Fonts self-hosted (@fontsource; no Google, German GDPR).
- Sign-in by email link: `server/auth.js` + `server/db.js` (node:sqlite, `server/data/buildit.db`). Tokens and sessions stored as SHA-256 only;
  link token after `#`, used by POST behind a Continue button that first shows the masked email (`/api/auth/peek`); cookie `__Host-bi_session`.
  CSRF: every /api change needs header `x-buildit: 1` (web/src/api.js adds it) + Sec-Fetch-Site check + SameSite=Lax.
- Access: guides table (owner, public). Owner or public only; guides from before accounts (owner NULL) only for ADMIN_EMAILS. Others get 404.
  Scanning: ADMIN_EMAILS only until payments (`SCAN_ACCESS=everyone` opens it); others see "early access".
  `scripts/notify-scan-open.mjs` sends the one promised "scanning is open" email.
- Email (24 Nov 2026): `server/mail.js` sends everything: Resend when `RESEND_API_KEY` is set, else SMTP (`SMTP_URL`). Keys only
  in `.env`. Resend's test sender `onboarding@resend.dev` (the development default) only reaches the Resend account's own
  address; real users need a verified domain and `MAIL_FROM` on it. In development a failed email still prints the link in the log.
- Env: `npm run dev` sets DEV=1 (sign-in links printed in server/data/server.log when no email is sent). Without DEV the server
  refuses to start unless APP_URL (https), MAIL_FROM (not the Resend test sender) and RESEND_API_KEY or SMTP_URL are set;
  TRUST_PROXY = number of proxies. `npm start` builds first.
- Scripts eval/xcheck sign in as the first ADMIN_EMAILS via `scripts/session.mjs`.
- Built in a build → independent reviewer agent → fix loop (3 rounds).
- Website look (17 Nov 2026, replaces bold yellow): "Box & label". The page is the flat-pack box: kraft cardboard ground (#CDAD82,
  faint dot screen), content on white box-sticker labels with a millimetre ruler on the top edge and dashed perforations, black print
  (#171512) for text and primary buttons, Archivo 650 sentence case headings, Atkinson body, JetBrains Mono only for part numbers,
  counts and sizes. Yellow = logo and "new in this step" only; red = "may be wrong" and errors only. One world for website and build
  screen (`web/src/styles.css` tokens + build screen, `web/src/site.css` website pages). Picked from rendered mock-ups after the owner
  rejected three calm palettes as "like other vibe-coded UI": always show rendered mock-ups, not descriptions. Direction contract in
  `.impeccable/surfaces/web-index-html.md`; rules in `DESIGN.md`. References the owner likes: usebygga.com (build-screen usability).
- Available manuals (24 Nov 2026): `#/manuals` (`web/src/manuals.js`), linked in the header on every page, no sign-in needed.
  The library = guides with `public = 1` in the guides table, listed under its `title` and `article` columns. Manage it with
  `node scripts/library.mjs` (list | `add <id> --title "…" --article "…"` | `remove <id>` | `covers [id …]`, the last with
  `npm run dev` running). `/api/library` returns one card per guide (read from the guide file, cached until it changes) plus
  the example. Covers are JPEGs of the finished piece: `server/data/covers/<id>.jpg` (`/api/library/:id/cover.jpg`), the
  example's in `web/public/examples/bookcase-cover.jpg`. The original manual (PDF, page pictures and the guide's `manual`
  field) stays with the owner and admins, library or not (`manualViewable` in server/index.js).
- Build screen (17 Nov 2026): full height, no page scroll; top bar (logo, product, tabs Parts · Build n/N · Done, All parts drawer, ? help);
  3D stage left, step panel right with a fixed "Done, next step" bar (3D on top on phones). Step 0 = tick-off parts check (ticks in
  localStorage `bi-ticks-<id>`). `#progress [data-i]` strip is used by `scripts/xcheck.mjs`. Camera (Viewer.js): own wheel zoom toward
  the pointer with an eased glide (`zoomBy`, mouse/trackpad/pinch tuned), right/middle/Shift-drag pans, double-click centres (`centreOn`),
  limits from model size, `setInsets()` keeps the model clear of the stage controls, `setFinished()` for the Done view. Keys: ← → + − 0 R L.
  Part tags: one per board, placed per step on a spot the camera sees and clear of other boards (`anchorFor`); overlapping tags lift.
  Landing preview: `hideLoose` (boards still on the floor hidden unless the step works on them), `wideOnly` (whole piece every step).

## Guide format (summary; full spec in web/src/guide.js)
Millimetres. World axes: x = left→right, y = up from the floor, z = back(0)→front, finished piece seen from the front.
- `parts`: `{ "A": {name, qty, kind:"panel", size_mm:[x,y,z], look}, "101": {name, qty, kind:"dowel", look} }`
- `panels`: one per physical board: `{key, part, pos:[centre], rot:[deg], step}`. `step` = when it reaches its final place.
- `hardware`: one per physical piece: `{part, panel, at:[point on panel surface, panel coords], dir:"+x".."-z", step, turn_step?, roll?}`
- `holes`: extra pre-drilled holes `{panel, face, at, d}` (hardware holes are added automatically)
- `steps`: `{title, text, need:[[id, qty]], tip, warn, confidence, page}`. Step 0 (parts check) is implicit.
- `scene.wall_step`: shows a wall from that step (wall-fixing)
- Shaped parts (29 Oct 2026): a `panel` part may have `shape`: primitives `box` (with corner radius `r`), `cyl` (rod/taper),
  `tube` (bent tube along a path, centre line), `plate` (any outline, extruded), `sphere`; each with `mat`
  (wood/hardboard/metal/black/white/fabric/plastic) and `color`. `normalizeGuide` computes size_mm from the shape and
  re-centres it (moves pos and hardware `at` to match). Hardware on shaped parts is not snapped to a box face.
- More shapes (1 Nov 2026): `lathe` (profile spun round an axis), `shell` (thin dome), `sweep` (any cross-section along a path),
  `blades` (fan blades), `grille` (domed wire guard). Test guide: `server/data/guides/fantest.json`.
- Hardware kinds added (4 Nov 2026): `knob`, `foot`, `cap`; an unknown kind or "other" is read from the part's name
  (`KIND_WORDS` in guide.js). Hardware parts may have a `shape` (standing on the surface, +y out of it), e.g. drawer runners.
  The check gives an error for a part with no name and no kind, and a warning for fixings used in steps but never placed.
- Hardware kinds added: `allen_bolt`, `washer`, `nut`; hardware parts may have `len_mm` / `d_mm` (drawn to size, also in
  the actual-size view). A washer at the same panel/at/dir as a screw is stacked under its head.

## Models
- Manual reading: `claude-opus-5-5` (env `CLAUDE_MODEL`)
- Ask box: `claude-haiku-5-5` (env `CLAUDE_ASK_MODEL`)
- SDK: `@anthropic-ai/sdk` 0.60, `messages.stream` with base64 images. Three.js 0.160, Vite 5.
- Other models (4 Nov 2026): `server/ai.js` wraps Claude and any OpenAI-compatible API (Kimi, OpenRouter, Qwen).
  Set `SCAN_BASE_URL`, `SCAN_API_KEY`, `SCAN_MODEL` (optional `SCAN_REASONING`) to read manuals with it. Those models get no
  PDF `document` block: the 400 triggers the browser's PDF→JPEG fallback. Ask box stays on Haiku when a Claude key exists.
  Every call's tokens and price are logged and saved in the guide as `cost: {usd, calls:[{pass, model, input, cached, cacheWrite, output, usd, source}]}`
  (`source`: "provider" = OpenRouter's own charge, "estimate" = tokens × `PRICES` in server/ai.js; override with `SCAN_PRICE`).

## Known limit (27 Oct 2026)
First real scan was a desk fan (video, 14 frames). Step text was good; the 3D was useless because the format only
knows boxes (`panel`) plus furniture hardware. Round/domed/bladed parts (grilles, blade, motor) became boxes, and
joins like "slide onto shaft", "screw on a ring nut", "twist-lock onto base" can't be expressed. Fix options:
(a) keep scope to flat-pack and tell the user when a manual is not flat-pack; (b) add part shapes made of primitives
(cylinder, disc, ring, dome, blades, box) + axis-based joins. Steps 9–13 of the fan guide were usage, not assembly.

Chair test (29 Oct 2026): hand-made TR-92 guide (`server/data/guides/shapetest.json`) renders as a real chair.
Still missing: hinges, drawer runners, sliding-door rails, moving joints (swing/slide/fold), sub-assemblies.

## Next steps (in order)
1. Get the owner's real manual (photos per page are better than video) and run a scan. Compare the result step by step with the paper.
2. Fix accuracy, most likely in this order: prompt wording and examples in `server/prompt.js`; a two-pass pipeline
   (pass 1: parts and hardware inventory + step text; pass 2: 3D positions using pass 1 as fixed input);
   ~~a validation pass~~ (done 26 Oct 2026, `web/src/check.js` + repair pass; untested against real AI output); a review/edit UI to correct a guide by hand.
3. Optional: send the original manual page next to each step (`page` field) so users can compare.
4. Later: import manufacturer CAD data instead of estimating geometry from drawings (exact 3D).

## Conventions
- Plain JS (ES modules), no framework. Keep the guide format the single source of truth: viewer behaviour comes from data.
- UI copy: plain, short, active voice. Marker yellow (`--accent`) is reserved for "new in this step".
- Do not use IKEA branding or trace IKEA manual artwork in the product. Keep it brand-neutral.
- Test the 3D view with Playwright + `--use-gl=swiftshader` screenshots at a few steps (desktop 1280×860 and phone 390×844).
