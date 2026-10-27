# Buildwise

Scan a flat-pack furniture manual with your phone (or upload photos, a video or a PDF) and get a step-by-step 3D assembly guide:
real-looking boards with their hole patterns, hardware that animates into place, a parts bench
to match real parts against, and an actual-size view for screws.

## Run it

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env        # then paste your Claude API key into .env
npm run dev
```

- On the Mac: open **https://localhost:5173**
- On your phone (same Wi-Fi): open the **Network** address Vite prints, e.g. `https://192.168.1.23:5173`.
  The browser warns about the certificate the first time (it is a local, self-signed one). Accept it to continue.
  HTTPS is what lets the phone's live camera work.

The example bookcase guide works without an API key. Scanning and "Stuck on this step?" need one
(get it at https://console.anthropic.com).

## How it fits together

```
web/                     Vite front end (plain JS + Three.js)
  index.html
  src/main.js            screens and routing (#/guide/<id>)
  src/scan.js            live camera, photo/video upload, sends pages to the server
  src/build.js           build screen: step card, parts bench, "stuck?" box
  src/guide.js           the guide format + validation (shared with the server)
  src/check.js           automatic check: board overlaps, counts, hardware placement (shared with the server)
  src/viewer/Viewer.js   3D scene: floor layout, animations, camera framing, labels, tap-to-identify
  src/viewer/parts3d.js  3D models of boards and hardware (dowel, cam screw, cam lock, nail, ...)
  src/actualSize.js      true-size hardware drawings with bank-card calibration
  public/examples/bookcase.json
server/
  index.js               Express API: /api/analyze, /api/ask, /api/guides
  prompt.js              the instructions Claude gets with the manual photos
  data/guides/           saved guides (JSON, one file per scan)
scripts/make-example.mjs builds the example bookcase guide
scripts/check-guide.mjs  checks a guide file: node scripts/check-guide.mjs <guide.json>
```

### The guide format

Everything the 3D view shows comes from one JSON file (see `web/src/guide.js` for the full spec):

- `parts`: every part type with its label from the manual (`A`, `101`), count, kind and board size
- `panels`: each physical board and where it sits in the finished piece (mm, x right, y up, z back→front)
- `hardware`: each dowel, screw, cam lock or nail: which board it goes into, where, which way the hole faces, and in which step
- `holes`: extra pre-drilled holes that help tell boards apart
- `steps`: the plain-language instructions

The viewer works the rest out: laying boards flat on the floor for the parts check, the order things fly in,
camera angles, close-ups and labels. A guide can come from the AI scan, be written by hand, or be generated
from a manufacturer's CAD data.

## Settings (.env)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | | Your Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model that reads the manual |
| `CLAUDE_ASK_MODEL` | `claude-haiku-5-5` | Model for "Stuck on this step?" |
| `CHECK_REPAIR` | `1` | Second pass that fixes problems the automatic 3D check finds (`0` = off) |
| `PORT` | `8787` | API server port |

## Production

`npm run build` then `npm start` serves the built app and the API together on `PORT`.
