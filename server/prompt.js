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
- Hardware kinds: dowel, cam_screw (the pin that a cam lock grabs), cam_lock, nail, shelf_pin, screw (wood screw, cross head), bolt (hex head), allen_bolt (bolt with a hex socket for an Allen key), washer, nut, bracket, other.
- Hardware sizes: give "len_mm" (shaft length, without the head) and "d_mm" (thread diameter; outer diameter for a washer) when the manual prints them (e.g. "M6x40") or shows the part at actual size. Measure actual-size drawings. If two fixings differ only in length, their len_mm must differ.
- A washer under a screw or bolt head: give the washer and the screw the same "panel", "at" and "dir". The viewer stacks the head on the washer.

PARTS THAT ARE NOT FLAT BOARDS (chairs, tables with metal legs, frames, cushions, round parts)
Every solid part that is not hardware has kind "panel". A plain box (size_mm only) is right ONLY for flat rectangular boards. Every other part MUST have a "shape": cushions, seats and backrests, star bases, wheels and castors, cylinders and posts, legs, frames, mechanisms, covers, anything round or curved. Give it a "shape": a list of simple pieces in the part's own coordinates (mm, same axes as the world when rot is [0,0,0]). Then "size_mm" is worked out from the shape, and "pos" is where the point [0,0,0] of the shape sits in the finished piece. Hardware "at" on such a part is a point on the surface of one of its pieces (not snapped to a box face).
Pieces:
- {"type":"tube","path":[[x,y,z],...],"d":25,"bend":30,"square":false}: a metal tube or bar along a path of points (the centre line of the tube, so feet standing on the floor are at y = d/2), with rounded bends of radius "bend". Use for bent leg frames, chair legs, rails, handles. "square":true for square tubes.
- {"type":"cyl","from":[x,y,z],"to":[x,y,z],"d":40,"d2":30}: a straight round rod, leg, post or disc ("d2" = diameter at the "to" end, for tapered legs; omit if straight).
- {"type":"box","at":[x,y,z],"size":[x,y,z],"rot":[0,0,0],"r":25}: a block; "r" rounds its edges (seat cushions, padded backs, plastic shells).
- {"type":"plate","plane":"xy"|"xz"|"yz","outline":[[u,v],...],"thick":18,"at":[x,y,z],"r":0}: a flat part with any outline (curved board, round table top, shaped side, L-bracket). For "xz" u = x and v = z, the thickness is along y; for "xy" thickness is along z; for "yz" u = y, v = z, thickness along x. Approximate curves with enough points (about one every 20 mm). "r" rounds the edges: with r about a third of the thickness it becomes a padded part. Use it for anything upholstered whose outline is not a rectangle: trace the outline from the drawing (a racing backrest with shoulder wings and a narrower waist, a contoured seat, a curved armrest seen from the side in "yz").
- {"type":"sphere","at":[x,y,z],"d":30}: knobs, ball feet.
- {"type":"lathe","at":[x,y,z],"axis":"+y","profile":[[r,h],...]}: any round body: the outline (radius r at height h along the axis, from "at") spun around the axis. Turned legs, bases, knobs, hubs, motor housings, lamp shades, bowls. Trace the drawn silhouette with 5–15 points.
- {"type":"shell","at":[x,y,z],"axis":"+z","d":300,"depth":40,"thick":2}: a thin dome; the rim circle is centred at "at", the dome bulges "depth" mm along the axis. Covers, caps, round seat shells.
- {"type":"sweep","path":[[x,y,z],...],"profile":[[u,v],...],"bend":30,"up":"+y"}: any cross-section (mm, centred on the path; v points toward "up") pulled along a path with rounded bends. Curved armrests, bent plywood, flat bars, handles.
- {"type":"blades","at":[x,y,z],"axis":"+z","n":3,"d":340,"hub":60,"width":140,"pitch":25,"sweep":20}: fan or propeller blades round a hub; d = tip-to-tip diameter, width = widest blade width, pitch = blade tilt in degrees, sweep = how far the tips curve back.
- {"type":"grille","at":[x,y,z],"axis":"+z","d":380,"depth":50,"rings":6,"spokes":40,"wire":2,"twist":0,"hole":0}: a round wire guard; the rim circle is centred at "at" and the middle bulges "depth" mm along the axis. Count the rings and spokes in the drawing; twist (degrees) makes spiral spokes; "hole" = diameter of an open centre (a rear guard that a motor shaft goes through).
"axis" is "+x".."-z" (or [x,y,z]): the direction the part points or bulges. Prefer these pieces to building round things from boxes, and copy proportions from the drawing (blade count, how domed a guard is, where a body is widest).
Parts must not pass through each other: blades sit between the guards with room to turn, a guard clears the motor. Where one part really goes inside another (a pole in a socket, a shaft in a blade hub, a tube leg in a plastic foot, a cap screwed onto a hub), add "into": ["<key of the other panel>"] to the panel that goes in; the automatic check then accepts that overlap.
Each piece may have "mat": wood, hardboard, metal (bare or chrome), black (black-painted metal), white, fabric (upholstery), plastic; and "color": "#rrggbb". Set "material" on the part for the default.
Line drawings show no colours: give all upholstered parts of one product the same material and colour unless the manual shows otherwise.
Attach each part where the drawing shows its fixings go in (e.g. an armrest bolted to both the backrest and the seat is joined to both).
Model the real silhouette a person would recognise: the number of legs, where they splay, how a frame bends, where the back rises, the shape of a blade. A seat shell with a backrest is two rounded boxes (seat and back, the back tilted with "rot"), not one flat pad. Do not leave parts out of the 3D model because they are curved.
Example: a bent leg frame (two legs joined by a top bar, 25 mm tube) seen from the front: {"kind":"panel","material":"black","shape":[{"type":"tube","d":25,"bend":30,"path":[[-230,0,20],[-200,430,0],[200,430,0],[230,0,20]]}]}
Example: an office chair castor (twin wheel with a pin on top): {"kind":"panel","material":"black","shape":[{"type":"cyl","from":[-18,25,0],"to":[18,25,0],"d":50},{"type":"box","at":[0,55,0],"size":[30,20,30],"r":6},{"type":"cyl","from":[0,65,0],"to":[0,85,0],"d":11,"mat":"metal"}]}
Example: a racing-style backrest, 560 wide and 820 tall, 90 thick, seen from the front: {"kind":"panel","material":"fabric","shape":[{"type":"plate","plane":"xy","thick":90,"r":30,"at":[0,0,0],"outline":[[-200,0],[200,0],[230,120],[250,420],[280,560],[240,700],[150,800],[-150,800],[-240,700],[-280,560],[-250,420],[-230,120]]}]}
Example: a five-star base: five box arms ("rot" turns each one 72° further about y) round a lathe hub with a socket.
Example: a round fan base, 260 mm across, 40 mm high, with a socket: {"kind":"panel","material":"white","shape":[{"type":"lathe","at":[0,0,0],"axis":"+y","profile":[[130,0],[130,14],[118,30],[30,40],[18,40]]}]}
- If the piece needs fixing to a wall, set "scene": {"wall_step": <that step>}.

