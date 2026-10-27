// The instruction that turns manual photos into a Buildwise guide.
export const ANALYZE_PROMPT = `These are the pages of the assembly manual for one product: photos, video frames, a PDF, or a mix. Photos may be out of order, blurry, cropped or repeated. A PDF is the cleanest source: prefer it when the same page appears in both.

Your job: turn the manual into a 3D assembly guide in the JSON format below. Accuracy matters more than completeness. A wrong instruction is worse than a missing one.

READING THE MANUAL
- Follow the manual's own order. Merge repeated pages. Do not invent steps, parts or hardware that the manual does not show.
- Use the manual's own labels as part ids: letters or numbers for boards, the printed numbers (e.g. "101352") for hardware. If none are printed, use short ids (A, B, 1, 2).
- Count hardware from the hardware page (usually page 2-3), not from guessing.
- One guide step per numbered manual step. If a manual step does several things to different boards, you may split it.

WRITING THE STEPS
- "text": 1 to 3 short sentences in everyday words. Say exactly what to do, which way parts face (finished edge, holes up, arrow toward the edge) and how many fixings.
- "tip": the most common mistake for that step, or null. "warn": safety only (two people, wall fixing, heavy, sharp), or null.
- "need": parts taken in that step as [[id, qty]].
- "confidence": "high" if the drawing is clear, "medium" if partly guessed, "low" if hard to read. "page": the manual page number if printed; for a PDF, the PDF page number if none is printed; else null.

3D LAYOUT (millimetres)
World axes: x = left to right, y = up from the floor, z = back (0) to front, for the FINISHED piece seen from the front.
- "panels": one entry per physical board, also for identical boards (give each its own "key", e.g. "A1","A2"). "pos" is the centre of the board in the finished piece. "rot" is rotation in degrees, usually [0,0,0]: set "size_mm" on the part so that [x-size, y-size, z-size] already matches how the board sits in the finished piece. "step" is the step where the board goes into its final position (before that it lies on the floor).
- Typical sizes: boards 12–18 mm thick, back panels 3 mm. Read real sizes from any dimensions printed in the manual; otherwise estimate from proportions in the drawings. Keep everything consistent so the boards touch where they join.
- "hardware": one entry per physical piece of hardware that goes into a board. "panel" is the key of the board it goes INTO first. "at" is the point on that board's surface where it goes in, in the board's own coordinates (origin at the board centre, same axes as the world when rot is [0,0,0]). "dir" is the direction the hole faces, out of the board ("+x","-x","+y","-y","+z","-z"). "step" is when it goes in. For cam locks add "turn_step" (when they are tightened) and "roll": 0 if the cam's arrow points toward the board's -x end when dir is "+y", 180 for the +x end. Screws that join two boards: put them in the board they pass through first.
- "holes": optional extra pre-drilled holes that matter for identifying a board (e.g. shelf-pin rows), as {panel, face, at, d}.
- Hardware kinds: dowel, cam_screw (the pin that a cam lock grabs), cam_lock, nail, shelf_pin, screw, bolt, bracket, other.
- If the piece needs fixing to a wall, set "scene": {"wall_step": <that step>}.

List anything you could not read in "unclear".

Reply with ONLY this JSON, no other text:
{"product":"name and article number if printed","summary":"one sentence","people":1,"time_minutes":45,"tools":["Phillips screwdriver"],
"scene":{"wall_step":null},
"parts":{"A":{"name":"Side panel","qty":2,"kind":"panel","size_mm":[18,1000,280],"look":"how to recognise it: holes, edges, size compared with others"},
         "101":{"name":"Wooden dowel","qty":8,"kind":"dowel","look":"short wooden peg"}},
"panels":[{"key":"A1","part":"A","pos":[9,500,140],"rot":[0,0,0],"step":3}],
"hardware":[{"part":"101","panel":"A1","at":[9,49,140],"dir":"+x","step":1}],
"holes":[],
"steps":[{"title":"Short imperative title","text":"...","need":[["A",1],["101",4]],"tip":null,"warn":null,"confidence":"high","page":4}],
"unclear":[]}`;

export const ASK_PROMPT = (ctx, q) => `Someone is assembling flat-pack furniture and is stuck. Answer their question in 2 to 4 short, plain sentences. Be practical. If the answer depends on what the paper manual shows, say what to look for in the drawing. If it is a safety question, be cautious.

Guide context:
${JSON.stringify(ctx)}

Question: ${q}`;

// Second pass: the automatic check (web/src/check.js) found problems in the first answer.
export const REPAIR_PROMPT = issueLines => `An automatic check of your guide found these problems in the 3D layout or the counts:

${issueLines.map(l => `- ${l}`).join('\n')}

Look at the manual photos again and fix them. Rules:
- The manual is the truth. Fix positions, sizes, directions and counts so the 3D model matches the drawings.
- Do not change steps, text or parts that the problems do not touch.
- If a problem comes from something the manual really shows (e.g. a spare part), leave it and say so in "unclear".
- If you cannot tell from the photos how to fix something, leave it and add a short note to "unclear".

Reply with ONLY the complete corrected guide JSON, in the same format as before.`;
