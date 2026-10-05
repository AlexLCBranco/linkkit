# Linkkit — project summary

_Last updated: 2026-10-05, v0.0.16 (selecting several boxes, step 15)_

## What it is

A browser widget for "what does this depend on?" maps: boxes connected by
arrows, where A → B means "A needs B". Click a box and everything it needs
lights up teal, everything that breaks without it lights up orange. For
concept maps, dependency maps and relationship maps. It also makes
decision trees ("What should I choose?"), where an arrow means "leads
to" and clicking a box shows the way to it and what comes after; trees
will slowly take over Treekit's job. Mouse-first, for
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
  made smaller), and then the screen scrolls, with a clear 14px scrollbar
  (a light grab handle on a faint track) to drag up and down. Boxes look like Treekit's nodes (wrap past 220px, palette colours
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
- Selecting several boxes (the marquee), in both kinds of map:
  - Drag across empty paper: a tinted box follows the pointer and every
    box it holds completely is picked as it goes (brushing a box's edge
    doesn't pick it). Shift+drag adds to what is already picked.
    Shift+click a box adds it or takes it out; Ctrl+A picks every box;
    clicking a box (or the paper, or Escape) goes back to one / none.
    Picked boxes get the selection ring; the teal / orange highlight
    is off while several are picked, and the status line says how many
  - Drag any picked box and they all move together as one block (it
    stops at the page's edge as a whole, so the shape never squashes).
    One undo step
  - A bar floats at the bottom of the map while several are picked:
    "N selected", a colour dot (a split dot when they differ), Duplicate,
    Copy, Delete and × (let go). Right-clicking a picked box opens the
    same for the whole group, plus Cut. Keys: 1–8 / 0 colour them all,
    Delete removes them all, Ctrl+D / C / X duplicate, copy, cut. Each is
    one undo step
  - Copy takes the boxes and the arrows between them (an arrow to a box
    left behind isn't copied). Paste: Ctrl+V lands a step down-right of
    the originals (a step further each time), or right-click empty paper
    for "Paste here", centred on that spot. The pasted boxes come
    selected, ready to drag. The clipboard lasts until a reload and works
    across maps. A single box's right-click menu has Duplicate and Copy
    too
  - In a tree: picking, moving, colouring and deleting work; Copy,
    Paste, Duplicate and Cut don't show (a pasted box would have no way
    into it). Deleting several asks first, as for one box, when more
    would go than were picked; boxes that only the picked boxes lead to
    go too, even one with two parents when both were picked
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
  labels lie along the arrows) they grow with the longest label.
  Any length in between (or a little past Long), two ways, re-tidying as
  it goes with the boxes following at once (no glide):
  - Scroll the mouse wheel over the "Arrows" button, no need to open it:
    wheel up stretches the arrows, wheel down shrinks them (8px a notch;
    a trackpad changes it smoothly). The button's tooltip says so, and so
    does a tip in the panel
  - The slider in the panel ("Shorter" … "Longer"), with marks at the
    presets; it snaps onto a preset when let go near one. Arrow keys on
    it work too
  A preset button lights up only when the length is exactly that preset.
  One drag, or one burst of scrolling (turns less than 0.6s apart), is
  one undo step
- Align (Treekit's panel): left / centre / right and top / middle /
  bottom for the whole map on the screen. The boxes glide there together,
  keeping their shape (one undo step); pressing the spot already chosen
  puts a map back there after boxes were dragged. Tidy up (and the
  direction switch) place the map at the chosen spot too. The choice is
  remembered by the browser for every map (`linkkit:align`), not saved
  with a map. Centred until something else is chosen
- Trees (a second kind of map, for decisions). An arrow reads "leads
  to": the earlier step above (or left of) the next one. One start box,
  which can be renamed and coloured but not deleted; every other box has
  at least one arrow leading into it, so there are no loose boxes. Two
  ways into one box are allowed ("Rent" and "Buy" both lead to "Live near
  the office"); loops and arrows into the start are not.
  Connections maps work exactly as before.
  - The map menu has "+ New tree" (a blank tree: just its start box,
    centred, its name "Start" open for typing over; left empty it stays
    "Start"; the tree is called "Untitled tree" until renamed in the
    header) and "Add example tree" ("Take the new job?", with one merge)
  - Add a next step: the "+" in a box's hover toolbar, "Add next step" in
    its right-click menu, "Add box" in the header (adds to the selected
    box; greyed out with nothing selected, and its tooltip says why), or
    drag a box's dot onto empty paper. The new box opens its name for
    typing; left empty, it goes away again with its arrow. Drag a box's
    dot onto another box to give that box a second way in (the dashed
    arrow only snaps to boxes the rules allow). Double-clicking the paper
    does nothing in a tree
  - The tree tidies itself whenever it grows (a next step, once more when
    its name is typed, a second way in): the boxes glide to make room.
    Adding a step and the room made for it are one undo step
  - Delete a box: it goes with every box that can only be reached
    through it; boxes another step also leads to stay. If more than the
    box itself would go, a dialog asks first and says how many. One undo
    step
  - Arrows have no label (no "needs" pill). Pointing at an arrow shows a
    small × in its middle to delete it, except on a box's only way in
    (that would leave a loose box), which shows none
  - Click a box: teal is every way back to the start (through both
    parents where there are two), orange is everything that comes after
    it, the rest fades. The status line says e.g. "Live near the office ·
    Comes from 4 · Leads to 1"
  - Top-down / Left-right, Arrows, Align, colours, undo, Tidy up and
    saving work as in a connections map. A damaged saved tree opens as it
    was (its shape isn't repaired yet)
- The engine underneath: pure TypeScript in `src/domain/` (no React, no
  store), each file with a Vitest test beside it:
  - `types.ts`: the model. A map is `{ id, name, kind, page, direction,
    arrowLength, nodes, links }`; `nodes` and `links` are flat
    `Record<id, …>` maps. A box is `{ id, name, x, y, color }` (x, y is
    its centre); an arrow is `{ id, from, to, label }`, read "from needs
    to" in a connections map and "from leads to to" in a tree. `kind`
    names the map's rule set: `"connections"` or `"tree"`. An arrow's
    default label is per kind ("needs", or none in a tree)
  - `rules.ts`: the one place that says what's allowed, per kind, in a
    `RULES` table: `canLink(map, from, to)` (may this arrow be drawn?),
    `canDeleteBox`, `canDeleteLink` and `canPaste` (may copied boxes go
    in?). "connections" refuses only a
    missing box, a box needing itself, or an exact repeat (loops and
    reverse arrows are allowed), lets anything be deleted and anything be
    pasted. "tree"
    also refuses any arrow into the start and any arrow that would make
    a loop; it never deletes the start, nor an arrow that is a box's only
    way in, and never takes a paste. The drag (to show valid drop
    targets), the hover toolbar's bin, an arrow's ×, the menus and the
    store all ask it
  - `tree.ts`: edits only a tree needs, each keeping "one start, no loose
    boxes" true in one step: a new tree (just its start box), adding a
    next step (the box and its arrow together), which boxes a delete
    takes along (`branchOf`, or `branchesOf` for several picked
    together), and deleting them
  - `map.ts`: every edit as a function that returns a new map (add /
    rename / move / colour / delete a box, add / relabel / delete an
    arrow, rename / duplicate the map, direction, arrow length, page),
    and the same for several boxes at once (delete, colour) plus copy /
    paste: `copyFragment` (boxes and the arrows between them) and
    `pasteFragment` (new ids, moved by an offset)
  - `marquee.ts`: which boxes the marquee holds, and the selection it
    makes (replace, or add with Shift)
  - `reach.ts`: the teal and orange groups (walking the arrows forward or
    backward), each box's and arrow's highlight, and the status-line
    counts. `REACH_MEANINGS` is the one place that says, per kind, which
    way teal walks and the status line's words: connections teal = needs
    (forward), tree teal = the way back to the start (backward)
  - `layout.ts`: Tidy up, `layoutMap(map, sizes, options, direction)`.
    In: the map, each box's measured size, the gaps. Out: a centre for
    every box, the block's outer edges, and which arrows were set aside
    to break loops. It never moves anything itself: the canvas
    (`features/map/MapCanvas.tsx`) calls it, `page.ts` places the result
    at the chosen alignment, and the store saves the new positions as one
    undo step. The method is a small hand-written layered layout: set one
    arrow of each loop aside, put each box one row below the lowest box
    that needs it, order each row by where the boxes above it sit, centre
    the rows. Left-right runs the same thing on its side (width and
    height swapped, then x and y swapped back). `arrowGap` turns the
    arrow length plus the widest label into the gap between rows. It is
    the only file that knows how placement works, so another algorithm
    (or a library, if the owner agrees) is a swap of this one function
  - `page.ts`: page sizing (the screen, or the boxes' reach), keeping a
    box on the page, a free spot for a new box, placing a block of boxes
    at an alignment, how far a dragged group may move and stay on the
    page (`clampGroupMove`)
  - `geometry.ts` and `labels.ts`: where an arrow starts and ends on a
    box's edge (opposite arrows side by side), and sliding labels apart
  - `glide.ts`: the easing of Tidy up's glide
  - `history.ts`: undo steps (each stores only what changed; a drag
    joined into one step)
  - `persistence.ts` and `registry.ts`: saving a map with a version
    number and repairing a damaged save (an unknown `kind` can't be
    read; arrows every kind refuses are dropped: a missing end, a box
    linking to itself, an exact repeat), and the list of saved maps (with
    "(copy)" names). A tree's own shape (several starts, loose boxes,
    loops) is not repaired yet: see What's next
  - `example.ts`, `ids.ts`, `testMaps.ts`: the example map and example
    tree, ids, test fixtures

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
12. ~~Any arrow length: mouse wheel over "Arrows", and a slider~~ (done)
13. ~~A scrollbar you can see when the map is taller than the screen~~
    (done)

The first build is complete. Small things noticed but left alone (see
Open problems): arrow labels can't be edited from the keyboard.

Tree mode (a new map kind for decisions, "What should I choose?"; it
will slowly take over Treekit's job; Treekit itself is left alone).
Not in this version: notes, fork a branch, Mermaid import / export,
turning a connections map into a tree.

14. Tree mode:
    - a. ~~Tree rules, "+ New tree" and "Add example tree", adding next
      steps, a second parent, deleting a branch, the highlight~~ (done)
    - b. Arrow labels in trees. Proposed, waiting for the owner's OK:
      hovering an arrow shows a small chip in its middle with the ×
      (where allowed) and "+ label"; clicking "+ label" opens a field to
      type ("if yes"); emptying it takes the label away again
    - c. Keep / maybe / cut, copied from Treekit (`../treekit/src/domain/
      tree.ts`: hover toolbar and right-click menu, cut branches faded,
      a way to hide cut branches; a box with two parents is cut only if
      every way into it is cut; one undo step each, saved)
    - d. Collapse, copied from Treekit (a toggle on a box with next steps;
      Treekit saves `collapsed` on the box, so it is saved and undoable
      here too; a box with another parent still showing stays; Tidy up
      lays out only what shows)
    - e. Repairing a damaged tree. Proposed, waiting for the owner's OK:
      several starts: keep the oldest, the others become its next steps;
      a loose box: becomes a next step of the start; a loop: drop the
      arrow that closes it (as Tidy up already picks one). The original
      is kept aside, as now

15. ~~Selecting several boxes: the marquee, moving them together, copy /
    paste / duplicate / delete / colour~~ (done; asked for by the owner
    ahead of 14b, so 14b is still next)

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
- Step 12 (owner asked for "a clever way to scroll the size of the preset
  arrows"): the length is now a number of pixels (the bare arrow beside
  the widest label, 0 to 240; Short 15, Medium 47, Long 103), not one of
  three names. Saves from v0.0.12 that name a preset read as its number.
  The clever part: the mouse wheel over the "Arrows" button stretches or
  shrinks the arrows live without opening anything; the panel's slider is
  the visible way for anyone who doesn't know about the wheel. Live
  changes skip the glide (it would lag behind the hand).
- Step 13 (owner asked for "an up/down handle bar" when a map doesn't fit
  on screen): the page already scrolled and had a scrollbar, but it was
  nearly invisible (thin, 16% white on the dark page): Chrome and Edge
  ignore the custom scrollbar styling whenever the standard
  `scrollbar-width` / `scrollbar-color` are set, so they drew their own
  thin bar. Now Chrome / Edge get a 14px bar with a clearly visible
  rounded handle (brighter on hover) on a faint track; Firefox gets the
  same colours through the standard properties. Tokens:
  `--scrollbar-size`, `--scrollbar-thumb(-hover)`, `--scrollbar-track`.
- Step 14a (tree mode, first part). Owner decisions: "+ New tree" opens
  the START BOX's name for typing (it is the question); the tree itself
  is "Untitled tree" until renamed. A tree RE-TIDIES ITSELF when it grows
  (like Treekit), so boxes dragged by hand move then. Choices made
  without asking, easy to change: the tree also re-tidies when a second
  way in is drawn, but not after a delete (nothing jumps when boxes go);
  "Add next step" is in the right-click menu too; a tree arrow's × sits
  in the arrow's middle and shows while the pointer is on the arrow
  (there is no pill to carry it); the start box looks like any other
  box. Under the hood the highlight's names are now neutral (teal /
  orange instead of needs / breaks), with one table per kind saying what
  each means. Noticed, left alone: Tidy up centres each row on its own,
  so a lone next step sits under the middle of the tree rather than
  under its parent ("Walk to work" in the example). A tree-friendly
  placement (each step under its parents) is a change to `layout.ts`
  only, if wanted.
- Step 15 (owner asked for "the marquee thing ... selects everything
  inside of it and lets me move around the selections and or copy and or
  delete"; it had been listed as not in this build, the owner's request
  overrides that). Treekit's marquee and selection bar are the reference.
  Choices made without asking, easy to change: a box is picked only when
  the marquee holds all of it (Treekit's rule); the highlight is off while
  several are picked; the clipboard is Linkkit's own (not the system
  clipboard, so it can't paste into other apps) and lasts until a reload;
  a paste lands 24px down-right (another 24px each time); trees get no
  copy / paste (`canPaste` in rules.ts) because a pasted box would be
  loose. Not done: the page doesn't scroll by itself when the marquee
  reaches the screen's edge.
- `.claude/launch.json` has a second dev server, `linkkit-2` on port
  5182, for when another chat already runs `linkkit` on 5181 (each port
  has its own localStorage, so test maps never mix).
