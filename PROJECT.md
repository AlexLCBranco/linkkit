# Linkkit — project summary

_Last updated: 2026-10-05, v0.0.7 (after step 8)_

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

- Dark header (with the map switcher, "Add box", "Tidy up", and undo /
  redo buttons), status line, version badge
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
- The page: a sheet of dotted paper with the map's boxes and arrows on
  it. Boxes look like Treekit's nodes (wrap past 220px, palette colours
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
  - Move: drag a box; it stays on the page. A box that grows past the
    page's edge (a longer name) moves back onto it
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
  what it needs, centred on the page (which grows if the map needs more
  room), and the boxes glide there with their arrows attached. Saved as
  one change. With "reduce motion" switched on in the system, they jump
  there instead
- Resizing the page:
  - Drag the grip in the page's bottom-right corner: width and height.
    The grip stays under the pointer even though the page is centred
  - Drag the "More room" tab on the bottom edge: height only. A click on
    it adds 200px of room and scrolls the tab back under the pointer
  - The page can't shrink past a box (or below 320 × 240). While dragging,
    "width × height" shows in the corner; the size is saved on letting go
- The engine underneath, all in `src/domain/` with tests: the map model
  (boxes with a centre position and an optional colour, arrows with a
  label), the one place that decides which arrows are allowed, "needs /
  breaks" reach and the status-bar counts, a loop-safe Tidy-up layout,
  page sizing (keeping boxes on the page, a free spot for a new box, the
  resize maths for a centred page), arrow geometry (with side-by-side
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
9. Polish and a full check against the "done when" list. Known
   leftovers: on a window narrower than ~1000px a new map's page is a
   few pixels wider than the space, so a horizontal scrollbar shows (the
   new-page width doesn't allow for the vertical scrollbar)

## Open problems

- Treekit's teal and orange box colours look like the needs / breaks
  highlights. Decided: keep all 8; a selected box's highlight hides box
  colours, and the highlight looks different (solid fill, coloured arrows,
  the rest faded). Revisit if it still confuses in use. Step 7 change:
  the selected box itself keeps its own colour (its ring sets it apart),
  since otherwise picking a colour for it (keys, its menu) showed nothing.
- Look choices made in step 3 where the prototype and Treekit differ
  (Treekit's look won, per CLAUDE.md): boxes wrap long names instead of
  growing forever; arrow labels have a thin border; the page is centred
  on the screen rather than left-aligned. Easy to change if unwanted.
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
  prototype took 450ms); the page's tab and grip use Treekit's colours
  (accent on hover). Additions beyond the prototype: a click on "More
  room" adds 200px (the prototype's tab only dragged); a glide cut short
  by a paused browser tab still ends with the boxes in place. Not done:
  dragging a handle past the window's edge doesn't scroll by itself
  (scroll with the wheel mid-drag, or drag again).
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
