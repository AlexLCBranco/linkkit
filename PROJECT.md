# Linkkit — project summary

_Last updated: 2026-10-05, v0.0.12 (arrow length presets for Tidy up)_

## What it is

A browser widget for "what does this depend on?" maps: boxes connected by
arrows, where A → B means "A needs B". Click a box and everything it needs
lights up teal, everything that breaks without it lights up orange. For
concept maps, dependency maps and relationship maps. Mouse-first, for
normal users. Sibling of Boardkit, Treekit and Vennkit, whose stack and
look it mirrors; built and used on its own. Repo:
github.com/AlexLCBranco/linkkit; every push to main deploys on Vercel
(https://linkkit-lake.vercel.app). Behaviour reference:
`reference/prototype.html`.

## Stack

Vite, React 19, TypeScript (strict), Zustand, React Flow (`@xyflow/react`)
as the renderer (camera locked: no pan, no zoom; the page scrolls
natively), a small hand-written layout (no layout library), CSS Modules +
design tokens (copied from Treekit) for the page, Tailwind v4 + shadcn/ui
(Radix) for menus and dialogs, lucide icons. No backend: saved in the
browser's localStorage. Layers: `app -> features -> components -> store ->
domain`; `domain/` is pure TypeScript with Vitest tests.

## What works now

- Dark header (with the map switcher, "Add box", "Tidy up", undo /
  redo, the Top-down / Left-right switch, "Arrows" and "Align"), status
  line, version badge. On a phone-sized window
  (480px or less) "Add box" and "Tidy up" show only their icons,
  Top-down / Left-right show a down / right arrow and "Arrows" shows an
  arrow, so the map's name has room; their tooltips still say what they
  do. (Even so, on a 375px phone the name shrinks to its first letter:
  the header is full)
- Keyboard extras for boxes: Tab moves through the boxes (and each box's
  toolbar buttons, which show while it has focus); Enter on a box selects
  it, as in the prototype. Tab skips the arrow lines; an arrow label's ×
  shows when Tab reaches it
- Several saved maps (Treekit's tree switcher): click the map's name in
  the header to rename it; the arrow beside it opens a menu listing every
  map (newest first, a tick on the open one) to switch to, plus "+ New
  map" (a blank map, its name open for typing), "Duplicate this map"
  (named "… (copy)", then "(copy 2)" …), "Add example map" (a fresh,
  tidied Microsoft 365 example added next to the others; it never
  replaces one, unlike the prototype's "Reset example") and "Delete this
  map…" (asks first; deleted for good; greyed out when only one map is
  left; then the newest map left opens). Each map keeps its own undo
  history for the session, so switching away and back still undoes.
  Renaming a map is not an undo step. A reload opens the map that was
  open last
- Undo / redo: the header's arrows, or Ctrl+Z and Ctrl+Shift+Z (or
  Ctrl+Y). Every change to the map is one step: a whole drag, adding a
  box together with its first name, a Tidy up, a page resize, a colour.
  A box added and left without a name leaves no step behind. Undo while
  typing a name first finishes the typing (and if that takes back a new
  nameless box, that is the undo). The history lasts until the page is
  reloaded; it is not saved
- Box colours (Treekit's 8, or none): right-click a box for a menu
  (Rename, a row of colour dots, Delete box), or the palette button in a
  box's hover toolbar for the same row of dots; with a box selected, keys
  1–8 pick a colour and 0 clears it. The box's colour now has a ring
  around its dot
- The page: dotted paper filling the whole screen under the header, in
  Treekit's darker tone and dots (app background, 1.5px dots every 24px), as in
  Treekit (no card, no border, nothing to resize). It only grows past the
  screen where the boxes need it (a big map after Tidy up, or a window
  made smaller), and then the screen scrolls. Boxes look like Treekit's nodes (wrap past 220px, palette colours
  show as a tint); arrows are straight lines from box edge to box edge
  with an arrowhead, and their label in a small pill. Labels of crossing
  arrows slide along their arrow so they don't pile up
- First visit: the Microsoft 365 sign-in example appears already tidied
  (boxes measured out of sight, Tidy up runs once, then they show)
- Saved automatically in the browser; a reload reopens the same map where
  it was. A damaged save is repaired and the original kept aside
- Click a box: what it needs lights up teal, what breaks without it
  lights up orange (boxes fill, arrows on those paths turn colour and
  thicken), everything else fades, and the status line shows the box's
  name and both counts. A box both needed and broken (in a loop) shows
  teal and counts only under "Needs". Box colours step aside while the
  highlight shows. Click empty paper or press Escape to clear it. The
  selection is not saved: a reload starts with nothing selected
- Editing with the mouse (keys are only extras):
  - Add: double-click empty paper (the box appears there), or "Add box"
    in the header (the middle of the part of the page on screen, stepped
    aside if a box is already there). The new box opens its name for
    typing; Enter or clicking away keeps it, and a box left without a
    name disappears
  - Rename: double-click a box, or the pencil in its hover toolbar.
    Emptying a name keeps the old one
  - Move: drag a box; it stays on the screen (or on the bigger page other
    boxes already make). A box that grows past the edge (a longer name)
    moves back onto it. Making the window smaller moves no box: the
    screen scrolls instead
  - Connect: drag the dot on a box's right edge onto another box. A
    dashed arrow follows the pointer and snaps to a box it may connect
    to; letting go anywhere else does nothing
  - Arrow labels: click a label to type a new one (emptied, it goes back
    to "needs"); the × on its corner deletes the arrow
  - Delete a box (and its arrows): the bin in its hover toolbar, or
    select it and press Delete
  - Two arrows between the same boxes in opposite directions are drawn
    side by side instead of on top of each other
- Tidy up (header button): rearranges the boxes in rows, each box above
  what it needs, centred on the screen (the page grows past it only if
  the map needs more room), and the boxes glide there with their arrows attached. Saved as
  one change. With "reduce motion" switched on in the system, they jump
  there instead
- Top-down / Left-right (Treekit's switch): which way Tidy up lays the
  map out. Left-right puts each box to the left of what it needs, in
  columns. Picking the other one tidies the map that way at once (the
  boxes glide); the direction is saved with each map, and switching is
  one undo step. "Tidy up" then keeps using that direction
- Arrow length (the "Arrows" panel, next to Align): Short, Medium or Long,
  how long Tidy up makes the arrows. Picking one tidies the map with it at
  once (the boxes glide; picking the one already chosen just tidies
  again). Saved with each map and one undo step, like the direction;
  Medium is the old length, and older maps open as Medium. The length is
  measured beside the widest label, so even Short never lets a label
  cover a box: top-down the gaps are 56 / 88 / 144px, left-right (where
  labels lie along the arrows) they grow with the longest label
- Align (Treekit's panel): left / centre / right and top / middle /
  bottom for the whole map on the screen. The boxes glide there together,
  keeping their shape (one undo step); pressing the spot already chosen
  puts a map back there after boxes were dragged. Tidy up (and the
  direction switch) place the map at the chosen spot too. The choice is
  remembered by the browser for every map (`linkkit:align`), not saved
  with a map. Centred until something else is chosen
- The engine underneath, all in `src/domain/` with tests: the map model
  (boxes with a centre position and an optional colour, arrows with a
  label), the one place that decides which arrows are allowed, "needs /
  breaks" reach and the status-bar counts, a loop-safe Tidy-up layout (top-down, or the same turned on its side
  for left-right; the gap between rows from the arrow length and the
  labels),
  page sizing (the screen, or the boxes' reach; keeping boxes on the
  page; a free spot for a new box; placing a block of boxes at an
  alignment), arrow geometry (with side-by-side
  opposite arrows) and label placement, the glide's easing, the undo
  history (steps, joining a drag into one step), saving with a
  version number and repair of damaged saves, the list of saved maps
  (and "(copy)" names), and the example map

## What's next

The first build, in order:
1. ~~Scaffold~~ (done)
2. ~~Domain + tests~~ (done)
3. ~~The page: boxes and arrows, the example map tidied on first load~~
   (done)
4. ~~Click a box: teal needs / orange breaks highlight and the status bar~~
   (done)
5. ~~Editing with the mouse: add, rename, connect, move, delete, arrow
   labels~~ (done)
6. ~~Page: "More room" tab, corner grip, animated Tidy up~~ (done)
7. ~~Undo/redo, then box colours (right-click menu, swatch row, keys
   1–8 / 0)~~ (done)
8. ~~Several saved maps: switcher, rename, new, duplicate, delete, "Add
   example map" (replaces the prototype's "Reset example": it adds a
   fresh example map and never wipes one)~~ (done)
9. ~~Polish and a full check against the "done when" list~~ (done)
10. ~~Treekit's view modes: Top-down / Left-right and Align~~ (done)
11. ~~Arrow length presets (Short / Medium / Long) for Tidy up~~ (done)

The first build is complete. Nothing further is planned yet: the owner
picks what comes next. Small things noticed but left alone (see Open
problems): arrow labels can't be edited from the keyboard.

## Open problems

- Treekit's teal and orange box colours look like the needs / breaks
  highlights. Decided: keep all 8; a selected box's highlight hides box
  colours, and the highlight looks different (solid fill, coloured arrows,
  the rest faded). Revisit if it still confuses in use. Step 7 change:
  the selected box itself keeps its own colour (its ring sets it apart),
  since otherwise picking a colour for it (keys, its menu) showed nothing.
- Look choices made in step 3 where the prototype and Treekit differ
  (Treekit's look won, per CLAUDE.md): boxes wrap long names instead of
  growing forever; arrow labels have a thin border. Easy to change if
  unwanted.
- Look choices made in step 4 (Treekit's look won): the selected box
  keeps Treekit's selection style (accent border, thin ring) rather than
  the prototype's thicker ring; highlights fade in over a moment.
- Look choices made in step 5 (Treekit's look won): deleting and
  renaming a box sit in Treekit's hover toolbar above the box (the
  prototype had a × on the box's corner); boxes show Treekit's open-hand
  cursor. Kept from the prototype: the connect dot on the box's right
  edge, single-click to edit a label, the × on a label's corner.
- Step 5 additions beyond the prototype: opposite arrows are drawn side
  by side (straight, slightly apart) rather than bent; "Add box" steps a
  new box aside rather than stacking it on another.
- Step 6 choices: Tidy up's glide uses Treekit's length (220ms, the
  prototype took 450ms); a glide cut short by a paused browser tab still
  ends with the boxes in place.
- Owner decision after step 9: the page is ONE SCREEN, like Treekit's
  canvas. The prototype's "More room" tab and corner grip were dropped
  (a page you size by hand isn't wanted), along with the paper card's
  border and margin. The page grows past the screen only where boxes
  need it. The owner had asked earlier for "a handle bar like Boardkit's
  and Treekit's"; it was wrongly built as the page's resize handles. The
  owner meant the thin native scrollbar Boardkit shows when the board is
  wider than the window: Linkkit already styles it the same way
  (`styles/global.css`), so a map bigger than the screen gets that bar.
  `LinkMap.page` stays in the saved map (it records the size of the last
  Tidy up) but no longer decides what is drawn.
- Step 7 choices (the prototype has no undo or colours, so Treekit is the
  reference): Treekit's undo design (a step stores only the parts of the
  map it changed) and its header undo / redo buttons. Different from
  Treekit: colours are a row of dots, not a 9-line list, and they are
  also in a palette button on the box's hover toolbar, so colouring
  doesn't depend on discovering right-click. Undo pressed while a menu
  is still fading out is ignored (as in Treekit).
- Step 8 choices (the prototype has one map, so Treekit is the
  reference): Treekit's switcher (name to rename, arrow for the menu,
  confirm before delete, the last map can't be deleted); each map keeps
  its undo history for the session, as in Treekit; renaming a map isn't
  undoable (as in Treekit). Different from Treekit: duplicates get
  "(copy 2)" etc. rather than repeating a name. Two example maps share
  the same name; the tick shows which is open.
- Step 8 fix: menus' and dialogs' buttons (shadcn) were losing their
  padding, border and red "Delete" colour, because the page's own button
  reset sat outside Tailwind's layers and so overrode them. Treekit has
  the same reset, so its dialogs likely show the same plain buttons.
- Step 9 check: the "done when" list from the original brief was never
  written into the repo, so the check was against CLAUDE.md's rules,
  this file and every behaviour in `reference/prototype.html`. Fixed:
  a new map's page no longer makes the window scroll sideways when the
  map is taller than the window (it now leaves room for the scrollbar,
  so it is up to 12px narrower); Enter on a focused box selects it (the
  prototype did this; it was missing); Tab no longer stops on invisible
  things (the arrow lines, a box's hidden toolbar, an arrow's hidden ×);
  header buttons no longer wrap onto two lines on a narrow window. If
  the original "done when" list still exists somewhere, add it here and
  re-check against it.
- Step 10 (owner asked for Treekit's "Top-down / Left-right" and "Align"
  header controls): Treekit's look and names. Differences, because
  Linkkit's camera is locked and boxes sit where they are put: Align moves
  the boxes (an undoable change) where Treekit moves its view, and the
  direction only matters when the map is tidied, so switching it tidies.
  The direction is part of the map (saved, undoable; older saves read as
  top-down without counting as a repair); the alignment is a browser-wide
  view preference, as in Treekit. On a phone-sized window the header's
  gaps are tighter so the map's name keeps some room.
- Step 11 (owner asked for "arrow length presets for the tidy up thing";
  neither Treekit nor the prototype has one): three presets, Short /
  Medium / Long, in an "Arrows" panel styled like Align's (a third header
  switch would not fit on a phone). Choices made without asking, easy to
  change: the length is saved per map and undoable (like the direction,
  since it shapes the tidied map), not a browser-wide preference like
  Align; picking one tidies at once; only the gap ALONG the arrows
  changes, not the space between neighbouring boxes. Found while
  building: left-right, the old fixed gap let wide labels ("checked by")
  sit over the boxes. Now every preset is measured past the widest
  label, so Medium left-right is a little longer than before.
