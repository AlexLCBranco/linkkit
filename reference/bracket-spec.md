Bracket mode for Linkkit (owner's spec, 2026-10-16). Same process as Steps: first save this spec as `reference/bracket-spec.md` and add a "### Bracket mode" plan to PROJECT.md "What's next" (steps b1–b2 below), then do b1 only in this chat. Stop and ask me before anything that contradicts the spec.

## What it is
A fourth map kind, `bracket`: a single-elimination tournament bracket. Linkkit only — no Boardkit linking, no Mermaid import/export, no keep / maybe / cut, no folding, no outline paste.

## The three things it does
1. **Layout**: round 1 is the left column, the final is the right column. Each match sits vertically centred between the two matches that feed it. Columns get automatic headings from the size: "Round 1", "Round 2"…, with the last three named "Quarterfinals", "Semifinals", "Final" (only the ones that exist). The final's winner shows as a "Champion" box to the right of the final.
2. **Match boxes**: each match is one box with two player rows. No scores. The winner's row is bold. An empty slot shows a faint "—".
3. **Winner moves on**: clicking a player row marks them the winner of that match and fills their name into the right slot of the next match. Clicking the bold winner again clears it. Clicking the other player switches the winner.

## Rules (decide nothing else without asking)
- **Players are stored once, slots point to them.** Renaming a player in round 1 renames them everywhere they've advanced. Never copy the name text into later slots.
- **Only round-1 slots are typed.** Later slots are filled only by winners. A row can't be marked winner while either slot of that match is empty.
- **Changing or clearing a result clears everything downstream that depended on it**: if the old winner had advanced and won later matches, those later results are cleared too. Do it in one undo step and show a short message ("Cleared 2 later results · Undo").
- **Structure is fixed.** No adding/deleting individual boxes or drawing/dragging arrows in a bracket map. Arrows are drawn by the layout and can't be selected.
- **Sizes**: 4, 8, 16, 32, 64, 128 or 256 players, picked when creating (128 and 256 added 2026-10-16). No byes in v1 (that's a v2 idea; put it under v2 in the plan). Changing size later isn't in v1 either.
- **Creating**: "+ New bracket" in the map menu → pick a size → the map opens with the first round-1 slot ready for typing.
- **Keyboard flow** (efficiency is the priority): typing in a round-1 slot, Enter or Tab goes to the next slot down, Shift+Tab goes back. Pasting several lines into a round-1 slot fills that slot and the ones below it, one name per line (extra lines beyond the last slot are ignored and the message says how many). Arrow keys move between matches; Space or Enter on a selected player row marks the winner.
- **Undo/redo** covers everything: names, winners, cascades, paste.
- **Save/load and repair**: saved and read back like the other kinds. A save with a winner that isn't one of the match's two players, a slot pointing to a missing player, or a later slot that disagrees with the result before it is repaired by clearing the bad result and everything after it.
- Map trash, rename, duplicate, backups, zoom and image export work as for other kinds. Shortcuts dialog gets a "Bracket" section.

## Steps (one chat each)
- **b1. The model**: the `bracket` kind and its rules in `rules.ts`, `domain/bracket.ts` (create by size, set name, set winner, clear winner with cascade, paste names, round names), save/load and repair. All with tests. No UI, no version bump.
- **b2. Layout and the page**: `domain/bracketLayout.ts` with tests (no overlaps for every size, each match centred between its feeders, final on the right); the match box component, winner clicking, champion box, "+ New bracket", keyboard flow, shortcuts dialog. Playwright e2e covering: create an 8-player bracket, paste 8 names, play it to a champion, change a round-1 result and check the cascade, undo it, reload and check it's all still there. Version bump.

## Testing
I don't test by hand if it can be automated. Every rule above needs an automated test (unit or e2e). At the end of each step, tell me only what's left that genuinely needs my eyes, if anything.