List anything you could not read in "unclear".

Reply with ONLY this JSON, no other text:
{"product":"name and article number if printed","summary":"one sentence","people":1,"time_minutes":45,"tools":["Phillips screwdriver"],
"scene":{"wall_step":null},
"parts":{"A":{"name":"Side panel","qty":2,"kind":"panel","size_mm":[18,1000,280],"look":"how to recognise it: holes, edges, size compared with others"},
         "101":{"name":"Wooden dowel","qty":8,"kind":"dowel","look":"short wooden peg","len_mm":30,"d_mm":8}},
"panels":[{"key":"A1","part":"A","pos":[9,500,140],"rot":[0,0,0],"step":3,"into":[]}],
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
- Parts that pass through each other: move or resize them so they only touch. If one really goes inside the other (a pole in a socket, a shaft in a hub, a shaft through a guard's centre), keep it and add "into": ["<other key>"] to the panel that goes in, or give the guard a "hole".
- If you cannot tell from the photos how to fix something, leave it and add a short note to "unclear".

Reply with ONLY the complete corrected guide JSON, in the same format as before.`;

// Third pass: pictures of the 3D model next to the manual, so Claude can see what does not look right.
export const COMPARE_INTRO = 'Here is how your guide looks in the 3D viewer. Black tags show part ids; parts that are new in a step glow yellow.';
export const COMPARE_PROMPT = `Compare these pictures with the manual drawings, part by part and step by step. Look for:
- parts whose shape does not look like the drawing: outline, curves, proportions, the number of legs, blades, spokes or rings, how domed or bent a part is
- parts in the wrong place, the wrong way round or upside down
- parts missing from the model, or extra ones
Fix what clearly differs, using the shape pieces described in the first message. Do not change steps, text or counts unless the pictures show they are wrong. Small differences in exact size do not matter.

If the model already matches the drawings well enough, reply with exactly NO_CHANGES. Otherwise reply with ONLY the complete corrected guide JSON, in the same format as before.`;
