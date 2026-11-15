# Built — linkkit

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
Entries dated before 2026-11-16 were backfilled from the git commit messages (data, docs, test-only, merge and
spec commits left out). New entries name their backlog ID (see CLAUDE.md, "Feature backlog and built list").

## 2026-11-14
- Whiteboard copies: copy, read, write and delete a whole map for the gauntlet (v0.0.119)
- On the gauntlet whiteboard a map's box shows its hover look and notes preview (v0.0.118)

## 2026-11-13
- A list pasted onto a map edited on the gauntlet whiteboard becomes boxes too, clear of the page's corner (v0.0.117)
- E: a Choice starts with two unlabelled branches; its + adds one more (v0.0.116)
- v0.0.115: making a map fast (items A-D, F-K of the speed round); PROJECT.md; older e2e tests follow the renamed + New entries
- K: whiteboard exports to start typing at once: a new map's first box, and a box at a point
- J: a list pasted onto the map becomes boxes, one per line
- I: a band about 10 px wide round a box's border starts an arrow, from any side
- H: the + New entries say what you get, the decision tree first
- G: Tab while typing a box's name acts as Enter instead of moving the focus away
- F: a new flowchart starts with its step numbers off
- D: in a flowchart Enter keeps the name and opens the next unnamed branch, then stops
- C: Enter keeps the chain going: another new box from the same parent, beside the last
- B: a dot dragged onto empty paper adds a linked box there in a plain map, name open
- A: a plain map's + adds a linked box beside the box, its name open (one undo step)

## 2026-11-05
- Ctrl+C with no box picked copies the map for the gauntlet whiteboard (v0.0.114)

## 2026-10-23
- v0.0.113: links on boxes: right-click or Ctrl+K, opened from a link badge; addresses in names show as links; a card's or list's box shares the item's link with Boardkit

