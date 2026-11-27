---
name: Buildit
description: Your paper flat-pack manual as a 3D guide you can turn, zoom and tick off. Printed on the side of the box.
colors:
  kraft: "#E2C9A7"
  kraft-ink: "#3E3325"
  label-white: "#FFFFFF"
  label-stock: "#F6F3EC"
  label-stock-deep: "#EDE7DB"
  print-black: "#171512"
  print-black-soft: "#2E2A24"
  print-cream: "#F3E7D3"
  muted-ink: "#5F584D"
  label-rule: "#E6E1D6"
  perforation: "#CFC8BA"
  control-line: "#D7D0C2"
  progress-done: "#8F8778"
  logo-yellow: "#FFC400"
  marker-yellow: "#FFC21A"
  marker-ink: "#2A1E00"
  board-wood: "#D6B98E"
  board-edge: "#2A2520"
  doubt-red: "#B3261E"
  doubt-red-wash: "#FCE8E6"
  read-clearly-green: "#1E7A46"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(44px, min(6.2vw, 10.5vh), 84px)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.045em"
    fontVariation: "'wdth' 92"
  headline:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(34px, 4.6vw, 60px)"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 92"
  step-number:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "72px"
    fontWeight: 650
    lineHeight: 0.9
    letterSpacing: "-0.05em"
    fontVariation: "'wdth' 88"
    fontFeature: "tnum"
  title:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 92"
  title-small:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-instruction:
    fontFamily: "Atkinson Hyperlegible, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
  list-heading:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
  mono-meta:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
rounded:
  tick: "3px"
  sm: "4px"
  md: "6px"
  sheet-top: "10px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  label-pad: "30px 24px 24px"
  page-gutter: "max(clamp(16px, 5vw, 56px), calc((100% - 1280px) / 2))"
components:
  button-primary:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.print-black-soft}"
    textColor: "{colors.label-white}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.print-black}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 20px"
    height: "48px"
  button-next-step:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "56px"
  tool-button:
    backgroundColor: "{colors.label-white}"
    textColor: "{colors.print-black}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  tool-button-pressed:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.print-black}"
    padding: "0 16px"
    height: "40px"
  tab-current:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
  label-card:
    backgroundColor: "{colors.label-white}"
    textColor: "{colors.print-black}"
    rounded: "{rounded.md}"
    padding: "{spacing.label-pad}"
  field:
    backgroundColor: "{colors.label-white}"
    textColor: "{colors.print-black}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "52px"
  part-number:
    backgroundColor: "transparent"
    textColor: "{colors.print-black}"
    typography: "{typography.mono}"
    rounded: "{rounded.tick}"
    padding: "4px 6px"
  part-label-3d:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  part-label-3d-new:
    backgroundColor: "{colors.marker-yellow}"
    textColor: "{colors.marker-ink}"
  coach-mark:
    backgroundColor: "{colors.print-black}"
    textColor: "{colors.label-white}"
    rounded: "{rounded.md}"
    padding: "10px 40px 10px 14px"
  stage-3d:
    backgroundColor: "{colors.label-stock}"
    rounded: "{rounded.md}"
---

# Design System: Buildit

## Overview

**Creative North Star: "Box & Label"**

The page is the flat-pack box itself. Kraft cardboard with a faint printed dot screen is the ground of every screen, the website and the build screen alike. Anything a person reads closely sits on a white box-sticker label with a millimetre ruler printed along its top edge; everything else is printed straight onto the kraft in black. The 3D model sits on label stock, the off-white of the sticker paper, and is the only picture in the system.

The world is calm and factual, the way a good packing slip is: black print, dashed perforations between rows, part numbers in a monospaced face exactly like the stamp on a fitting bag. Density stays moderate on the website and rises on the build screen, where the 3D stage and a step label share one full-height view. It refuses two things the user rejected outright: the cream-card-and-pill default of generated sites, and the earlier loud yellow tool brand. Yellow survives only in the logo disc and as the 3D marker for "new in this step".

There is one world for every route. The build screen is not a separate app skin: its top bar is printed on the kraft, its 3D stage is a stock-coloured label, and its step panel is a white label with the next-step bar fixed at its foot.

