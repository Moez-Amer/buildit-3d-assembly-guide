
# Task: User feedback

Owner: Lasse · Branch: `task/user-feedback` · Worktree: `buildit-team`

## Goal
Allow users to rate their assembly experience and leave optional feedback after completing a guide.

## Files you may touch
- `web/src/build.js`
- `web/src/styles.css`

## Contracts to respect
- No changes to the guide format, API routes or database.
- Feedback is stored locally in the browser.

## Acceptance check
- Production build: passed.
- Example guide validation: passed.
- Star selection and optional comments: tested.
- Saving and editing ratings: tested.
- Persistence after page reload: tested.
- Skip functionality: tested.
- Desktop and mobile UI: tested.

## Handoff
Rating functionality transferred to the current team repository.
CSS merge conflict resolved while preserving existing scan styles.
Backend integration and central feedback collection are planned after the midterm.
