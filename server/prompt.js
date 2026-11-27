// The instruction that turns manual photos into a Buildit guide.
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
- Joints instead of arithmetic (the code then works out the exact numbers, so parts touch and line up):
  - A board that sits against another board: add "attach":{"to":"<other key>","face":"+y","x":"start","z":"end"}. "to" is the board it really rests on or is fixed to; prefer the larger board (a top attaches to the side panels' frame, not to one post). "face" is the face of the OTHER board it sits on ("+y" = on top of it, "-x" = against its left side). For the other axes give an alignment only where the drawing shows flush edges: "start" = low edges flush (left, bottom, back), "end" = high edges flush, "center", or a number = mm from the other board's low edge to this board's low edge. Leave an axis out to keep your "pos" there. Always give "pos" too, as your best estimate: if the joint does not fit, "pos" is used.
  - A row of identical fixings: one entry with "at" (the first), "to" (the last) and "n" (how many, evenly spaced), e.g. 3 dowels along an edge.
  - Cam locks go in the broad face of the board, on the line of the cam screw that comes from the other board, about 20–25 mm from the edge. Give "at" and "dir" as usual; the code moves a lock onto its cam screw's line when it is close.
- One panel for every board as it comes in the box. Never draw an assembly the user builds (a drawer, a frame, a carcass) as one part: give each of its boards its own part and panel, so the steps that join them can be shown.
- Where the manual builds something in another position than it ends up in (side frames lying flat on the floor, the carcass on its back or front, a drawer upside down), add a group: "groups":[{"key":"carcass","panels":["A1","A2","B1","C1"],"until":12,"rot":[-90,0,0]}]. "panels" = the boards built together that way, "until" = the step where the manual stands it up or turns it into its final position, "rot" = how the whole group is turned from its final position while it is built (degrees about x, y, z: [-90,0,0] = lying on its back with the front facing up, [90,0,0] = lying on its front, [0,0,90] = lying on its side). The group lies on the floor; a board's "step" is when it is first fitted to the group. A board can be in a later group too (a side frame first, then the carcass). Use this whenever the manual's drawings show the work lying down.
- "holes": optional extra pre-drilled holes that matter for identifying a board (e.g. shelf-pin rows), as {panel, face, at, d}.
- Hardware kinds: dowel, cam_screw (the pin that a cam lock grabs), cam_lock, nail, shelf_pin, screw (wood screw, cross head), bolt (hex head), allen_bolt (bolt with a hex socket for an Allen key), washer, nut, bracket, knob (drawer or door knob), foot (adjustable or glide foot), cap (cover cap, end cap), other (tools such as an Allen key, and anything else).
- Every part in the hardware list gets a "name", a "kind" and its "qty". Every fixing that goes into the furniture is placed in "hardware" (one entry per piece), even when there are many.
- Hardware that none of the kinds fits well (drawer runners, hinges, rails, clips, end caps with a special form): use kind "other" or the closest kind and add a "shape", made of the same pieces as below, drawn standing on the surface it goes into: origin at the point "at", +y pointing out of the surface (the way "dir" points). Example, a 450 mm drawer runner lying on a side panel: {"kind":"other","shape":[{"type":"box","at":[0,6,0],"size":[12,12,450],"mat":"metal"}]}.
- Hardware sizes: give "len_mm" (shaft length, without the head) and "d_mm" (thread diameter; outer diameter for a washer) when the manual prints them (e.g. "M6x40") or shows the part at actual size. Measure actual-size drawings. If two fixings differ only in length, their len_mm must differ.
- Hardware that is not the usual colour gets "material" (and "color" if needed): a plastic push-in dowel {"kind":"dowel","material":"plastic"}, a black screw "black", a white cap "white". Without it dowels are wood and fittings are bright metal.
- A washer under a screw or bolt head: give the washer and the screw the same "panel", "at" and "dir". The viewer stacks the head on the washer.

PARTS THAT ARE NOT FLAT BOARDS (chairs, tables with metal legs, frames, cushions, round parts)
Every solid part that is not hardware has kind "panel". A plain box (size_mm only) is right ONLY for flat rectangular boards. Every other part MUST have a "shape": cushions, seats and backrests, star bases, wheels and castors, cylinders and posts, legs, frames, mechanisms, covers, anything round or curved. Give it a "shape": a list of simple pieces in the part's own coordinates (mm, same axes as the world when rot is [0,0,0]). Then "size_mm" is worked out from the shape, and "pos" is where the point [0,0,0] of the shape sits in the finished piece. Hardware "at" on such a part is a point on the surface of one of its pieces (not snapped to a box face).
Pieces:
- {"type":"tube","path":[[x,y,z],...],"d":25,"bend":30,"square":false}: a metal tube or bar along a path of points (the centre line of the tube, so feet standing on the floor are at y = d/2), with rounded bends of radius "bend". Use for bent leg frames, chair legs, rails, handles. "square":true for square tubes.
- {"type":"cyl","from":[x,y,z],"to":[x,y,z],"d":40,"d2":30}: a straight round rod, leg, post or disc ("d2" = diameter at the "to" end, for tapered legs; omit if straight).
- {"type":"box","at":[x,y,z],"size":[x,y,z],"rot":[0,0,0],"r":25}: a block; "r" rounds its edges (seat cushions, padded backs, plastic shells).
- {"type":"plate","plane":"xy"|"xz"|"yz","outline":[[u,v],...],"thick":18,"at":[x,y,z],"r":0}: a flat part with any outline (curved board, round table top, shaped side, L-bracket). For "xz" u = x and v = z, the thickness is along y; for "xy" thickness is along z; for "yz" u = y, v = z, thickness along x. Approximate curves with enough points (about one every 20 mm). "holes": openings cut through it, each an outline in the same u,v (the head opening and shoulder slots of a racing backrest, a handle cut-out, a finger hole in a drawer front). "r" rounds the edges: with r about a third of the thickness it becomes a padded part. Use it for anything upholstered whose outline is not a rectangle: trace the outline from the drawing (a racing backrest with shoulder wings and a narrower waist, a contoured seat, a curved armrest seen from the side in "yz").
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

WHOSE MANUAL, WHICH PIECE
- "company": the company that makes or sells the piece, as printed in the manual (cover, back page, logo, small print), e.g. "IKEA", "SONGMICS". Only a name you can read; never guess it from the drawing style or the type of furniture. Not printed: null.
- "furniture": the piece's own name and what it is, as printed, e.g. "HEMNES chest of 8 drawers", "OBG77 office chair". No product name printed: say what it is in plain words ("bookcase with 3 shelves"). Leave out the company and the article number.
- "product" stays the short title shown to the person: the furniture name plus the article number if printed.

Reply with ONLY this JSON, no other text:
{"product":"name and article number if printed","company":"maker as printed, or null","furniture":"its own name and what it is","summary":"one sentence","people":1,"time_minutes":45,"tools":["Phillips screwdriver"],
"scene":{"wall_step":null},
"parts":{"A":{"name":"Side panel","qty":2,"kind":"panel","size_mm":[18,1000,280],"look":"how to recognise it: holes, edges, size compared with others"},
         "B":{"name":"Bottom","qty":1,"kind":"panel","size_mm":[564,18,280],"look":"..."},
         "101":{"name":"Wooden dowel","qty":8,"kind":"dowel","look":"short wooden peg","len_mm":30,"d_mm":8},
         "110":{"name":"Cam lock","qty":4,"kind":"cam_lock","look":"round metal cam with an arrow"}},
"panels":[{"key":"A1","part":"A","pos":[9,500,140],"rot":[0,0,0],"step":3,"into":[]},
          {"key":"B1","part":"B","pos":[300,9,140],"rot":[0,0,0],"step":3,"attach":{"to":"A1","face":"+x","y":"start","z":"center"}}],
"hardware":[{"part":"101","panel":"A1","at":[9,-491,-100],"to":[9,-491,100],"n":3,"dir":"+x","step":1},
            {"part":"110","panel":"B1","at":[-262,9,0],"dir":"+y","step":4,"turn_step":4}],
"holes":[],
"groups":[],
"steps":[{"title":"Short imperative title","text":"...","need":[["A",1],["101",4]],"tip":null,"warn":null,"confidence":"high","page":4}],
"unclear":[]}`;

export const ASK_PROMPT = (ctx, q) => `Someone is assembling flat-pack furniture and is stuck. Answer their question in 2 to 4 short, plain sentences. Be practical. If the answer depends on what the paper manual shows, say what to look for in the drawing. If it is a safety question, be cautious.

Guide context:
${JSON.stringify(ctx)}

Question: ${q}`;

// How the repair and compare passes answer: only the changes, applied by web/src/edits.js.
const EDITS = `Reply with ONLY a JSON object listing the changes, not the whole guide:
{"edits":[
 {"panel":"B1","set":{"pos":[0,480,80]}},
 {"panel":"C1","set":{"attach":{"to":"A1","face":"+y","x":"start"}}},
 {"hardware":"B1-S100-0","set":{"dir":"+y"}},
 {"part":"C","set":{"shape":[ ...pieces as described in the first message... ]}},
 {"step":4,"set":{"need":[["A",1],["101",4]]}},
 {"add":"hardware","value":{"part":"101","panel":"A1","at":[9,49,140],"dir":"+x","step":1}},
 {"remove":"hardware","key":"G1-S100-4"},
 {"unclear":"short note for the reader"}
]}
Use the keys exactly as they appear in the guide above (panels and hardware have a "key"). "set" replaces only the fields you give. Positions are in the same coordinates as before.`;

// Second pass: the automatic check (web/src/check.js) found problems in the first answer.
export const REPAIR_PROMPT = issueLines => `This is your guide after an automatic clean-up. The automatic check still finds these problems in the 3D layout or the counts (keys in brackets):

${issueLines.map(l => `- ${l}`).join('\n')}

Look at the manual photos again and fix them. Rules:
- The manual is the truth. Fix positions, sizes, directions and counts so the 3D model matches the drawings.
- Do not change steps, text or parts that the problems do not touch.
- If a problem comes from something the manual really shows (e.g. a spare part), leave it and say so in "unclear".
- Parts that pass through each other: move or resize them so they only touch. If one really goes inside the other (a pole in a socket, a shaft in a hub, a shaft through a guard's centre), keep it and add "into": ["<other key>"] to the panel that goes in, or give the guard a "hole".
- A screw or bolt that "points at" another part is the wrong way round: "dir" is the side its head is on, and it goes in the opposite way.
- If you cannot tell from the photos how to fix something, leave it and add a short note with {"unclear": ...}.

${EDITS}`;

// Third pass: pictures of the 3D model next to the manual, so the model can see what does not look right.
export const COMPARE_INTRO = 'Here is how your guide looks in the 3D viewer. Black tags show part ids; parts that are new in a step glow yellow.';
export const COMPARE_PROMPT = `Compare these pictures with the manual drawings, part by part and step by step. Look for:
- parts whose shape does not look like the drawing: outline, curves, proportions, the number of legs, blades, spokes or rings, how domed or bent a part is
- parts in the wrong place, the wrong way round or upside down
- parts missing from the model, or extra ones
Ask for every part: would someone holding the real part recognise it from this picture? Common misses: a padded seat or backrest drawn as a flat slab (no side bolsters, no wings, no openings), a racing backrest without its head opening, a star base with straight square bars instead of tapered arms, a footrest frame drawn as a box, a drawer drawn as one block. A model that only roughly fits is not good enough for those.
Fix what clearly differs, using the shape pieces described in the first message. Do not change steps, text or counts unless the pictures show they are wrong. Small differences in exact size do not matter.

If the model already matches the drawings well enough, reply with exactly NO_CHANGES. Otherwise:
${EDITS}`;
