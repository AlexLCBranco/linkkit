# Linkkit — project summary

_Last updated: 2026-10-08, v0.0.60 (fix: a label-style re-tidy no longer undoes a box moved before it lands; v0.0.59: export draws boxes where they are on screen)_

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
(https://linkkit-lake.vercel.app, which now only shows a "moved" notice; also at
https://linkkit-lake.vercel.app/linkkit/). It is moving to the shared
gauntlet site, https://gauntlet-home.vercel.app/linkkit, next to
Boardkit at /boardkit; that site forwards /linkkit to this Vercel
project, and Linkkit stays its own repo. Behaviour reference:
`reference/prototype.html`.

## Stack

Vite, React 19, TypeScript (strict), Zustand, React Flow (`@xyflow/react`)
as the renderer (camera locked: no pan; zoom only from the pill; the page scrolls
natively), a small hand-written layout (no layout library), CSS Modules +
design tokens (copied from Treekit) for the page, Tailwind v4 + shadcn/ui
(Radix) for menus and dialogs, lucide icons, html-to-image (PNG / SVG export, as in
Treekit). No backend: saved in the
browser's localStorage, every key starting with "linkkit:" (the shared
site gives Linkkit and Boardkit one localStorage; Boardkit's keys start
with "boardkit:"), plus an IndexedDB database "linkkit" holding only the
automatic-backup folder (Boardkit's is "boardkit"). Built with Vite's `base: '/linkkit/'`, so every asset
is under /linkkit/; `vercel.json` maps /linkkit/... back to the root on
Linkkit's own address, so both addresses work. Layers: `app -> features -> components -> store ->
domain`; `domain/` is pure TypeScript with Vitest tests.

## What works now

**Two parents (the rule, in one place).** With tree rules on, a box may
have two (or more) parents: "Rent" and "Buy" can both lead to "Live near
the office". In a map linked to Boardkit it may not: each box has exactly
one parent, because a card sits in one list (refused as "has two ways
in"). Loops and arrows into the start are refused in both. Code:
`rules.ts` (`tree` and `linkedTree`).


- Dark header (with the map switcher, "Add box", "Tidy up", undo /
  redo, the Top-down / Left-right switch, "Arrows", "Align" and, in a
  tree, "Hide cut"), status line, version badge. On a phone-sized window
  (480px or less) "Add box" and "Tidy up" show only their icons,
  Top-down / Left-right show a down / right arrow, "Arrows" shows an
  arrow, "Align" and "Hide cut" show their icons, and the gaps are
  tighter, so the map's name has room; their tooltips still say what they
  do. (Even so, on a 375px phone the name shrinks to its first letter:
  the header is full)
- Keyboard extras for boxes: Tab moves through the boxes (and each box's
  toolbar buttons, which show while it has focus); Enter on a box selects
  it, as in the prototype. Tab skips the arrow lines; an arrow label's ×
  shows when Tab reaches it
- Several saved maps (Treekit's tree switcher): click the map's name in
  the header to rename it; the arrow beside it opens a menu listing every
  map (newest first, a tick on the open one; a name that repeats shows
  numbered, "Rent 2") to switch to, plus "+ New
  map" (a blank map, "Untitled map 2" … when taken, its name open for
  typing; it takes its first box's name until renamed), "Duplicate this map"
  (named "… (copy)", then "(copy 2)" …) and "Delete this
  map" (no question: it goes to the trash, see below; greyed out when only
  one map is left; then the newest map left opens). Each map keeps its own undo
  history for the session, so switching away and back still undoes.
  Renaming a map is not an undo step. A reload opens the map that was
  open last
- Moving maps to another address (each web address has its own
  storage): the map menu's "Export all maps" downloads every map as one
  file (`linkkit-maps-<date>.json`). On an empty Linkkit (only the
  example a first visit opens, untouched) the menu also shows "Restore
  all maps from a file…": it adds every map from the file, takes the
  untouched example away and opens the newest restored map. A map
  already here (same map, even renamed since) is never overwritten, so
  restoring twice is safe; a message says how many came back. Once the
  example is changed (any edit or rename), it counts as the owner's map
  and the restore is no longer offered
- Automatic backup (Chrome and Edge; the option is hidden in Firefox and
  Safari, which can't write to folders): "Automatic backup…" in the map
  menu picks a folder (ideally a synced one). Ten seconds after changes
  stop, every map is written there as one file
  (`linkkit-backup-<date>-<time>.json`, the "Export all maps" format, so
  "Restore all maps from a file" reads it); the newest 20 are kept, and
  nothing else in the folder is ever touched. The menu says where and
  how long ago ("Backing up to “OneDrive” · last 2 min ago"). Backups
  never stop silently: after a browser restart the menu offers "Resume
  backups" (Chrome asks for one click), a folder that has gone offers
  "Choose folder…", and either way an orange dot shows on the map menu's
  button. "Turn off automatic backup" stops it. No file is written while
  there is nothing to keep (the first visit's example before its first
  tidy)
- Backup reminder (Boardkit's 7-day dot), in every browser: while
  automatic backup isn't running (off, or Firefox / Safari), the same
  orange dot shows when nothing has been backed up for 7 days, or ever.
  Its tooltip says "no backup yet" or "no backup for over 7 days". The
  menu's first backup line, "Last backup: 9 days ago · Back up now",
  runs "Export all maps"; any export counts as a backup and clears the
  dot. Running automatic backup never shows it. No dot while Linkkit
  holds only the untouched first-visit example (nothing to keep yet). A
  page left open re-checks every minute
- Undo / redo: the header's arrows, or Ctrl+Z and Ctrl+Shift+Z (or
  Ctrl+Y). Every change to the map is one step: a whole drag, adding a
  box together with its first name, a Tidy up, a page resize, a colour.
  A box added and taken back with Esc leaves no step behind (U4). Undo
  while typing a name first finishes the typing. The history lasts until the page is
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
  it was. A damaged save is repaired and the original kept aside (the
  console says so only if that copy really was written)
- Two tabs of Linkkit (shared store step 3b2, v0.0.31) no longer
  overwrite each other. A change saved in one tab shows in the other at
  once, and each tab's own changes are kept: a box renamed in one tab
  and moved or recoloured in the other keeps both. When both tabs changed
  the same thing (one box's name, its colour, its status or its place;
  one arrow; one map setting), the other tab's version is kept and a
  small note at the bottom says so ("“Teams” was just changed in another
  tab, so that version was kept."), Boardkit's wording. A map deleted in
  one tab closes in the other, which opens the newest map left and says
  "“…” was deleted in another tab." New, renamed and deleted maps show in
  the other tab's map list and trash. Taking in another tab's (or
  Boardkit's) change keeps undo working (step 26): an undo puts back only
  what its own step changed, keeping what came in. An undo whose box,
  arrow or setting was also changed elsewhere since is refused ("Can't
  undo further: “Rent” was changed in another tab", or "in Boardkit or
  another tab" for a linked tree), and that step and every older one are
  dropped; what was already undone can still be redone. A redo is refused
  the same way (nothing is left to redo then). Changing different things
  on one box (a move here, a rename there) is no clash
- When a save fails (the browser's storage for the site is full), a
  banner under the header says changes aren't being saved and stays
  until they are. It offers "Export all maps" (the file holds the open
  map as it is on screen) and "Try again" (after room has been made,
  retries every save that failed, maps that aren't open included, then
  saves the open map). The banner suggests deleting maps no longer
  needed and emptying the trash (a deleted map keeps its storage until
  then). Switching maps meanwhile is
  safe: a map whose save failed reopens with its real content (kept in
  memory until it saves). A new map joins the saved list only once its
  own content is stored, so a failed first save never leaves the list
  naming nothing. While it shows, closing or reloading the tab asks first
  (the browser's "Leave site?" prompt; not on mobile Safari)
- A map the saved list still names but whose content isn't in storage
  (its save failed and the tab closed before "Try again") is taken off
  the list as Linkkit opens, and a banner names it instead of it
  vanishing silently. The banner offers "Restore from a file…" (an
  exported file; maps already here are left alone) and "Dismiss"
- A trash (step 18), for every map. Deleting boxes (a box, a tree branch,
  a selection, Cut) puts them in the map's own trash as one entry, with
  their arrows, labels, colour, keep / maybe / cut and place; deleting a
  map puts the whole map there. The trash button at the right of the
  header (with a count) opens "Recently deleted": "From this map" ('“Rent”
  and 4 more boxes · 2 days ago') and "Deleted maps", each row with
  Restore and "Delete for good", and "Empty trash" (asks first). Restored
  boxes go back where they were and end up selected; in a tree they
  rejoin their parent in their old place (a folded parent opens), a
  branch whose parent is gone hangs off the start, and the tree
  re-tidies. A restored map comes back as the newest and opens. The
  trash holds 200 boxes per map and 30 maps; a delete that would push
  the oldest out asks first, naming it ("The trash is full … Delete and
  erase the oldest"). Deleting, restoring and erasing boxes are undo
  steps; map trash actions aren't. Not trashed: one arrow deleted on its
  own (undo only) and a new box left without a name. "Export all maps"
  and automatic backups carry each map's box trash, not deleted maps; a
  file restore leaves a map that is in the trash alone ("already here
  (or in the trash)"). Times in the trash are always in English ("2
  minutes ago"), unlike Treekit's, which follow the browser's language
- A map linked to Boardkit has no trash of its own (step 22): its deletes
  go only to the board's trash in Boardkit (a list with its cards, a card
  on its own), restored from there; a restore arrives live and is tidied
  in. Boardkit's limits hold (200 cards, 30 lists per board): a delete
  that would push the oldest out asks first in Boardkit's words ("The
  trash is full. Boardkit's trash holds 200 cards and 30 lists per board.
  Deleting this will permanently erase the oldest card in it, 'Old
  idea', and 2 more"). So does an undo or redo that would put a box in
  that full trash (undoing an add), with "Undo and erase the oldest".
  "Recently deleted" says the map's deleted boxes are in Boardkit's trash,
  with "Open trash in Boardkit" (/boardkit in a new tab; you pick the
  board there). Undoing a delete takes the box back out of Boardkit's
  trash; what "erase the oldest" erased stays erased. A new box in a
  linked map isn't saved until it has a name, so a box left nameless
  never reaches Boardkit (or its trash)
- "Link to Boardkit…" (step 23), in the map menu for a tree, shown only
  where Boardkit's data is (its board list reads: the shared gauntlet
  site, once Boardkit has been opened there). A tree that doesn't fit a
  board is refused in a dialog naming each box in the way ("'Walk to
  work' is 4 levels deep", "has two ways in", "more than 50 cards");
  nothing is fixed for you. Otherwise a question says what it makes
  ("It becomes a board in Boardkit with 2 lists and 3 cards") and, when
  the map's own trash holds boxes, that they will be erased. Link makes
  the board (Boardkit's record, version 2, `rev` 1), adds it at the end
  of Boardkit's board list (Boardkit's open board stays; an open Boardkit
  tab gets the new board live), and stores the map linked, all or
  nothing: a failed write takes back what was written and says so. The
  board's id is the start box's; when a board already has that id (a
  copy of a linked map) the start box gets a new one. Places, colours,
  labels, collapse and "hide cut" stay; the map takes its start box's
  name; its undo history is cleared. A linked map shows a "Linked to
  Boardkit" chip by its name with "Open in Boardkit" (/boardkit in a new
  tab, opening this board: it sets Boardkit's last open board). "Unlink
  from Boardkit…" (asks first) makes it an ordinary tree with its own
  copy; the board stays in Boardkit as an ordinary board. Another
  Linkkit tab with the map open follows a link or an unlink
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
  parents: see "Two parents" at the top of this section.
  Connections maps work exactly as before.
  - The map menu has "+ New tree" (a blank tree: just its start box,
    centred, its name "Start" open for typing over; left empty it stays
    "Start"; the map takes the start's name until renamed in the
    header). The example tree ("Take the new job?", with one merge) is in
    the template gallery
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
  - Arrows start without a label (no "needs" pill). Pointing at one
    shows a small chip in its middle: "+ label" opens a field to type one
    ("if yes"; Enter or clicking away keeps it, left empty nothing is
    added), and a × deletes the arrow, except on a box's only way in
    (that would leave a loose box), which has none. A labelled arrow shows
    its pill: click it to change the label, emptied it goes away again,
    and the × sits on its corner where allowed. A new, changed or emptied
    label re-tidies the tree so labels never cover a box (rows get as
    much room as the tallest label needs); the label and the room are one
    undo step. The chip itself never takes room
  - Click a box: teal is every way back to the start (through both
    parents where there are two), orange is everything that comes after
    it, the rest fades. The status line says e.g. "Live near the office ·
    Comes from 4 · Leads to 1"
  - Keep / maybe / cut (Treekit's): the tag button in a step's hover
    toolbar, or the "Status" row in its right-click menu (for several
    picked boxes, it sets them all): no status, Keep ✓, Maybe ?, Cut ✂.
    X cuts the selected box(es), or uncuts them when all are cut. Each is
    one undo step, saved with the box. The start has no status (it is the
    question). A small badge on a box's top-left corner shows its status.
    A box looks cut when it is cut, or when every way into it comes from
    a box that looks cut (so a box with two parents stays alive while one
    way in is): it fades under a veil with a dashed border, and the
    arrows into it fade and dash
  - "Hide cut" (header, trees only, with the number of cut branches):
    boxes that look cut leave the page and the tree re-tidies around what
    is left (they keep their places for when they come back). Saved with
    the map and one undo step. Hidden boxes are left out of the
    highlight, its counts and Ctrl+A; cutting a box while it is on hides
    it at once
  - Collapse (Treekit's): the ⇕ button in the hover toolbar of a box with
    next steps, "Collapse branch" / "Expand branch" in its right-click
    menu (several picked: all collapse together, or all expand if all
    are), or Space. Its branch leaves the page and the tree re-tidies
    around what shows; a "+N" badge on the edge its next steps leave from
    (bottom top-down, right left-right) says how many boxes are folded
    away, and clicking it expands. A box another parent still shows
    stays. Adding a next step to a collapsed box expands it first (one
    undo step). Saved with the map, undoable; works together with Hide
    cut (hidden boxes are out of the highlight, its counts and Ctrl+A)
  - Top-down / Left-right, Arrows, Align, colours, undo, Tidy up and
    saving work as in a connections map
  - A damaged saved tree (two starts, a lone box, a loop, an arrow into
    the start) is put back into a tree's shape as it opens, or as it is
    restored from a file. No box is ever deleted, only arrows: the start
    is the oldest box with no way in, arrows into it and each loop's
    closing arrow (with its label) are dropped, and every other box with
    no way in becomes the start's last next step. Boxes keep their
    places. As for connections maps, the original is kept aside and the
    console says so; nothing shows in the app (built as designed; a
    banner was offered and is easy to add if wanted)
  - Sibling order: each box keeps its next steps in order (a new step
    goes last), and Tidy up lines them up that way, left to right (top to
    bottom in Left-right), so a tree doesn't reshuffle as it grows. A box
    with two parents sits under the middle of both, as before. The order
    is what Boardkit's column and card order map onto. Trees saved
    earlier keep the order they show
  - Moving a box to another place in the tree (step 21): drag one box.
    Let go over another box and it becomes that box's last next step;
    let go in a gap between siblings (or just before the first / after
    the last) and it goes there, which is also how siblings are
    reordered by hand. Its whole branch comes along and its arrow keeps
    its label. While dragging, the box it would go under gets the target
    ring (the dragged box turns see-through and rides on top), a gap
    shows a bar, and a chip beside the pointer says "Move under 'Buy'".
    Over a box it can't go under (its own branch; the start can't move
    at all), the chip says why in grey, and letting go puts the box back
    where it started. A box with two ways in can only be reordered under
    either parent. A collapsed box opens when something is dropped on
    it. The tree then re-tidies with its glide; the drag, the move and
    the tidy are one undo step. Let go on bare paper (or somewhere that
    would change nothing): the box just moves on the page, as before.
    Several picked boxes, and connections maps, only move on the page.
    In a tree linked to Boardkit a card can go to another list or be
    reordered, a list only reordered among lists ("'Rent' is a list in
    Boardkit: lists can only be reordered"), and a list already showing
    50 cards takes no more
- The engine underneath: pure TypeScript in `src/domain/` (no React, no
  store), each file with a Vitest test beside it:
  - `types.ts`: the model. A map is `{ id, name, kind, page, direction,
    arrowLength, nodes, links, order }`; `nodes` and `links` are flat
    `Record<id, …>` maps, and `order` lists each box's next steps in order
    (trees only; empty in a connections map). A box is `{ id, name, x, y, color }` (x, y is
    its centre); an arrow is `{ id, from, to, label }`, read "from needs
    to" in a connections map and "from leads to to" in a tree. `kind`
    names the map's rule set: `"connections"` or `"tree"`. An arrow's
    default label is per kind ("needs", or none in a tree)
  - `rules.ts`: the one place that says what's allowed, per kind, in a
    `RULES` table: `canLink(map, from, to)` (may this arrow be drawn?),
    `canDeleteBox`, `canDeleteLink`, `canSetStatus` (a tree's steps, never
    its start), `canCollapse` (a tree box with next steps) and `canPaste` (may copied boxes go
    in?). "connections" refuses only a
    missing box, a box needing itself, or an exact repeat (loops and
    reverse arrows are allowed), lets anything be deleted and anything be
    pasted. "tree"
    also refuses any arrow into the start and any arrow that would make
    a loop; it never deletes the start, nor an arrow that is a box's only
    way in, and never takes a paste. The drag (to show valid drop
    targets), the hover toolbar's bin, an arrow's ×, the menus and the
    store all ask it. `canAddNextStep` (step 20): may this box get a next
    step? Every tree box; never in a connections map. A tree linked to
    Boardkit (`linkedBoard`) gets a third, stricter set, "linked tree":
    the tree rules plus no second way into a box (reason `two-ways-in`)
    and no next step under a card (level 3, `levelOf`, `BOARD_LEVELS`).
    `nextStepRefusal` says why in words. `canMove(map, box, parent)`
    (step 21): may this box, with its branch, become that box's next
    step? Never in a connections map; in a tree never the start, never
    into its own branch, and a box with two ways in only under one of
    them; a linked tree also keeps every box's level and a list's 50
    cards. `moveRefusalText` says why in words
  - `order.ts`: sibling order. `nextSteps(map, box)` reads a box's next
    steps in order, trusting the stored order only for boxes an arrow
    really leads to (the arrows stay the truth). Adding an arrow, deleting
    one and deleting boxes keep it in step; `normalizeOrder` cleans it on
    load, giving older trees the order of their boxes on the page
  - `status.ts`: keep / maybe / cut worked out: `looksCut(map)` (the one
    definition of "looks cut", for Boardkit's badge too) and `cutCount`
  - `shown.ts`: what of a tree is on the page. `shownMap(map)` leaves out
    hidden cut boxes and boxes folded away by collapse (both by the
    "every way in" rule); the canvas draws and lays out only it and the
    highlight walks it. `hiddenAfter` is a collapsed box's "+N".
    `graph.ts` holds the parents-first walk both files use
  - `tree.ts`: edits only a tree needs, each keeping "one start, no loose
    boxes" true in one step: a new tree (just its start box), adding a
    next step (the box and its arrow together), which boxes a delete
    takes along (`branchOf`, or `branchesOf` for several picked
    together), and deleting them; `moveToParent` (step 21: the arrow in
    gets a new start, keeping its id and label, and the box takes its
    place in the new parent's order, or a new place in the same one);
    and `repairTree`, which puts a damaged
    tree back into shape (used by `readMap`)
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
  - `drop.ts` (step 21): `dropSlotAt`, the gap between siblings (or
    just before the first / after the last) under the pointer while a
    tree box is dragged, and where its bar goes; where two parents' rows
    meet, the nearer bar wins. Left-right swaps x and y
  - `glide.ts`: the easing of Tidy up's glide
  - `stress.test.ts`: seeded random edits, merges, undo and redo
  - `history.ts`: undo steps (each stores only what changed; a drag
    joined into one step). After a change from outside, a step is undone
    as a three-way merge (`mergeMaps`: as the step left it, as before it,
    as now), refused on a clash (step 26)
  - `trash.ts`: the trash. `trashBoxes` (delete into one entry, with
    the arrows and sibling places), `restoreFromTrash` (put back, arrows
    re-checked, a tree repaired by `repairTree`), `forgetTrashEntry`,
    `emptyTrash`, `trashOverflow` (what a delete would erase), and the
    deleted-maps list (`withTrashedMap`, `mapTrashOverflow`, its saved
    shape under `linkkit:trash:maps`)
  - `boardRecord.ts` and `bridge.ts` (shared store step 3b1; not used by
    the app yet): Boardkit's saved board as Linkkit reads it
    (`readBoardRecord`: ok / newer / damaged, strict, every field Linkkit
    doesn't use kept as it is; `nextRecord` raises `rev`), and the
    conversion. `boardToTree` builds a linked tree from a board plus
    Linkkit's own `LinkedView` (places, colours, labels, collapse, ...);
    `treeToBoard` writes a tree's titles, statuses, list and card order and
    deletes (into Boardkit's trash, keeping its limits: past them the
    oldest cards or lists are erased and listed in `erased`, so the store
    asks first) back onto the board; `boardProblems`
    and `problemText` name what keeps a tree from being a board ("'Rent'
    has two ways in", "'Walk to work' is 4 levels deep"); `arrangeCards`
    is the divider rule; `linkTree` (step 23) turns an ordinary tree into
    a new board plus its linked map (a fresh start id when a board
    already has its id)
  - `merge.ts` (step 3b2): `mergeMaps(base, mine, theirs)`, two tabs'
    versions of one map made into one (theirs, with this tab's changes
    re-applied item by item; a clash keeps theirs and is named), then
    made whole again (no arrow to a missing box, no repeat, a tree
    repaired by `repairTree`). Also `sameMap` and `shareUnchanged` (so
    only boxes that really changed re-render). Boardkit's
    `domain/merge.ts` for maps
  - `persistence.ts` and `registry.ts`: saving a map with a version
    number (and `rev`, raised by every save) and repairing a damaged save (an unknown `kind` can't be
    read; arrows every kind refuses are dropped: a missing end, a box
    linking to itself, an exact repeat), and the list of saved maps (with
    "(copy)" names). A tree's own shape (several starts, loose boxes,
    loops) is repaired by `repairTree` in `tree.ts`
  - `example.ts`, `ids.ts`, `testMaps.ts`: the example map and example
    tree, ids, test fixtures

- **Old addresses show "Linkkit moved"** (v0.0.48): on any address
  other than gauntlet-home.vercel.app or localhost (e.g. the old
  linkkit-lake.vercel.app, Vercel previews) a full-screen notice replaces
  the app: a big button to gauntlet-home.vercel.app/linkkit/ and a small
  "Export everything saved here" (the same file "Restore all maps from a
  file" reads; saved templates included, the trash is not). It only
  links, never redirects, so nothing can loop; autosave and automatic
  backups don't run there and no storage is cleared. Check:
  `domain/address.ts` (tested).
- **Notes on boxes** (v0.0.52, Treekit's): any box, in any map, can
  carry free multi-line notes. Open them with the notebook in the box's
  hover toolbar, "Notes…" in its right-click menu, or N. They open in a
  side panel on the right (the map stays usable; it follows the
  selection, Esc or a click elsewhere closes it) and save as you type;
  one stretch of typing in one box is one undo step. A box with notes
  shows a small note icon on its top-right corner, and its first four
  lines on hover. Notes go along with save, Export all maps, automatic
  backups, restore, the trash (a deleted box keeps them), duplicate,
  templates, and two tabs (merged per box like a name or colour). Saved
  as an optional `notes` on a box, absent when empty: older saves read
  unchanged, no new save version. Linked maps: see the next point
- **Notes in maps linked to Boardkit** (v0.0.55, owner's plan B): a card
  box's note is the card's "pregame thots" in Boardkit, one text both
  apps edit (the panel says "Shared with Boardkit as this card's pregame
  thots"); the start's and lists' notes are Linkkit's only ("Kept in
  Linkkit only"). A list deleted (in either app) keeps its note while it
  waits in Boardkit's trash, and gets it back when restored; Unlink warns
  first if such a note would be left behind. Owner's rule: two different
  non-empty texts are never overwritten. Where they meet (a linked map
  saved before notes were shared, whose box note and pregame thots
  differ) the box's note icon turns orange, a note at the bottom says how
  many boxes need a pick, and the notes panel shows both ("Boardkit
  (pregame thots)" / "Kept in Linkkit") with "Use Boardkit's", "Use
  Linkkit's" and "Keep both" (joined, Boardkit's first). Until picked the
  note shows (and Boardkit keeps) Boardkit's text; Linkkit's waits in
  `noteClashes`. One side empty just takes the other. Picking is one undo
  step. Check: `bridge.ts` (`noteOfCard`, `withHeldNotes`), tests in
  `linkedNotes.test.ts`
- **Fork into a new map** (v0.0.53, Treekit's fork a branch): right-click
  a box, "Fork branch into a new map" (in a connections map "Fork into a
  new map"). The box and everything after it (what it leads to, or what
  it needs; folded and cut boxes too) is copied into a new map that
  opens, tidied; a note at the bottom says the original is unchanged and
  in the map menu. The copy keeps names, colours, statuses, notes, arrow
  labels, sibling order, folds and the map's settings; the forked box is
  its start (a start has no keep / maybe / cut, so that one status stays
  behind). Fresh ids, no trash, never linked to Boardkit even when the
  original is. Named after its start box, and follows it until renamed
  by hand (a blank box: "Untitled map N"). Not an undo step (like
  Duplicate this map). Check: `domain/fork.ts` (tested)
- **Saves keep what they don't know** (owner's rule, 2026-10-08): a field
  a newer Linkkit adds to a map, a box, an arrow or a trash entry is kept
  as it is by an older Linkkit (another tab not yet reloaded): read,
  carried through its edits and two-tab merges, and saved back, also in
  Export all maps, backups, templates and a linked map's own part (never
  sent to Boardkit). Before this an older tab silently dropped such a
  field on its next save. Unknown *values* of known fields (a colour this
  build doesn't have) are still repaired. Check: `domain/extras.ts`
  (tested)
- **Export and import** (v0.0.54, Treekit's export menu), "Export" in
  the header, for every map: "Export PNG image" / "Export SVG image" (a
  clean picture, no buttons, of exactly what is on screen: every box
  where it is, moved by hand or not, never re-tidied; folded boxes left
  out; cut branches greyed or, with Hide cut on, left out. Fixed in
  v0.0.59: a tree used to be drawn unfolded and freshly tidied, so boxes
  the owner had dragged came out in their old tidied places), "Copy as
  Mermaid", "Download Mermaid (.mmd)" and "Import Mermaid…". The Mermaid
  text is Treekit's format (checked against Treekit's own code: Treekit
  -> Linkkit -> Treekit gives the same text), plus the map's name as
  Mermaid's front-matter title and `%% linkkit connections` on a map
  without tree rules (both skipped by Treekit). Import never touches the
  open map: each separate tree becomes its own new map with tree rules
  on; whatever breaks tree rules (a loop, two starts sharing boxes) one
  map with them off (a box with two ways in is fine in a Linkkit tree).
  The first new map opens, tidied; the others are in the map menu,
  roughly laid out. What can't come across is said at the bottom (an
  arrow from a box to itself; keep / maybe / cut on a start or in a map
  without tree rules). Round trip keeps: box names, arrows and labels,
  sibling order, colours, notes, keep / maybe / cut, direction, the map's
  name and whether tree rules are on. It loses: box places (re-tidied),
  folds, Hide cut, arrow length, arrow style (an import is always
  Straight), label style (always Linkkit's), line breaks in names (Linkkit names are
  one line), the trash. Check: `domain/mermaid.ts` (tested);
  `features/export/` (`html-to-image`, as in Treekit); where the
  image puts things: `domain/imageLayout.ts` (tested: a moved box is
  drawn where it was moved, in any arrow or label style)
- **Zoom** (v0.0.56, Treekit's zoom pill): bottom-left of the screen,
  "−  100%  +"; click the percentage to go back to 100%. 50% to 200% in
  10% steps, in every map (tree rules on or off). Zoom is a magnifying
  glass: no box moves, nothing goes on the undo list, and Tidy up, Align,
  dragging, Add box and double-click work the same at any zoom. As in
  Treekit, the scrolling area is the screen and grows (scrollbars) only
  where the zoomed page doesn't fit: zoomed in, the page scrolls; zoomed
  out, the page (with its dots) gets smaller and sits where Align says
  (centred unless chosen otherwise), the plain paper around it is not
  page, and a box can't be dragged onto it. A zoom keeps what was in the
  middle of the screen in the middle. Each map keeps its own zoom, also
  after a reload (`linkkit:zoom`, map id -> zoom; a map at 100% has no
  entry); it is a view setting, so never in a map's save, an export, a
  backup or the Boardkit link. Differences from Treekit: Treekit's zoom
  is one for the visit, forgotten on reload (owner asked for per map,
  kept); Treekit re-places its tree at each zoom, Linkkit's boxes stay
  where they were put. Like Treekit, no keys: Ctrl + wheel and Ctrl +/−
  are still the browser's own zoom. Check: `domain/zoom.ts`,
  `store/viewStore.ts` (tested); `features/map/ZoomControls.tsx`,
  `MapCanvas.tsx`
- **Arrow styles** (v0.0.57): the "Arrows" panel now starts with "Arrow
  style": **Straight** (Linkkit's arrows, the default; every map made
  before keeps them) or **Elbow** (Treekit's lines). Per map, with tree
  rules on or off, in either direction. Elbow is drawn as Treekit draws
  it: a line leaves the middle of a box's bottom (its right side,
  left-right), runs half the gap, turns along the row with rounded
  corners, and goes into the middle of the next box's top (left side);
  all of a box's lines turn at one depth, like a comb; no arrowheads; a
  label sits on the last stretch into its box, centred between the turn
  and the box (an only line that runs straight has it in the middle of
  the gap), with room left below the turn for it. Treekit never has two
  ways into a box or a loop; Linkkit can, so Elbow adds: two (or more)
  lines into one box come in side by side across its top, each with its
  own stretch and label; boxes in one row whose combs would run along the
  same line turn a little apart so each comb reads as its own; a label
  with no room on its stretch moves along its own line to a free spot;
  an arrow that can't run down the map (a loop back up, or a box dragged
  level with or above the box it comes from) still turns at right angles
  but leaves and enters by the boxes' sides and gets an arrowhead (up and
  down no longer say which way it goes): beside each other it runs
  across, turning in the middle; above, it goes round the right side (the
  bottom, left-right) in a lane clear of both boxes; two arrows between
  the same boxes, one each way, are drawn apart. Picking a style is one
  undo step and moves no box (no re-tidy). Saved with the map
  (`arrowStyle`, "straight" when a save has none), so it survives a
  reload and comes along in Export all maps, automatic backups, Restore,
  Duplicate, Fork into a new map and templates; merged like the other
  map settings between two tabs. In a map linked to Boardkit it is
  Linkkit's own (kept in its record, never written to the board). PNG /
  SVG export draws the map's style. Mermaid can't carry it: Copy /
  Download Mermaid leave it out and an import is always Straight (pick
  Elbow after). Dragging a new arrow or an arrow's end still previews a
  straight line. Check: `domain/arrows.ts` (tested),
  `domain/arrowStyle.test.ts`; `features/map/ArrowLengthPanel.tsx`,
  `LinkEdgeView.tsx`, `features/export/renderMapImage.ts`
- **Label styles** (v0.0.58): in the same "Arrows" panel, right under
  "Arrow style", a "Label style": **Linkkit** (the default; every map
  made before keeps it) or **Treekit**. Set apart from the arrow style:
  any label style goes with any arrow style. Treekit's style is Treekit's
  text exactly: box names in the regular weight instead of medium, boxes
  120-240 wide instead of 72-220 (so names wrap later), a tree's start
  box as a heading (bold, a size up, like Treekit's root; a map without
  tree rules has no start, so no heading); arrow labels a little taller
  (4px above and below the text, tighter lines), with a stronger border,
  and wrapping onto more lines past 160 wide instead of ending in "…".
  Kept Linkkit's in both styles, since they are behaviour, not look: the
  teal / orange label colours of the highlight, a label's hover, click to
  type, and the × on its corner. Font, sizes, centring and padding in the
  boxes, and the label's font size, page-coloured fill, corners and most
  width, were already the same. Where a label sits on its arrow comes
  with the arrow style (Elbow puts it on Treekit's spot), not the label
  style. Picking one is one undo step. A map with tree rules on
  re-tidies itself once its boxes have their new sizes (Treekit's are
  wider, so the rows would touch), in that same undo step. A box moved
  before the new sizes come in calls that re-tidy off, so it never
  undoes the move (fixed in v0.0.60: a late re-tidy could put a just
  dragged box back); any other map
  keeps its boxes where they are (they grow or shrink about their
  middles, as after a rename; Tidy up if they crowd). Saved with the map
  (`labelStyle`, "linkkit" when a save has none) and carried everywhere
  the arrow style is: Export all maps, backups, Restore, Duplicate, Fork,
  templates, a linked map's own record (never the board), merged between
  tabs; PNG / SVG export draws it; Mermaid can't carry it. Check:
  `domain/labelStyle.test.ts`; `features/map/BoxView.module.css`,
  `LinkEdgeView.module.css` (the `[data-label-style="treekit"]` rules),
  `ArrowLengthPanel.tsx`, `MapCanvas.tsx`

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

17. ~~Automatic backups for Linkkit, copied from Boardkit's~~ (done;
    asked for by the owner ahead of 14b, so 14b is next)
19. ~~Boardkit's 7-day backup reminder dot, also in browsers without
    automatic backup (as an export reminder)~~ (done; asked for by the
    owner ahead of 14b, so 14b is next)

Tree mode (a new map kind for decisions, "What should I choose?"; it
will slowly take over Treekit's job; Treekit itself is left alone).
Not in this version (now Treekit parity, T1-T3 below): notes, fork a branch, Mermaid import / export,
turning a connections map into a tree.

14. Tree mode:
    - a. ~~Tree rules, "+ New tree" and "Add example tree", adding next
      steps, a second parent, deleting a branch, the highlight~~ (done)
    - a2. ~~Sibling order (decided under Bridge mapping): each box keeps
      its next steps in order, Tidy up follows it~~ (done; done before
      14b because 14b-14d and the shared store build on it)
    - b. ~~Arrow labels in trees~~ (done). OK'd by the owner: hovering an arrow
      shows a small chip in its middle with the × (where allowed) and
      "+ label"; clicking "+ label" opens a field to type ("if yes");
      Enter or clicking away keeps it, left empty nothing is added. A
      labelled arrow shows the pill (click to edit, × on its corner where
      allowed); emptying it takes the label away again. Typing a label
      re-tidies the tree so it never covers a box (one undo step with
      it). Labels stay on their arrow when its card moves (decided)
    - c. ~~Keep / maybe / cut~~ (done), copied from Treekit (`../treekit/src/domain/
      tree.ts`: hover toolbar and right-click menu, cut branches faded,
      a way to hide cut branches; a box with two parents is cut only if
      every way into it is cut; one undo step each, saved)
    - d. ~~Collapse~~ (done), copied from Treekit (a toggle on a box with next steps;
      saved and undoable, but kept outside the box itself, unlike
      Treekit, so it stays Linkkit's own view state when maps are shared
      (see Bridge mapping, Decided); a box with another parent still
      showing stays; Tidy up lays out only what shows)
    - e. ~~Repairing a damaged tree~~ (done; OK'd by the owner on
      2026-10-07, "as described": no banner). As a tree opens (and when one is restored from a file), `readMap`
      repairs its shape with a new `repairTree` in `domain/tree.ts`. No
      box is ever deleted, only arrows dropped or added, in this order:
      1) the start is the oldest box with no way in (if every box has one,
      a tree that is all loop, the oldest box); 2) arrows into the start
      are dropped; 3) each loop loses the arrow that closes it (the one
      Tidy up already sets aside; its label goes with it); 4) every other
      box with no way in (a second start with its branch, or a lone box)
      becomes a next step of the start, last in its sibling order. Each
      fix counts as a repair, so the original is kept aside
      (`linkkit:damaged:*`) and the console says so, as today. Boxes keep
      their places (no automatic tidy). Statuses, collapse and sibling
      order are cleaned against the repaired arrows. No visible message
      in the app (console only, as for connections maps); offered the
      owner a banner if wanted

15. ~~Selecting several boxes: the marquee, moving them together, copy /
    paste / duplicate / delete / colour~~ (done; asked for by the owner
    ahead of 14b, so 14b is still next)
16. ~~Ready for the gauntlet's shared address: served under /linkkit
    too, storage keys checked (all already "linkkit:", nothing renamed),
    "Export all maps" and "Restore all maps from a file"~~ (done; asked
    for by the owner ahead of 14b, so 14b is still next. Later, not now:
    a data store shared with Boardkit, and a canvas holding live pieces
    of these apps)
18. ~~A trash for Linkkit~~ (done, v0.0.30; OK'd by the owner on
    2026-10-07 as proposed below), before the bridge's shared store (bridge step
    3): the bridge decisions below promise that nothing is erased except
    by emptying the trash or confirming its overflow warning, and step 3
    is when deletes start crossing between the apps. Ported from
    Treekit's trash but wider (see "Trash in Linkkit" under Decided):
    deleted boxes and branches with their arrows, and deleted maps, with
    an overflow warning like Boardkit's. Linked maps later send deletes
    to Boardkit's trash instead

    Design (2026-10-07, OK'd by the owner and built as written):
    - Two parts. Deleted boxes: each map keeps its own trash inside the
      map (`map.trash`), like Boardkit's per-board trash, so it travels
      with exports and backups. Deleted maps: a list `linkkit:trash:maps`
      (id, name, when); the map's saved record stays under its own key
      until erased, so restoring just puts it back in the map list
    - One delete = one trash entry: the boxes it removed (whole: name,
      colour, status, place), every arrow touching them (labels too) and
      their spots in sibling order. Shown as "'Rent' and 4 more · 2 days
      ago". Goes there: deleting a box or branch (toolbar, menu, Delete
      key), a selection, and Cut. Not trashed: deleting one arrow on its
      own (undo only; arrows aren't items in Boardkit either), and a new
      box left without a name
    - Restore: boxes go back to their old spots with their arrows to any
      box still there (arrows the rules now refuse are left out); in a
      tree they rejoin their parent at their old place in its order. A
      tree branch whose parent is gone becomes a next step of the start
      (14e's repair rule); a tree then re-tidies (same undo step)
    - Limits and overflow, Boardkit's way: 200 boxes per map's trash
      (whole oldest entries go), 30 deleted maps. A delete that would push
      something out asks first, naming it ("will erase 'Rent' and 3 more
      boxes, deleted 5 days ago"): Cancel / "Delete and erase the oldest"
    - Deleting a map no longer says "for good" and no longer asks (it can
      be restored). The last map still can't be deleted
    - UI: Treekit's trash button in the header (icon + count) opens
      "Recently deleted": "From this map" and "Deleted maps", each row with
      Restore and "Delete for good"; "Empty trash" asks first (it erases
      deleted maps, which undo can't bring back)
    - Undo: deleting, restoring and erasing boxes are ordinary undo steps
      of that map (as in Boardkit, where emptying the trash is undoable
      too). Map trash actions aren't undoable, like the map list today
    - "Export all maps" and automatic backups carry each map's box trash;
      deleted maps are left out. Older saved maps open with an empty
      trash; an unreadable trash entry is dropped without failing the map

### The owner's queue (given 2026-10-06, work in this order)

The owner asked for these in order, each in its own chat. Before building
any step whose design isn't approved here, stop, give a short design
summary and wait for the OK. After each step: build, tests and lint pass,
PROJECT.md updated, pushed, and say what couldn't be tested.

1. ~~Backup reminder dot~~ (done, step 19)
2. Tree mode 14b-14e, one design summary per step, each checked against
   the Decided section and the field mapping: ~~14a2 sibling order~~,
   ~~14b~~, ~~14c~~, ~~14d~~, ~~14e~~ (done)
3. ~~Step 18, Linkkit's trash: deleted boxes and branches
   with their arrows, plus whole maps; warns before overflow like
   Boardkit's~~ (done)
4. The shared store (bridge step 3), needs the most care: before any
   code, give the owner the design, including how existing Boardkit
   boards and Linkkit maps are migrated, and how a failed save behaves in
   each app
   Design (2026-10-07, OK'd by the owner "as described", including both
   recommendations: shared data inside Boardkit's board record, and "Link
   to Boardkit" creates a new board only, linking an existing board is
   later; nothing built yet). Next: 3a, then 3b, each in its own chat.
   3a is built in the Boardkit repo (`../Projects/boardkit`, following its
   own CLAUDE.md), then PROJECT.md here is updated too:
   - What it rests on: sharing works only where both apps share one
     address, the gauntlet site (gauntlet-home.vercel.app/linkkit and
     /boardkit share one localStorage). At linkkit-lake / boardkit-iota
     each app has its own storage, so Linkkit offers linking only where
     Boardkit's data is present (`boardkit:registry` exists)
   - Where shared data lives (recommended): in Boardkit's own board
     record, `boardkit:board:<id>`, which already holds every shared field
     (titles, list and card order, trash). A linked map's
     `linkkit:map:<id>` then holds only Linkkit's own parts (box places
     and colours, arrow labels keyed by the box they point into, so a
     moved card keeps its label, collapse, hide cut, direction, arrow
     length) plus `linkedBoard`. The tree is built from the board each
     time it opens. One copy of the shared data, nothing to keep in step,
     and Boardkit barely changes. Rejected: a new neutral `gauntlet:` key,
     which would split every linked board in two and still have to hold
     dividers and notes (they sit in `cardOrder`)
   - Linkkit writes a linked board by reading the stored record, changing
     only the shared fields it owns and writing it back, so pregame /
     postgame text, dividers, notes, colours, background survive untouched
   - Code: the board <-> tree conversion is pure functions in Linkkit's
     `domain/` with tests. Boardkit's record format stays Boardkit's; Linkkit
     reads it through one module (`store/persistBoard.ts`-like), so a
     Boardkit format change touches one file in Linkkit
   - Version guard: Boardkit's record gets version 2 (adds `status` on
     lists and cards, and `rev`, a number raised by every write). An app
     that finds a version newer than it knows opens that board read-only
     with a message ("made by a newer Boardkit, reload"). Today Boardkit
     calls a newer version "unreadable" and offers to continue empty, which
     would wipe it; that changes first. Boardkit ships before Linkkit
   - Two tabs at once (Linkkit and Boardkit side by side, or two tabs of
     one app, which today overwrite each other): both apps listen for the
     browser's `storage` event and reload a record another tab changed.
     Linked boards save at once, not after 400ms. Before each write the
     app checks `rev`: if another tab wrote since, it takes their version
     and re-applies its own last change on top when that touches other
     items; when both changed the same item, theirs stays and a message
     names it ("'Rent' was just changed in Boardkit"), the rule already
     decided for undo
   - Migration: none forced. Existing boards load as before (no `status`
     = none, `rev` starts at 0); existing maps stay unlinked and unchanged.
     A map turns into the linked form only through "Link to Boardkit"
     (queue item 5), which creates the board from the tree and slims the
     map's record in one go, keeping the old record aside until both
     writes are stored. Moving data to the gauntlet address uses what
     exists: Linkkit's "Export all maps" / "Restore all maps from a file",
     Boardkit's backup folder restore
   - A failed save, Boardkit: unchanged (banner, unsaved copy in memory,
     "Try again", leave-site prompt), except a retry goes through the
     `rev` check, so it never overwrites what Linkkit stored meanwhile
   - A failed save, Linkkit (linked map): shared part first, Linkkit's
     part second. Shared write fails: Linkkit's part isn't written either,
     the usual banner shows, the change waits in memory, and Boardkit's
     tab simply doesn't see it yet; "Try again" goes through the `rev`
     check. Linkkit's part fails after the shared one stored: Boardkit is
     already right; new boxes just lack places, which Linkkit fills by
     tidying them in on the next open. Leaving the page while a save is
     failing asks first, as Boardkit does
   - A linked board deleted in Boardkit (boards are erased, after its
     question): Linkkit keeps its last copy as an ordinary unlinked tree,
     so nothing is lost; Boardkit's delete question names the linked map
   - Built in two steps: 3a Boardkit (version 2, `status` kept, newer
     version read-only, `rev`, reload on `storage` events), 3b Linkkit
     (the conversion functions and tests, linked map storage, `rev`-checked
     writes, `storage` events, failed saves). Nothing visible changes until
     "Link to Boardkit" exists (item 5's steps), except that two tabs of
     one app stop overwriting each other
   - Steps: 3a Boardkit side: 3a1 done (Boardkit v0.0.82: version 2 with
     `status` and `rev`, newer versions open read-only), 3a2 done
     (Boardkit v0.0.83: `storage` events and `rev`-checked writes; two
     Boardkit tabs no longer overwrite each other); 3b Linkkit side, split
     in three (each its own chat): ~~3b1 the conversion~~ (done: pure
     `domain/boardRecord.ts` and `domain/bridge.ts` with tests, nothing
     wired in yet); ~~3b2: two Linkkit tabs stop overwriting each
     other~~ (done, v0.0.31: `rev` on `linkkit:map:` records, a three-way
     merge of maps in `domain/merge.ts`, reload on `storage` events; the
     same merge then serves linked maps); ~~3b3: linked map storage~~ (done, v0.0.32). The shared store is
     built; queue item 5 planned it as steps 20-27
   - What 3b3 settled: the owner decided (2026-10-07) that a linked map's
     record also keeps a backup copy of the shared parts (names, order,
     statuses), refreshed whenever Linkkit opens or saves the map, used
     only when the board is deleted, damaged or from a newer Boardkit
     (without it, a board deleted while no Linkkit tab was open would leave
     nothing). So a linked tree's `linkkit:map:<id>` is version 2: the
     whole map plus `linkedBoard` (an older Linkkit calls it unreadable
     rather than save over the link); every other map stays version 1.
     Exports, backups, duplicates and file restores are always ordinary
     unlinked trees. Boardkit's keys are touched only in
     `store/persistBoard.ts`. One merge for both records: the tree the
     board makes now, over the stored copy, is "theirs" (`linkedTree` in
     `domain/bridge.ts`). Opening tidies in boxes made in Boardkit (no undo
     step); while open, Boardkit's saves and board renames arrive live,
     new boxes tidied in. Linked trees save at once. Renaming the map
     renames the start box and the board in Boardkit's list. Edits that
     break a board's shape are refused with a toast (a step under a card, a
     second way in). A newer or damaged board opens Linkkit's copy
     read-only with a banner, gone once the board reads again. Not yet: a
     linked map's deletes still also land in Linkkit's own trash; sending
     them only to Boardkit's trash, with its overflow question, is item 5's
     (done in step 22).
     Not tested by hand: a real Boardkit beside it (simulated by writing its
     keys from a second tab) and really full storage (unit-tested)
   - What 3b2 settled (choices made while building, within the OK'd
     design): `rev` was added to version 1 records without a new version
     number, because an older Linkkit tab still open after a deploy calls
     an unknown version unreadable and would set the map aside; exported
     files carry no `rev`. Items for the merge: a box field by field
     (name, colour, status, place = x and y together), so renaming in one
     tab and moving in the other is no clash; an arrow whole; sibling
     order re-applied next to the same neighbour (Boardkit's rule); map
     settings one by one; trash entries whole; collapse box by box, this
     tab winning, never named (like Boardkit's folded lists). A box
     deleted in one tab and changed in the other stays as the other tab
     has it; when this tab's delete loses, the box keeps its arrows and
     leaves this tab's trash entry. After merging, a tree is repaired with
     `repairTree` (two tabs can each add a fine arrow that together close
     a loop). The deleted-maps list and the map list are read fresh
     before each change (read-modify-write), so they need no merge. A map
     erased in another tab is never written again this session. The note
     is a small toast at the bottom (Linkkit had none; Boardkit uses
     sonner, Linkkit got a hand-made one rather than a new library), gone
     after 6 seconds or on its ×. Not tested by hand: two real tabs
     typing at once (the browser pane can't drive two visible tabs; the
     second tab was simulated by writing storage, which fires the same
     `storage` event)
   - What 3b1 settled: the start box's id is the board's id, and the
     arrow into a box has that box's id (one way in each, so it's unique;
     labels are kept by it). Linkkit reads Boardkit's record strictly:
     anything not clean is "damaged" and never written by Linkkit (Boardkit
     repairs it when opened there). A list Linkkit would fill past
     Boardkit's 50 cards is refused. Two cards swapped next to each other
     count as the lower one moved up (matters only for which side of a
     hidden divider it lands). A box Linkkit puts back in a linked tree
     comes out of Boardkit's trash. Not done yet: the trash overflow
     question for linked deletes (Boardkit's limits), left for item 5's
     steps along with every other linked-map action
   - What 3a2 settled, for 3b to match: Boardkit's three-way merge is pure
     and tested, in Boardkit's `src/domain/merge.ts` (base = the record as
     the tab last read or wrote it, mine = the tab now, theirs = what is
     stored). An item is a card or list, its fields together with where it
     sits (list, position, trash), or the background; a move is re-applied
     next to the same neighbour, not at an index. Both changed one item:
     theirs stays and a toast names it ("“Rent” was just changed in
     another tab, so that version was kept."). Every Boardkit write reads
     the stored `rev` first and writes `rev + 1`; a write that changes
     nothing is skipped, so tabs don't echo saves back. So a Linkkit write
     to a linked board must also read the stored record, raise its `rev`
     by one, and merge if `rev` moved; Boardkit tabs then take Linkkit's
     write in through the `storage` event like any other tab's. For now,
     taking in another tab's change clears that board's undo history in
     Boardkit (an undo step restores whole slices); the per-item undo
     refusal decided under Bridge mapping is queue item 5's cross-app undo
5. ~~Only plan, don't build: turn the linking work into numbered steps in
   "What's next": the "Link to Boardkit" action, the stricter rules for
   linked trees in rules.ts, the cut badge in Boardkit, and cross-app undo~~
   (done 2026-10-07: steps 20-27 below)

### Linking to Boardkit (queue item 5's plan, steps 20-27)

Work in this order, one chat each. Every step still needs its short
design summary and the owner's OK before code (the queue's rule); the
choices already decided under Bridge mapping and in steps 3a-3b are not
reopened. Where things stand: linked maps can be stored, opened and saved
(3b3), but nothing in the app creates one yet, so until step 23 they are
tested by writing the records by hand, as in 3b3. Steps 24-25 are built in
the Boardkit repo (`../Projects/boardkit`, its own CLAUDE.md), then this
file is updated too.

20. ~~Linked-tree rules in `rules.ts`~~ (done, v0.0.33; design OK'd by
    the owner 2026-10-07 as proposed). A third rule set, "linked tree",
    picked by `linkedBoard`: no second way into a box, no next step under
    a card. In a linked tree a card has no "+" on its toolbar, no "Add
    next step" in its menu and no connect dot; "Add box" with a card
    selected is greyed out, its tooltip saying why ("'Flat in town' is a
    card, and cards can't have next steps in Boardkit"). The board and
    lists keep all of it. The store's after-the-fact check
    (`linkedProblem`) stays as the last guard. Also changed: the hint
    line under the header has its own wording for linked trees (the tree
    one offered "a second way in"). "No change of level" needs no rule
    yet: nothing moves a box to another parent until step 21. Tested in
    the browser with a linked map and board written into storage by
    hand (no real Boardkit beside it)
21. ~~Moving a box to another parent, in any tree~~ (done, v0.0.34;
    design OK'd by the owner 2026-10-07 as proposed, with all three
    recommendations: re-tidy after a drop, a box with two ways in only
    reordered, no "Move to…" menu yet). Needed because a linked
    tree refuses the second way in that today's two-step move uses, so a
    card couldn't change lists at all. Drag a box onto another box (or
    between two siblings) to make it that box's next step at that place;
    reordering siblings by hand comes with it (Boardkit's list and card
    reorders already show here; this is the way back). Keeps the arrow's
    label (decided). Linked trees: `canMove` refuses a change of level;
    the divider rule is `arrangeCards` (built in 3b1). Design summary must
    show how the drag looks and how it differs from today's drag (which
    only moves a box on the page). Built as described under What works
    now. Choices made while building: the target ring is the connect
    target's (accent blue, not teal as the design sketch said, so one
    ring means "letting go here does it"); a drop that would change
    nothing shows nothing and just moves the box on the page; letting go
    on a refused box puts the dragged box back; the dragged box now rides
    above the others (it used to slide under boxes later in the page).
    The 50-card check counts the cards the tree shows; Boardkit's hidden
    dividers and notes are still caught when the board is written. Not
    tested by hand: a linked tree with a real Boardkit beside it (the
    store and the board write are unit-tested), and a real mouse's drag
    in the browser pane (driven by the pane's drag and by pointer events)
22. ~~A linked map's deletes go only to Boardkit's trash~~ (done,
    v0.0.35; design OK'd by the owner 2026-10-07 as proposed). Built as
    described under What works now. Choices made while building: an undo
    or redo that would overfill the board's trash asks too (undoing an
    "add" trashes the card in Boardkit); a linked map holds its save while
    a new box is still nameless (before, it reached Boardkit as an untitled
    card and, left nameless, landed in Boardkit's trash); one delete that
    erases several things names the oldest "and N more"; "Open trash in
    Boardkit" opens /boardkit without choosing the board (Boardkit has no
    links to a board, and which board it shows is Boardkit's own setting).
    Older linked records' Linkkit trash entries are dropped as they open
    (those boxes are already in the board's trash). Not tested by hand: a
    real Boardkit beside it (board written into storage by hand). The
    plan as first written: today they land
    in both: `treeToBoard` already trashes them on the board, and Linkkit
    also adds its own trash entry. Then: no Linkkit trash entry for a
    linked map; Boardkit's limits (200 cards, 30 lists per board) and its
    overflow question, naming the oldest item it would erase, before the
    delete; the trash panel for a linked map shows "Open trash in
    Boardkit" instead of "From this map". A restore made in Boardkit
    arrives through the `storage` event and is tidied in
23. ~~The "Link to Boardkit" action (the switch that makes linking
    visible)~~ (done, v0.0.36). The owner left the three design questions
    to Claude ("do whatever u think is best"), so all three
    recommendations were built: an "Unlink from Boardkit…" action (asks
    first; the map keeps its copy as an ordinary tree, the board stays);
    "Open in Boardkit" opens this board (it sets Boardkit's
    `activeBoardId`, only which board Boardkit shows next); linking
    erases the map's own trash, which the question says when there is
    any. Also chosen: a question before linking (what it makes), linking
    clears undo, the new board goes last in Boardkit's list without
    becoming Boardkit's open board. Built as described under What works
    now. Not tested by hand: a real Boardkit beside it (Boardkit's list
    and board written into storage by hand, at a local address), opening
    /boardkit (no Boardkit at the dev address; the link's target and the
    `activeBoardId` write were checked), and two real tabs (unit-tested).
    The plan as first written: In the map menu, for trees, shown only where Boardkit's
    data is present (`boardkit:registry`). A tree that doesn't fit is
    refused, naming each box in the way (`boardProblems`, built). Else, in
    one go: creates the board record (version 2) from the tree, adds the
    board to Boardkit's list (a new write in `store/persistBoard.ts`),
    turns the map into the linked form, keeping the old record aside until
    both writes are stored. A linked map then shows that it is linked
    (e.g. a small "Linked to Boardkit" chip with "Open in Boardkit" to
    /boardkit). To ask the owner in the design: an "Unlink" action (the
    map keeps its copy as an ordinary tree, the board stays in Boardkit),
    or leave unlinking to deleting the board. Linking an existing board
    stays later (decided)
24. ~~Boardkit: the keep / maybe / cut badge~~ (done in Boardkit
    v0.0.84; show only, the owner's call: statuses are set in Linkkit). A small badge on cards and
    lists that have a status; anything under a cut item looks cut (a cut
    list fades its cards), computed, never stored, by the same definition
    as Linkkit's `looksCut` (`domain/status.ts`, copied with its tests).
    Boardkit only shows it; setting a status from Boardkit is not asked
    for (ask the owner in the design)
25. ~~Boardkit: deleting a linked board names the linked map~~ (done in
    Boardkit v0.0.85, design OK'd by the owner 2026-10-07 with both
    recommendations: a linked map in Linkkit's trash is named too ("is a
    map in Linkkit's trash, linked to this board; restored there, it
    comes back as an ordinary tree"), and the question adds that the
    map's deleted boxes, kept in the board's trash, go with it.
    Boardkit's `store/linkedMap.ts` reads `linkkit:registry`,
    `linkkit:trash:maps` and `linkkit:map:<id>`; anything it doesn't
    recognise means no link). As planned: names the linked map in its
    question ("'Rent or buy' is also a map in Linkkit; Linkkit keeps its
    copy as an ordinary tree"). Boardkit finds it by reading Linkkit's
    records for a `linkedBoard` equal to the board's id (reading only;
    Linkkit's keys are still written only by Linkkit)
26. ~~Cross-app undo in Linkkit~~ (done, v0.0.37; design OK'd by the
    owner 2026-10-07 as proposed, with the recommended wording). Built as
    a merge rather than marking steps: an undo step whose parts are still
    exactly as it left them is undone as before; otherwise it is undone
    with `mergeMaps` (base = the map as the step left it, mine = before
    it, theirs = now), so only its own items go back, and a clash with an
    outside change is the refusal. Same result as the plan, no second
    bookkeeping. Wording: "in another tab" for an ordinary map, "in
    Boardkit or another tab" for a linked one (Linkkit can't tell which).
    Also: a linked tree's undo that would break the board's shape is
    refused with that reason; linking and unlinking still clear undo. Not
    tested by hand: a real second tab or a real Boardkit (simulated in the
    browser pane by writing storage and firing the `storage` event). The
    plan as first written: today taking in another tab's or app's
    change clears the map's undo history. Instead (decided under Bridge
    mapping): each undo step knows which items it touches; an item changed
    from outside marks the steps that touch it; undoing a marked step is
    refused with a message naming it ("Can't undo further: 'Rent' was
    changed in Boardkit"), and that step and every older one are dropped;
    redo keeps what was undone before. Pure logic in `domain/history.ts`
    with tests. Same for two Linkkit tabs
27. ~~Cross-app undo in Boardkit~~ (done in Boardkit v0.0.86, design
    OK'd by the owner 2026-10-07 as proposed). The same merge as step 26:
    a step whose slices changed since is undone with Boardkit's
    `mergeBoards`, keeping what came in; a clash refuses it and drops
    that step and older ones ("Can't undo further: “Rent” was changed in
    another tab", "in Linkkit or another tab" for a board linked to a map,
    found with `findLinkedMap`). Not tested with a real Linkkit beside it
    (simulated in the browser pane by writing storage and firing the
    `storage` event)

### Usability pass (owner's brief, 2026-10-07)

One commit per item. Short entries only.

- ~~U0. Undo data bug~~ (done, v0.0.38). A seeded stress test
  (`domain/stress.test.ts`: random edits, two-tab merges, Boardkit edits
  on a linked tree, undo, redo; every map must load without repair, every
  board must read cleanly) found Boardkit's v0.0.87 bug here too: undoing
  an added box after another tab drew an arrow to it left the arrow
  pointing at nothing. Fixed as Boardkit did: each undo step keeps the
  whole maps it went between. It also found that redoing a list's delete
  after Boardkit put a new card in it turned the card into a list; that
  undo / redo is now refused up front with the reason. Everyday run: 150
  seeds (2,250 runs, ~2s); `STRESS_SEEDS=5000 npm test` for a long one
  (75,000 runs, all pass)
- ~~U1. Arrows~~ (done, v0.0.39). Click an arrow's line to pick it
  (accent colour, a round handle on each end); Delete, the right-click
  menu ("Change label" / "Delete arrow") or its × delete it. Drag a
  handle onto another box: in a connections map that end moves there
  (id and label kept); in a tree either end moves the box the arrow
  leads to under that box, with its branch (one way in: `canMove`; one of
  several ways in: just that arrow). Refusals never pass silently: a box
  that refuses shows a red dashed ring and a chip saying why before
  letting go, and a short hint (`store/hint.ts`, `HintBubble`) appears
  where the user acted: deleting a box's only way in ("In a tree every
  box needs a parent: drag the box to a new parent, or delete the box."),
  the start's delete or status, copy / paste in a tree, double-clicking a
  tree's paper, a refused connect, folding a box with no next steps, a
  step under a card. Choice made: in a tree both ends of an arrow do the
  same thing (the brief named the child end; the parent end is where
  people grab too, and re-parenting is the only change a tree allows)
- ~~U2. Moving a box to another parent~~ (done, v0.0.40). Step 21's drag
  worked, but felt like it didn't, for three reasons found in the browser:
  after the re-tidy the moved box often lands where it was (only its arrow
  changes); the drop target followed the pointer, so a box grabbed near
  its edge could sit right on a box with nothing lit; a refused box showed
  no ring. Now: the box the dragged box mostly covers counts when the
  pointer is over none (`mostCovered` in `drop.ts`); the target is tinted
  and ringed and never faded by the highlight; a refused target, and the
  dragged box itself, get a red dashed border, a not-allowed pointer and
  the reason, and letting go there puts the box back with a hint; over its
  own parent the chip says "Already under …" and letting go puts it back;
  after a move the moved box is picked, so its new path lights up. Linked
  trees still sync through the same `moveToParent`
- ~~U3. Naming~~ (done, v0.0.41). The UI calls everything a map; a tree
  is "a map with tree rules on" (owner's decision). UI text only: storage
  keys, `kind: "tree"` and code names unchanged. Menu: "+ New map with
  tree rules", "Add example map with tree rules"; a new one is "Untitled
  map"; the hint line starts "Tree rules on." (linked: "Tree rules on,
  shared with Boardkit."); dialogs, banners, the linked chip and refusal
  messages say "map" / "with tree rules on". This file still says "tree"
  for short
- ~~U4. Empty boxes~~ (done, v0.0.42). A box can be blank: left without a
  name (Enter or clicking away) it stays, showing a faint italic
  "Untitled" (display only), and a name can be emptied. Esc on a box just
  added still takes it back (no undo step left). Replaces "a box left
  without a name goes away". Boardkit (read, not changed): card and list
  titles may be empty there too (its own fields allow it; lists show
  "Untitled list" in some places), so a blank card or list syncs as an
  empty title. A board name is never blank in Boardkit (its field refuses
  it; a blank one would show as an empty row in its board menu), so a
  linked map's start box can't be emptied: the old name stays. Nothing
  Boardkit needs
- ~~U5. Paste an outline~~ (done, v0.0.43). Pasting two or more lines
  while typing a box's name: the first line goes into the name (joined
  with what was typed around it), each other line becomes a new box
  (`domain/outline.ts`). A tab or 2+ more spaces than the line above
  makes a child of it; lines back out to the line they line up with; no
  indent is a sibling of the box. Bullets (-, *, +, •, 1., 1)) and blank
  lines are dropped. With tree rules on, children are next steps; lines
  level with the first go under the box's parent (under the start itself
  when pasting into the start); a linked map keeps three levels (too deep
  goes under the deepest box allowed). In a connections map a child gets
  an arrow from the box above it ("needs"); level lines stand alone.
  Typing ends, the map re-tidies, all one undo step (with a new box's own
  "add"). Single-line paste is unchanged. Choice made: a connections map
  re-tidies as a whole after an outline paste (new boxes need places;
  undo restores the old layout)
- ~~U6. Templates~~ (done, v0.0.44). Map menu: "New from template…" opens
  a gallery of cards, each with a small picture of the template's shape
  (`TemplateThumb`, laid out by `layoutMap`); one click makes a new map
  from it (fresh ids, ordinary boxes, tidied as it opens). "Save this map
  as a template" keeps the open map (no trash, never linked; named after
  its start box while the map is untitled) in `linkkit:templates`, shown
  under "Your templates" with a two-click "Remove". Built in
  (`domain/templates.ts`, written as outlines): Weigh a decision, Project
  plan, Priorities (must / should / could / won't), Five whys,
  Brainstorm (all with tree rules on) and What it depends on (a
  connections map). Not in "Export all maps" or automatic backups yet
- ~~U7. Tree rules vs Treekit~~ (report only, nothing built). Has: drag
  branches (box drag or an arrow's end, plus sibling reorder), keep /
  maybe / cut (with Hide cut), collapse, 8 colours, undo / redo (also
  across tabs and Boardkit), trash (wider than Treekit's: boxes,
  branches and maps). Partly: several trees (one start per map; several
  maps instead of several roots on one board); collapse has no "expand
  all". Missing: notes on boxes, fork a branch (copy / paste is off with
  tree rules; "Duplicate this map" copies everything), export PNG / SVG /
  Mermaid (only "Export all maps" as JSON), import Mermaid, zoom (the
  camera is locked by design; the page scrolls; zoom came later as T4)
- ~~U8. Outline paste without tree rules~~ (done, v0.0.45; replaces U5's
  whole-map re-tidy, owner's call). Only the new boxes are laid out, as a
  small tidy block in free space beside the box pasted into (below it,
  centred, top-down; to its right left-right; the other side, then
  further out, while taken: `placeBlockBeside` in `page.ts`). Nothing
  else moves; still one undo step
- ~~U9. Map name follows the start box~~ (done, v0.0.46). With tree
  rules on, renaming the start box renames the map while the map is
  still "Untitled map" or still the start's old name; once renamed by
  hand to something else, that name sticks (`followStartName` in
  `tree.ts`; no new stored field: the rule is read from the names). Part
  of the same undo step; an undo now also updates the map list's name.
  A blank start leaves the name alone; linked maps unchanged (always the
  start's name)
- ~~U10. Templates in backups~~ (done, v0.0.47). "Export all maps" and
  automatic backups also hold the saved templates (`templates` in the
  file, same version 1: older files read as none, an older Linkkit
  ignores them); a template change also schedules an automatic backup.
  Restoring adds the templates not here yet (by id; twice adds nothing)
  and says how many came back. Replaces U6's "not in backups yet"
- ~~U11. Map names you can tell apart~~ (done, v0.0.49). New maps (and
  new maps with tree rules) are "Untitled map", "Untitled map 2", "3" …;
  a second map from one template gets " 2" too. Every map now takes its
  first box's name (a tree: its start's) while still untitled or still
  that box's old name, until renamed by hand (`followBoxName` in
  `domain/names.ts`, replacing U9's `followStartName`). Names that still
  repeat in the list (typed by hand, or two maps whose first box has the
  same name) show numbered in the map menu and header ("Rent", "Rent 2",
  the older one keeps the plain name); stored names are never rewritten
- ~~U12. Examples are templates~~ (done, v0.0.50). "Add example map" and
  "Add example map with tree rules" left the map menu; both examples
  (Microsoft 365 sign-in, Take the new job?) are the first two cards in
  the gallery's "Ready-made" (`make` instead of an outline in
  `BUILT_IN_TEMPLATES`, since their shared steps don't fit an outline).
  A first visit still opens the sign-in example; while it is untouched,
  or whenever the open map has no boxes, the status line ends with
  "Start from a template or example…", which opens the gallery: another
  example is one click away (gallery open state: `store/gallery.ts`)
- ~~U13. Naming templates~~ (done, v0.0.51). "Save this map as a
  template…" opens a small name field filled with the map's name (its
  start / first box's while untitled) and selected: Enter saves, typing
  replaces it, Esc or Cancel saves nothing (`SaveTemplateDialog.tsx`).
  Saved templates have "Rename" beside "Remove" in the gallery (the name
  becomes a field; Enter or clicking away keeps it, Esc cancels without
  closing the gallery, blank keeps the old name). A name another
  template has (built in or saved) is numbered, "Party 2"
  (`freeTemplateName`); older duplicates show numbered in the gallery

Treekit parity (owner, 2026-10-08: Linkkit's tree mode does everything
Treekit does, so Treekit can be retired; Treekit is the reference, read
only). Decided: several trees on one map is not built (one tree per
map); a Mermaid import opens each tree as its own new map and never
replaces the open map.

- ~~T1. Notes on boxes~~ (done, v0.0.52; see What works now)
- ~~T1b. Notes in maps linked to Boardkit~~ (done, v0.0.55; see What
  works now). Decided by the owner: plan B (a card's note is its pregame
  thots; the start's and lists' are Linkkit-only); two different
  non-empty texts are never overwritten: both are shown and the user
  picks
- ~~T2. Fork a branch~~ (done, v0.0.53; see What works now). Decided by
  the owner: the fork is always unlinked; its name follows its start box
- ~~T3. Export PNG / SVG / Mermaid, import Mermaid~~ (done, v0.0.54; see
  What works now). Decided by the owner: export works for every map; an
  import that breaks tree rules opens with tree rules off, never refused
- ~~T4. Zoom~~ (done, v0.0.56; see What works now). Asked by the owner:
  Treekit's range, pill and behaviour; locked camera and native scroll
  kept; every map, tree rules on or off; per map, kept across reloads,
  never in exports or the Boardkit link
- ~~T5. Arrow styles~~ (done, v0.0.57; see What works now). Asked by the
  owner: a per-map setting, Linkkit's straight arrows (the default, kept
  by existing maps) or Treekit's elbow lines matched exactly, labels
  included; works with tree rules on or off; saved with the map and in
  exports, backups, duplicate, fork and templates; never sent to
  Boardkit; PNG / SVG draw it; Mermaid can't carry it, so imports are
  Straight. Choices made without asking, easy to change: Elbow lines
  have no arrowheads (as in Treekit) except the ones that can't run down
  the map; the choice sits in the "Arrows" panel above the length;
  switching style doesn't re-tidy. A busy row of shared boxes (the
  example's Outlook / Teams / SharePoint) reads better with Long arrows,
  which give the turns more room
- ~~T6. Label styles~~ (done, v0.0.58; see What works now). Asked by the
  owner: compare box text and arrow labels with Treekit's, list every
  difference, and add a per-map label style (Linkkit's, the default, or
  Treekit's) next to the arrow style but set on its own; older saves keep
  Linkkit's; unknown fields kept on save. Choices made without asking,
  easy to change: Treekit's style includes Treekit's wider box bounds
  (they decide where names wrap) and a tree's start as a bold heading;
  the highlight colours, hover and click-to-type stay Linkkit's; a tree
  re-tidies after a switch, other maps don't move; the choice is in the
  "Arrows" panel (its button still says "Arrows")

### Bridge mapping (plan for the shared store, bridge step 3)

Goal: one store under Linkkit and Boardkit, so changing an item in one
changes it in the other, moves included. Written before 14b–14d so their
new fields land on the right side. Checked against both apps' code
(`src/domain/types.ts` in each repo, 2026-10-06).

**Linkkit today:**
- Map: `{ id, name, kind, page, direction, arrowLength, nodes, links }`
- Box (node): `{ id, name, x, y, color }`. Nothing else: no text
  fields, no status, no order, no timestamps
- Arrow (link): `{ id, from, to, label }`
- Outside the map: the map list (`linkkit:registry`, ids + names),
  `linkkit:active`, `linkkit:starter`, `linkkit:damaged:*`,
  `linkkit:align`. Not saved: selection, undo history, clipboard
- Siblings have NO stored order: left-to-right comes from Tidy up
- Deleting goes to a trash (step 18): boxes into the map's own
  `map.trash`, maps into `linkkit:trash:maps`

**Boardkit today:**
- Board (`BoardState`): `lists`, `cards` (flat records like Linkkit's),
  `listOrder` (columns left to right), `cardOrder` (cards top to bottom,
  per list), `trash`, `trashedLists`, `background`, `collapsedLists`.
  The board's id and name live only in the board list (`BoardSummary`)
- List: `{ id, title, color?, icon?, width?, continuesNumbering?,
  numberFormat?, numbersHidden? }`
- Card: `{ id, title, kind? ("divider" | "note"), color?, description?
  ("pregame thots"), postgameDescription? ("postgame thots"),
  numberEmphasis?, highlight?, highlightStyle? }`
- Ids: both apps use 10-character nanoids, so ids can be shared as-is.
  Both have the same 8 palette names; Boardkit also takes any hex
- A card's list is known only from `cardOrder`; a card doesn't store it
- `collapsedLists` is kept outside the lists so undo never touches it:
  the same split proposed below for Linkkit's collapse

**Field mapping** (current, with every decision below applied; only
linked tree maps are shared). Depth counts arrows from the start box:
the start box is the board, depth 1 boxes are lists, depth 2 boxes are
cards, and nothing goes deeper in a linked map.

Shared (one value, both apps read and write it):

| Linkkit | Boardkit | Notes |
|---|---|---|
| `map.id` | board id (`BoardSummary.id`) | |
| start box `name` | board name (`BoardSummary.name`) | while linked, `map.name` follows it: one name |
| depth 1 box `id`, `name` | list `id`, `title` | |
| depth 2 box `id`, `name` | card `id`, `title` | |
| a depth 2 box's arrow in | which `cardOrder` entry holds the card | moving a card to another list = changing that arrow |
| sibling order (new, tree maps: each box's ordered next steps) | `listOrder` (start box's next steps), `cardOrder` (a list's next steps) | Linkkit's order is `cardOrder` with dividers and notes left out; divider rule under Decided |
| status keep / maybe / cut (new, 14c) | new `status` on lists and cards | new in Boardkit too (badge; "looks cut" is computed, never stored) |
| a deleted box or branch | `trash`, `trashedLists` | one trash for linked maps; Linkkit offers "Open trash in Boardkit" |

Linkkit-only (content Boardkit has no place for):

| Linkkit | Notes |
|---|---|
| arrow `label` ("needs"; in trees "if yes", 14b) | Boardkit has nothing for the tie between a list and a card; the label stays in Linkkit |
| `map.kind`, and every connections map | only trees can be linked |
| the link to a board (new map field, not built) | which board a map is linked to |
| a second way into a box | refused in a linked map; fine in unlinked trees |
| `map.trash`, `linkkit:trash:maps` (step 18) | unlinked maps only; a linked map's deletes go to Boardkit's trash |

Boardkit-only content (Linkkit keeps it untouched and doesn't show it):

| Boardkit | Notes |
|---|---|
| card `description` ("pregame thots"), `postgameDescription` ("postgame thots") | Linkkit never removes or changes them |
| divider and note cards (card `kind`) | stay in `cardOrder`, never move as a side effect of a Linkkit move |

View state (each app's own, never shared):

| App | Fields |
|---|---|
| Linkkit | box `x`, `y`, `color`; `page`, `direction`, `arrowLength`; `collapsed` (14d, a list on the map, outside the boxes, undoable); `hideCut` (14c); `linkkit:align`, the map list, active map, selection, undo, clipboard |
| Boardkit | list `color`, `icon`, `width`, numbering fields; card `color`, `numberEmphasis`, `highlight`, `highlightStyle`; `background`, `collapsedLists`; the board list's order, active board, undo |

Decided (for 14b): when a card moves to another list, in either app, its
arrow in gets a new start but keeps its label ("if yes"). Clearing it
would let a Boardkit move delete text the user can't see there.

How the mapping was worked out (kept for the reasoning; the table above
is what holds):

**Structure.** Proposed: start box → board, its next steps → lists,
their next steps → cards. Moving a card to another list = changing the
box's parent, and back. Where it doesn't fit:
- Depth 3 and below has no place in Boardkit (cards don't nest)
- A box at depth 1 is a list, not a card. Moving a box to another depth
  turns a list into a card or back: the record changes table (`lists` ↔
  `cards`), loses the other kind's fields, and a list moved down takes its
  cards to depth 3
- A depth-1 box with no next steps is an empty list
- Two parents: a card is in one list, so one parent must be the "home"
  one, and nothing records which today
- No "move to another branch" action exists yet: today it's two steps
  (draw a second way in, delete the first), with two parents between
- Order: Boardkit's order is content, Linkkit's is computed
- Delete: Boardkit trashes (a trashed card stays in `cards`, only leaves
  `cardOrder`; a trashed list stays whole). Linkkit deletes for good and
  takes a whole branch along. A trashed card would vanish from the tree;
  a Linkkit delete would wipe what Boardkit could restore
- Connections maps don't fit at all

**Keep / maybe / cut.**
- Status field on the card / box (Treekit's way): "move" means "change
  parent" in both apps, and status changes only by setting it. Boardkit
  shows it as a badge or just keeps it. No disagreement
- Lists in Boardkit (Keep / Maybe / Cut lists): a Boardkit move means
  "change status" between those lists and "change parent" between the
  others, and a card can't be in its branch's list and the Cut list at
  once. The apps would disagree about what a move is
- Colour: colours are per-app styling, so the status would not cross
  over, and it would clash with the owner's own colours (and Boardkit
  already has two: `color` and `highlight`)
- So the status field is the one that keeps "move" meaning the same.
  Like Treekit, only a box's own status is stored; "looks cut because
  its parent is" is computed

**Decided (2026-10-06, owner's review of this plan):**
- Opt-in, one map at a time. A tree map gets a "Link to Boardkit"
  action; connections maps can't be linked. The map will need a field
  saying it is linked (and to which board): not built yet
- A linked map has at most three levels (start → board, lists, cards).
  Linkkit won't add a next step under a card, and a move never changes
  depth: a card can go to another list or be reordered, a list can only
  be reordered. Turning a card into a list (or back) is refused with a
  message saying why. If list ↔ card is wanted later, it is its own
  action with a "you'll lose X" confirmation, never a drag side effect.
  In code this is a stricter rule set in `rules.ts` for linked trees
  (e.g. no second way in that would put a box at two depths)
- Deletes follow Boardkit: in a linked map, deleting from either app
  moves the item to the trash, never erases it. A Linkkit branch delete
  that removes a list trashes the list with its cards (Boardkit already
  keeps a trashed list whole), and they come back together. A trashed
  card disappears from the tree and returns to the same spot when
  restored
- Deletes go to the trash. Nothing is erased permanently except by
  emptying the trash or confirming the overflow warning. Built in
  Boardkit v0.0.76: its trash holds 200 cards and 30 lists per board, and
  a delete into a full trash asks first, naming the oldest item it would
  erase. (A trashed list counts once against the list limit; its cards
  don't count against the card limit.)
- Trash in Linkkit. In a linked map, a delete goes to Boardkit's trash
  for that board, and Linkkit offers "Open trash in Boardkit": one place
  to restore from. Unlinked maps get a small trash of their own, ported
  from Treekit's, so the rule above (nothing erased except by emptying
  the trash or confirming the overflow warning) holds in both apps and
  for every map. This overrides "trash" in CLAUDE.md's not-in-this-build
  list. Built for unlinked maps in step 18 (v0.0.30). Treekit's trash is narrower than this needs: it
  holds only whole deleted trees (a deleted branch or node is gone for
  good, undo aside) and forgets the oldest past 10 without asking. So
  the port must take deleted boxes and branches (with their arrows) and
  deleted maps, and warn before overflow like Boardkit's
- The board's name is the start box's name (the question the tree
  asks); while linked, the map's own name follows it, so there is one
  name that can't drift
- A linked map refuses a second way into a box (no "home" list to
  pick). Two parents still work in unlinked trees
- "Link to Boardkit" on a tree that breaks the rules (too deep, two ways
  in) is refused, naming each box that's in the way ("'Rent' has two
  ways in", "'Walk to work' is 4 levels deep"). No automatic fix: fixing
  means deleting arrows or flattening branches, which is the owner's
  call. Once fixed, the link works

- Tree maps store sibling order: each box keeps an ordered list of its
  next steps (as Treekit does), and Tidy up follows it (a change to
  `layout.ts` only). Boardkit's card order and column order map onto it
  one to one, so reordering means the same in both apps. Connections maps
  keep their computed order. Built in 14a2 (v0.0.25): stored as
  `map.order` (box ids per parent, like `cardOrder`); a box with two
  parents is listed under both
- Boardkit shows keep / maybe / cut as a small badge on a card, and
  anything under a cut box looks cut (computed, never stored; a cut list
  fades all its cards). Both apps use one definition of "looks cut". This
  is a new feature in Boardkit, not only a display of existing data
- Collapsed, "hide cut" and box colour stay per-app. Linkkit keeps
  collapse outside the shared node (as Boardkit keeps collapsed lists
  outside its lists), and it stays undoable in Linkkit, because there it
  changes the layout (Tidy up places only what shows)

- Pregame / postgame text, divider and note cards are kept and hidden in
  Linkkit: it never removes or changes what it doesn't show. Linkkit's
  order is Boardkit's card order with dividers and notes left out.
  Dividers never move as a side effect. A card moved in Linkkit goes
  right after the visible card above its drop position, joining that
  card's section, even when a hidden divider sits between the two cards
  it was dropped between; dropped at the very top, it goes right before
  the first visible card; in a list with no other cards, at the end.
  Deleting a card never moves a divider either
- Undo across apps: each app undoes only its own changes. An undo whose
  item was changed in the other app since is refused, with a message
  naming the conflict ("Can't undo further: 'Rent' was changed in
  Boardkit"). The stack stops there: the refused step and every older
  step are dropped, so undo never produces a state that never existed
  (skipping would). Redo keeps the steps undone before the refusal. Some
  history is lost, in a rare case

All bridge-mapping questions are decided.

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
- Step 19 (owner asked for Boardkit's 7-day backup reminder dot, also
  where automatic backup can't run). Owner decision: the dot shows at
  once when there has never been a backup (no 7-day grace from the first
  visit: the risk starts with the first real map), except while only the
  untouched first-visit example exists. Like Boardkit: an export resets
  the clock (so "Backing up to … · last" can show an export's time), and
  restoring from a file doesn't count as a backup.
- Step 14a2 (sibling order; design already decided, built before 14b at
  Claude's suggestion, owner agreed). Choices made without asking, easy
  to change: the order is stored per parent as box ids (Boardkit's
  `cardOrder` shape), not on the box; it only settles ties in Tidy up, so
  a box with two parents still sits under the middle of both; no way to
  reorder by hand yet (none was asked for; the bridge needs only that
  Boardkit's reorders show here).
- Step 14b (arrow labels in trees, design OK'd by the owner). Choices
  made without asking, easy to change: the field's placeholder reads "if
  yes"; the hover chip no longer takes room on the arrow (before, a
  deletable arrow's × counted as a 16px label in Tidy up; now only real
  labels do, so every tree is spaced the same); a moved card keeps its
  label, but there is no "move" in Linkkit yet, and the two-step
  workaround (a second way in, then delete the first) loses the first
  arrow's label.
- Step 14c (keep / maybe / cut, design OK'd by the owner, including no
  status on the start box). Stored: `status` on each box (shared with
  Boardkit later) and `hideCut` on the map (Linkkit's own); older saves
  read as none. Choices made without asking, easy to change: the status
  is picked from a row of round buttons like the colour row (Treekit
  lists them as menu lines); the toolbar's status button is a tag icon;
  the selection bar has no status button (the right-click menu covers
  groups). To fit "Hide cut" on a 375px phone, "Align" now shows an icon
  there and the header's gaps are 4px.
- Step 14d (collapse, design OK'd by the owner). Stored as
  `map.collapsed` (box ids), outside the boxes as decided. Choices made
  without asking, easy to change: Space is the key (Treekit's); the "+N"
  badge sits on the bottom edge top-down and on the right edge, under the
  connect dot, left-right; no "collapse all".
