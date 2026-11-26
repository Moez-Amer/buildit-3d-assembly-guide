
# Task: Furniture dimensions

Owner: Lasse · Branch: `task/furniture-dimensions` · Worktree: `buildit-team`

## Goal
Show estimated furniture dimensions, space projections and required tools during guide generation and on the parts checklist.

## Files you may touch
- `server/index.js`
- `web/index.html`
- `web/src/build.js`
- `web/src/scan.js`
- `web/src/furnitureDimensions.js`

## Contracts to respect
- No changes to the guide format, API routes or database.
- Dimensions are estimates based on the generated 3D model.

## Acceptance check
- Production build: passed.
- Example guide validation: passed.
- Furniture dimensions on the example guide: verified.
- Animation controls: still working.
- Desktop and mobile screenshots.

## Handoff
Implemented and tested with an IKEA KALLAX manual on the previous branch.
Tools and dimensions appeared after 70 seconds, with guide generation completed after 80 seconds.
Transferred to the current team repository via cherry-pick.
Final streaming test on the current team version remains open.