**Key Characteristics:**
- Kraft ground (with a 5px dot screen) under every page; white labels for content that is read; black print for text and primary actions.
- A millimetre ruler (1, 5 and 10 mm ticks) along the top edge of every label, sheet and the 3D stage.
- Dashed perforation lines divide rows inside labels; a solid black rule marks a stronger break.
- Archivo 650 at 92% width for headings, sentence case; Atkinson Hyperlegible for reading; JetBrains Mono only for part numbers, counts, sizes and step counts.
- Square-ish corners: 4px controls, 6px labels, 3px stamps.
- Yellow means "new in this step" (and the logo). Red means "may be wrong", an error, or a destructive action. Nothing else.

## Colors

Cardboard, sticker paper and black print, with two signal colours kept on a very short leash.

### Primary
- **Print Black** (#171512): all text, primary buttons, current tab, pressed tool buttons, part-number stamps, 3D part labels, the coach mark and help popover, the landing closer and footer. It is the brand colour in practice.
- **Kraft** (#E2C9A7): the ground of every page, always with the printed dot screen (`radial-gradient(rgba(90,60,20,.075) 1px, transparent 1.25px)` at 5px). On the black closer it inverts into the primary button fill.

### Secondary
- **Marker Yellow** (#FFC21A, ink #2A1E00): in the 3D view only: ghost outlines, the pulse on new parts, and the part labels of parts that are new in this step, plus the small legend swatch that explains it.
- **Logo Yellow** (#FFC400): the disc in the allen-key logo, nowhere else.

### Tertiary
- **Doubt Red** (#B3261E, wash #FCE8E6): the dashed "3D view may be wrong in this step" box, field errors, the "Draft" stamp on legal pages, the delete-guide hover and the sign-out menu item.
- **Read-clearly Green** (#1E7A46): only the 8px confidence dot for a step read clearly from the manual.

### Neutral
- **Label White** (#FFFFFF): label cards, the step panel, sheets, menus, fields, tool buttons.
- **Label Stock** (#F6F3EC) and **Stock Deep** (#EDE7DB): the 3D stage, image wells behind part pictures, tip callouts, notices; Stock Deep for unfilled progress segments.
- **Kraft Ink** (#3E3325): secondary text printed directly on the kraft (fine print, step descriptions on the box side, FAQ answers), where Muted Ink would be too weak.
- **Muted Ink** (#5F584D): secondary text on white labels.
- **Perforation** (#CFC8BA): dashed row dividers inside labels; **Label Rule** (#E6E1D6) for quiet solid borders; **Control Line** (#D7D0C2) for field and tool-button outlines at rest. On the kraft, dividers use print black at 32% (`rgba(23,21,18,.32)`).
- **Progress Done** (#8F8778): finished segments of the step strip.
- **Print Cream** (#F3E7D3): text, outlines and links on black (closer, footer, text selection).
- **Board Wood** (#D6B98E) and **Board Edge** (#2A2520): fed to the 3D viewer for board faces and edges; not UI colours.

### Named Rules
**The Marker Rule.** Yellow means "new in this step" in the 3D view, and appears otherwise only in the logo disc. Never a button, a highlight, a badge or a section fill.

**The Doubt Rule.** Red is for "may be wrong", errors and destructive actions only. A safety warning is a black-outlined callout, not red; red is honesty about the app, not alarm about the furniture.

**The Print Rule.** Text on kraft is print black or kraft ink, never grey-on-brown; anything long enough to need muted text belongs on a white label.

## Typography

**Display Font:** Archivo Variable (with Archivo, Helvetica Neue, Arial)
**Body Font:** Atkinson Hyperlegible (with system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo)

**Character:** A slightly condensed, firm grotesque printed in sentence case, like the product name on a carton, over a body face built for legibility at arm's length on a phone on the floor. The mono is the parts stamp.

### Hierarchy
- **Display** (650, 92% width, clamp 44–84px, 0.98): the landing hero headline only.
- **Headline** (650, clamp 34–60px, 1.0): landing section headings; sign-in and message pages use a smaller page title (clamp 32–44px).
- **Step Number** (650, 88% width, 72px, 52px on phones, tabular): the big step count printed on the 3D stage, with "/ 9" in mono beside it. The landing "How it works" steps use small ink squares (26px, mono numeral) before each title instead.
- **Title** (650, 30px; 25px on phones): the step title. Label and sheet headings sit at 22–26px.
- **Body** (400, 16px/1.5): everything read. Step instructions are 18px/1.5 (17px on phones) with a 60ch measure; landing leads clamp 17–19px with a 32em measure.
- **Label** (600 Archivo, 13–17px): buttons, tabs, part names, menu items, form labels.
- **List heading** (700, 12px, 0.08em, uppercase, muted): heads a list inside a label ("Boards 7", "Fittings 57") with its count in mono on the right. It names the list below it; it never sits above a heading.
- **Mono** (500–700, 11–17px): part numbers in stamps, counts ("2×"), sizes ("1000 × 280 × 18 mm"), step counts, the box-label fact sheet, key caps.

### Named Rules
**The Stamp Rule.** JetBrains Mono is only for part numbers, counts, sizes and step counts (and keyboard keys). Never for headings, buttons or prose.

**The No-Eyebrow Rule.** Nothing small sits above a heading to introduce it. A heading starts its block.

**The Sentence Case Rule.** Headings and buttons are sentence case. Uppercase is limited to the tiny stamps ("Example", "Soon", "Draft") and list headings.

## Layout

The page gutter is `max(clamp(16px, 5vw, 56px), (100% − 1280px) / 2)`: content stays within 1280px and the kraft runs edge to edge. Landing bands breathe at clamp(40–80px) vertical padding; sections switch from one column to two at 960px (hero 1.04fr / 0.96fr, honesty 1fr / 1fr, pricing and questions 0.8fr / 1.2fr). The hero's box label (360px) overlaps the lower right of the live model on desktop and tucks under it on phones. My guides is 1.15fr / 0.85fr from 900px with a sticky side column. Sign-in and messages use a single 520px label.

The build screen is full height (100dvh) with no page header or footer: a top bar printed on the kraft (logo home, product name and mono meta, centred Parts · Build n/N · Done tabs, All parts and ? on the right), then the 3D stage (1.6fr) beside the step label (min 360px, 1fr) with 12px gaps. The step label scrolls inside; its next-step bar is fixed at the foot behind a dashed perforation. Below 960px the tabs drop to a full-width second row and the stage stacks over the step at 44 / 56 of the height; phones held sideways go back to side by side.

Spacing steps through 6, 10, 14, 18 and 24px inside labels; labels pad 30px on top (room for the ruler) and 24px on the sides.

## Elevation & Depth

Labels are stickers on cardboard: one soft, warm shadow lifts them barely off the kraft. Floating things (menus, sheets, the info popover, the coach mark, the help popover) take a deeper, softer drop. There are no hard offset shadows and no glows; depth comes from white-on-kraft first and shadow second.

### Shadow Vocabulary
- **Sticker** (`box-shadow: 0 1px 0 rgba(70,48,16,.14), 0 12px 26px -18px rgba(70,48,16,.55)`): every label on the kraft, the 3D stage, the step label.
- **Float** (`box-shadow: 0 18px 40px -16px rgba(0,0,0,.45)` to `0 24px 60px -24px rgba(0,0,0,.5)`): account menu, sheets, help popover, coach mark.
- **Part label** (`box-shadow: 0 3px 10px -3px rgba(0,0,0,.35)`): labels pinned to parts in 3D.

### Named Rules
**The Sticker Rule.** One shadow for everything stuck to the box. If it needs a stronger lift it is not a label; it is something floating over the page.

## Shapes

Corners are nearly square, as printed cardboard and die-cut stickers are: 4px on buttons, fields, tool buttons, tabs, callouts and image wells; 6px on labels, the 3D stage, sheets and menus; 3px on mono stamps and progress segments. The parts drawer is square-edged on desktop and gets 10px top corners as a bottom sheet on phones. Circles are reserved for the account button, the camera shutter and the confidence dot.

Borders are 1.5px black for things you act on (secondary buttons, tabs, tick boxes, part-number stamps, the warning callout) and 1.5px dashed for divisions (perforations inside labels, dividers on the kraft, the doubt box in red). The ruler is a recurring silhouette: 10px tall, 42% black, inset 16px from each edge, on the top of every label.

## Components

### Buttons
Plain, printed, squared off.
- **Shape:** 4px corners, 48px tall (54px big, 40px small), 1.5px black outline.
- **Primary:** black fill, white Archivo 600 16px; an arrow on the right slides 3px on hover. One primary per view.
- **Secondary:** transparent with the black outline.
- **Hover / Focus:** primary lightens to #2E2A24; secondary takes a 7% black wash; pressing drops 1px. Focus everywhere is a 2.5px black outline with a 6px white halo, so it reads on kraft and on labels.
- **On black (closer):** primary becomes kraft with black text; secondary becomes a cream outline.

### Tool buttons
- **Style:** 40px tall, white, 1px control-line outline that turns black on hover, Archivo 600 14px with an 18px stroke icon. Pressed (Labels on) fills black.
- **Placement:** Replay and Labels bottom left of the 3D stage; − + Reset view bottom right. Reset view gains a black inner ring once the camera has moved away from the step's framing. On phones they shrink to 40px squares.

### Tabs
Parts · Build n/N · Done as a joined row of 40px outlined segments; the current one is filled black, the count in mono at 75%.

### Cards / Containers (labels)
- **Corner Style:** 6px.
- **Background:** label white; the 3D stage is label stock.
- **Shadow Strategy:** Sticker.
- **Border:** none; the ruler marks the top edge.
- **Internal Padding:** 30px top, 24px sides and bottom; rows inside are split by dashed perforations.

### Inputs / Fields
- **Style:** 52px tall, white, 1.5px control-line border, 4px corners, Atkinson 17px.
- **Focus:** border goes black with a 3px 12%-black ring.
- **Error:** border and message in doubt red.

### Navigation
The site header is printed on the kraft: logo and "Buildit" (Archivo 650 25px), text links with a black-wash hover (hidden under 760px), an outlined Sign in or a black circular account button that opens a white menu. The footer is a black band with cream links.

### Part rows and the parts check
A row is picture well (48px on stock), mono part-number stamp, name in Archivo 600 with size in mono beneath, and the count in mono on the right, divided by dashed perforations. In the parts check a 44px tick target on the right fills black with a check when found and fades its row to 55%; "Found n of N" counts above. Tapping a row finds the part in 3D.

### 3D stage
Label stock with the ruler, the big step number top left and the "New in this step" legend top right. Part labels in 3D are black mono tags with a short stem; new parts' tags are marker yellow. Camera: drag turns; scroll or pinch zooms toward the pointer; right-drag, middle-drag or Shift-drag pans; double-click centres on that point; − + Reset view buttons; keys ← → (steps), + − (zoom), 0 (step's view), R (replay), L (labels). A one-time black coach mark at the stage's foot lists the moves and is dismissed for good with ×; the ? button opens a black help popover listing every move and key in mono key caps. Touch devices get the touch wording.

### Callouts
- **Tip:** stock fill, lightbulb icon, 15px.
- **Warning:** 1.5px black outline, bold text.
- **May be wrong:** 1.5px dashed doubt-red outline, red icon, black text, details collapsed underneath.

### Next-step bar
Fixed at the foot of the step label: a 56px square outlined Back button and a full-width 56px black "Done, next step" with the arrow pushed right. On the Parts check it reads "Everything's here".

### Box label (landing)
A 360px white label with the product name, a mono fact sheet (boards, fittings, steps, time, tools) on dashed rows, then a solid black rule, a thin progress strip, "Step 3 of 9" in mono, the step title, and the parts that step takes as mono stamps.

## Do's and Don'ts

### Do:
- **Do** put every page on the kraft with the 5px dot screen, and anything read closely on a white label with the ruler on its top edge.
- **Do** use print black (#171512) for text, primary buttons and selected states; one black primary per view.
- **Do** divide rows inside labels with 1.5px dashed perforation (#CFC8BA), and on the kraft with dashed print black at 32%.
- **Do** set part numbers, counts, sizes and step counts in JetBrains Mono, part numbers inside a 1.5px black 3px-corner stamp.
- **Do** keep the 3D stage on label stock (#F6F3EC) with the Sticker shadow, and keep its camera model: zoom toward the pointer, right/middle/Shift-drag to pan, double-click to centre, − + Reset view, keys ← → + − 0 R L, one-time tip, ? help.
- **Do** write copy plain, short and in the active voice, sentence case.

### Don't:
- **Don't** use yellow for anything but the logo disc and "new in this step" in 3D.
- **Don't** use red for anything but "may be wrong", errors and destructive actions; safety warnings are black-outlined.
- **Don't** use mono for headings, buttons or prose.
- **Don't** put an eyebrow, kicker or small label above a heading.
- **Don't** round corners past 6px on labels or 4px on controls, and don't use pills.
- **Don't** add hard offset shadows, glows or decorative gradients; gradients only draw print (the dot screen, ruler ticks, the plus sign) or fade the hero model's edges.
- **Don't** add photos, illustrations or stock imagery; the live 3D model is the only picture.
- **Don't** imitate any furniture maker's look or manual artwork.
