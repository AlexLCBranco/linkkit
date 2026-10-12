# Linkkit: "Steps" preset (flowchart mode) — the owner's spec, 2026-10-12

Kept as the owner wrote it; decisions made while building are in
PROJECT.md ("Steps (flowchart mode)" under What's next).

## Goal
A preset for ordered step lists that can branch. Same node-and-link engine,
new rule set: position = sequence, top to bottom. Priority as always:
efficiency and fluidity. Mouse-first; typing only for content.

## Step types (the menu)
Select a step → "Add next" menu shows:
1. Step – one next step (the default; Enter does this)
2. Yes / No – two branches, arrows pre-labeled "Yes" and "No" (labels editable)
3. Choice – 3 branches by default, arrows labeled "Option A/B/C",
   with + to add more
4. Parallel – branches that ALL happen, then must join.
   Visually different from Choice (e.g. a bar instead of a split),
   so "pick one" and "do all" never look the same
5. End – terminal step, no "Add next"

Plus one action, not a type:
- Join – drag from the end of a branch onto an existing later step.
  That step now has two parents. Parallel branches offer
  "Join here" automatically.

## Numbering (automatic, never typed)
- Main path: 1, 2, 3
- Branches under step 3: 3a, 3b (3a.1, 3a.2 for steps inside a branch)
- First step after a join continues the main count (4)
- Renumbers instantly on add/move/delete
- Toggle to hide numbers

## Layout
- Top to bottom, branches side by side, joins centered under their branches
- No manual positioning needed; dragging a step reorders it in the sequence
- Empty steps allowed (box with placeholder), same as other Linkkit boxes

## Presets to start from
- Blank: one step
- Simple decision: 1 → Yes/No → End on each side
- Process with check: 1 → 2 → Yes/No → (No joins back... see v2)

## Out of scope for v1
- Loops ("repeat until", arrow back to an earlier step)

## Tests (automated, Vitest in domain/)
- Numbering for: linear, one split, nested split, split + join, parallel + join
- Delete a branch step → numbering recalculates correctly
- Join can only target a later step, never an earlier one (no cycles in v1)
- Deleting a join target doesn't orphan or corrupt either branch
- Save/load round-trip keeps types, labels and joins