## 2026-10-22
- v0.0.112: whiteboard fixes from the owner's hand test: only React Flow's layer is cut to the map's area, so an arrow dragged out of a dot and a hint show anywhere on the page; a…
- Whiteboard: a box's toolbar and menus may pop out past the map's edge (overflow-clip-margin), now that no band leaves room above a top box
- Whiteboard: link a new map to a board, unlink one, put an unlinked record back (for the board widget's Add map view and Unlink map with undo)
- v0.0.111: no dot grid behind the map; on the gauntlet whiteboard the whole page is an edited map's: double-click anywhere adds a box (nearest free spot), drag anywhere, past the…

## 2026-10-21
- CI: lint, unit tests and build on every push
- Whiteboard: a map clips instead of hiding its overflow, so a focused field never scrolls it (v0.0.110)
- A click away saves what was typed, as Enter does; a new box left empty and clicked away is not kept (v0.0.109)
- Whiteboard map: steady size kept in the hook's own ref (lint)
- Maps as widgets on the gauntlet whiteboard: src/app/whiteboard/ entry, MapCanvas whiteboard mode, read-only copies through MapStoreContext (v0.0.108)

## 2026-10-19
- A renamed board's name shows everywhere; opening from the menu saves nothing (v0.0.107)
- An explicit pill zoom sticks, 100% included (v0.0.106)
- Fit to view on open: a saved map shows every box, never stored (v0.0.105)
- Tips fold away under a toggle; header test covers an enabled "+" (v0.0.104)
- Header wraps in a narrow window: every button stays clickable (v0.0.103)
- Opening a map is read-only: nothing moves or saves on open (v0.0.102)

## 2026-10-18
- Embed mode for the gauntlet canvas: ?embed=1&id=<map id>
- Fix the map menu e2e: find "+ New ▸ Process" by its full name
- Hold a damaged map back from automatic backups, with an on-screen warning

## 2026-10-17
- Selection bar: "Copy image" copies just the picked boxes (or matches) as a 4x PNG
- Add "Copy as image" for a picked group: just those boxes and their arrows, as a 4x PNG
- Add "Copy image": copy the whole map to the clipboard as a 4x PNG
- Bracket: hovering a player's row lights only that player's path
- Bracket: the two rounds before the quarterfinals are "Round of 32" and "Round of 16"
- Bracket: pinned rounds sit in a sticky layer, so they never move while scrolling
- Bracket: pinned rounds stay fixed in the middle of the screen
- Bracket: "Keep on screen" pins the later rounds so they follow the scroll
- Bracket: a "Rounds" menu hides the first rounds so the rest reads cleaner
- Rename the Steps map kind to "Process" on screen
- Map menu: a "?" on each + New item describes that kind of map
- Map menu: recent 8 + All maps + search, then New / This map / Backup submenus

## 2026-10-16
- Bracket: always flush left, one dot in, so zooming out adds no space left of round 1
- Bracket: matches picked with the marquee show their rings and light all their past paths
- Marquee: picks every box it touches, not only boxes wholly inside it
- Bracket: always flush to the top, so zooming out adds no space over the headings
- Bracket: a saved bracket is laid out afresh when it opens
- Bracket: round headings sit one paper dot below the top, not three
- Bracket: hovering a match lights the path that led to it
- Bracket: a selected match lights only the path that led to it, nothing ahead
- Bracket: a selected match no longer fades the other matches
- Bracket: a selected match lights only its players' path, not every earlier match
- Bracket: a shorter window no longer pulls the bottom match onto the one above
- Bracket keys: Enter and down go to the next row, left/right land on a match's top row
- Bracket: 128- and 256-player sizes
- CLAUDE.md: each step chat says which step of how many it is
- PROJECT.md: Boardkit's automatic-backup tests are done
- Bracket b2: brackets on the page
- PROJECT.md: what Bracket b1 built
- Bracket b1: the bracket model, rules, save and repair

## 2026-10-12
- Bridge 4b: open an existing Boardkit board as a new linked map
- Design: open an existing Boardkit board as a linked map (waiting for OK)
- Steps s4: drag a step before or after another to reorder it
- Steps s3b: Join here on a Parallel's branches; fork and join bars
- Steps s3a: Steps maps on the page
- Steps s2: the Steps layout; lines into a join keep their column
- Steps s1: the model for step lists that branch and join

## 2026-10-11
- Move the map's own trash into Boardkit's trash on linking
- Automate the backup steps of the bridge checklist (1, 2, 7, 8.5)
- Patch vulnerable build-time deps; mark shadcn as dev-only
- PROJECT.md: bridge e2e re-run, all 22 checks pass
- Redraw a linked tree when Boardkit reorders or moves a card (e2e 4.3, 4.5)

## 2026-10-09
- Record a trashed card's neighbours for Boardkit's restore
- Add AGENTS.md pointing agents at CLAUDE.md
- Add testing policy to CLAUDE.md
- Bridge e2e: Playwright runs BRIDGE-CHECKLIST 3-6 and 8 on the shared site (fresh profile, own ZZ map/board, other records checked untouched)

## 2026-10-08
- Bridge audit: side-by-side checklist for Linkkit + Boardkit, Bridge mapping note refreshed, follow-ups queued
- Shortcuts dialog: Tree words (drawn example tree, start box / parent / child / sibling / branch, a worked Tab example); the app uses those five words everywhere
- Keyboard shortcuts dialog: header button and ?, grouped, Ctrl / ⌘, built from the same table as the key handlers (tested)
- Trees: box names over several lines (Shift+Enter, kept through Mermaid), the start can have keep / maybe / cut
- Trees: Treekit's tidy-tree layout (parents centred over next steps, rows 64 apart), re-tidy after a rename, boxes let go on paper glide home
- Trees: Treekit's keyboard flow (Tab, arrows, Enter/F2), new boxes focus at once and make room, selected box scrolls into view, new trees in Elbow + Treekit text
- Label style switch: a box moved before the re-tidy lands stays put
- Export: draw boxes where they are on screen, never re-tidied
- Dev servers: one config on 5181, reuse if running, stop what you started
- Label styles: Linkkit's (default) or Treekit's text, per map
- Arrow styles: straight (default) or Treekit's elbow lines, per map
- Zoom: Treekit's pill (50-200%), kept per map, a view setting only
- PROJECT.md: the two-parents rule, stated in one place
- Notes in linked maps: a card's note is its pregame thots; clashes kept for the user to pick
- Saves keep fields this build doesn't know, so an older tab can't drop them
- Export PNG, SVG and Mermaid for any map; import Mermaid as new maps
- Fork a box and everything after it into a new map
- Notes on boxes: side panel, icon and hover preview, saved with the box

## 2026-10-07
- Naming templates: a name field when saving, rename in the gallery
- Examples are templates: gallery cards instead of map-menu items
- Map names you can tell apart: numbered untitled maps, first box names the map
- Old addresses show a full-screen "Linkkit moved" notice with an export button
- Saved templates go into Export all maps, automatic backups and restore
- A map with tree rules takes its start box's name until renamed by hand
- Outline paste without tree rules: place only the new boxes
- PROJECT.md: Treekit comparison for maps with tree rules (U7, report only)
- Templates: a gallery to start from, and save a map as a template
- Paste an outline into a box: one box per line, nested by indent
- Empty boxes stay, with a faint placeholder
- Call everything a map: a tree is a map with tree rules on
- Moving a box to a new parent: clear target, clear refusal, clear result
- Arrows: pick, delete and reconnect them; say why when a tree refuses
- Fix undo after an outside change leaving an arrow to nothing; add stress tests
- PROJECT.md: step 27 done in Boardkit
- Undo keeps working after another tab's or Boardkit's change (step 26)
- PROJECT.md: steps 24 and 25 done in Boardkit
- "Link to Boardkit": a tree becomes a shared board (step 23)
- A linked map's deletes go only to Boardkit's trash (step 22)
- Drag a tree box onto another box or between siblings to move it (step 21)
- Linked trees offer no next step under a card (step 20)
- PROJECT.md: linking to Boardkit planned as steps 20-27 (queue item 5)
- Linked trees: stored with Boardkit's board, merged both ways (shared store step 3b3)
- Two Linkkit tabs stop overwriting each other (shared store step 3b2)
- Convert between linked trees and Boardkit boards (shared store step 3b1)
- PROJECT.md: shared store step 3a2 done in Boardkit v0.0.83
- PROJECT.md: last-updated line for shared store step 3a1
- PROJECT.md: shared store step 3a1 done in Boardkit
- PROJECT.md: shared store design OK'd by the owner
- PROJECT.md: shared store (bridge step 3) design awaiting OK
- A trash for deleted boxes and maps (step 18)
- PROJECT.md: step 18 trash design awaiting OK
- Repair a damaged tree as it opens (step 14e)
- PROJECT.md: the owner's queue, and the detailed 14e repair design awaiting OK
- Collapse branches in trees (step 14d)
- Keep / maybe / cut in trees, and Hide cut (step 14c)

## 2026-10-06
- Arrow labels in trees (step 14b): a hover chip with "+ label"
- Trees keep their sibling order, and Tidy up follows it (step 14a2)
- Backup reminder dot after 7 days without a backup (step 19), copied from Boardkit's
- Automatic backups to a folder (step 17), copied from Boardkit's
- PROJECT.md: a moved card's arrow keeps its label (decided for 14b)
- PROJECT.md: current field mapping (shared / Linkkit-only / Boardkit-only / view state); backups (17) moved ahead of 14b
- PROJECT.md: record the divider and undo rules; plan Linkkit automatic backups as step 17, trash as 18
- PROJECT.md: step 14d keeps collapse outside the box, matching the bridge decision
- PROJECT.md: record sibling order, cut badge, per-app view state; plan Linkkit trash as step 17
- PROJECT.md: bridge decisions on trash, board name, two parents, linking rule-breaking trees
- Ask before leaving the page while saves are failing
- Keep unsaved maps in memory, and list a map only once it is stored
- Name maps whose content was lost instead of dropping them silently
- Make "Try again" retry every failed save, not just the open map
- Show a banner while saving fails, and stop claiming a failed copy was kept
- PROJECT.md: trash rule decided (only emptying or a confirmed overflow erases)
- PROJECT.md: bridge decisions (opt-in, three levels, trash) and what's still open
- PROJECT.md: bridge mapping checked against Boardkit's types
- PROJECT.md: bridge mapping plan (shared vs Linkkit-only fields)
- Serve Linkkit under /linkkit and move all maps with export / restore

## 2026-10-05
- Select several boxes: marquee, group move, copy / paste / duplicate / delete
- Tree mode, part 1: tree rules, new / example tree, next steps, highlight
- PROJECT.md: describe the engine's files, kind and layout
- A scrollbar you can see when the map is taller than the screen
- Any arrow length: mouse wheel over "Arrows", and a slider
- Arrow length presets (Short / Medium / Long) for Tidy up
- Top-down / Left-right switch and Align panel, from Treekit
- Page in Treekit's darker tone and finer dots
- PROJECT.md: the "handle bar" was Boardkit's scrollbar
- Page is one screen: drop "More room" tab and corner grip
- Polish: no sideways scroll on new pages, keyboard focus, phone header
- Several saved maps: switcher, rename, new, duplicate, delete, add example
- Undo/redo and box colours
- Page: "More room" tab, corner grip, animated Tidy up
- Editing with the mouse: add, rename, move, connect, delete, arrow labels
- Click a box: needs / breaks highlight and the status line
- The page: example map's boxes and arrows, tidied on first load
- CLAUDE.md: how a new chat finds and finishes step (next)
- Domain: map model, link rules, reach, loop-safe layout, page, save/repair
- Docs: live URL and the decisions made before step 2
- Scaffold Linkkit: Vite, React, TypeScript, Tailwind, shadcn, Treekit's tokens
