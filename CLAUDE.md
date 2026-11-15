# Linkkit — context for Claude

A "connections" widget: boxes and arrows that answer "what does this depend
on?". Sibling of Treekit (`../treekit`) and Boardkit (`../Projects/boardkit`):
match Treekit's stack, code structure and feel. The owner is learning
frontend: explain decisions briefly as you go, and say why when several
approaches exist.

`reference/prototype.html` is the reference for BEHAVIOUR (what each click,
drag and double-click does). For look and code structure, follow Treekit;
where they differ in look, prefer Treekit's and tell the owner.

## Scope

Flowchart mode is now in scope as the "Steps" kind (owner's spec,
`reference/steps-spec.md`, 2026-10-12; plan in PROJECT.md).

Not in this build: tree mode, collapsing groups, import,
export (beyond "Export all maps" / "Restore all maps from a file", for
moving address), notes, trash, shared board, accounts,
backend, numbers/charts.

Long-term this becomes one nodes-and-links engine where a tree is just a
rule. Don't build that, but don't block it:
- The model is generic: map { id, name, kind, page, nodes, links }; `kind`
  is "connections" for now.
- "May this link be created?" lives in one rules function per kind
  (`domain/rules.ts`), never scattered in UI code.
- Graph logic (reach, counts, layout, cycles) is pure functions in
  `domain/`, with tests. Layout is a swappable function.

## Rules

- **Mouse first.** For normal users, not coders. Every action (add, move,
  connect, delete, recolour) must work with the mouse alone; keys are
  extras. The keyboard is for typing names.
- **Layering.** `app -> features -> components -> store -> domain`.
  `domain/` imports no React and no store.
- **Normalised state.** Nodes and links in flat `Record<id, …>` maps.
- **The store is the source of truth; React Flow only renders.** Camera
  locked: no pan, no zoom; the page scrolls natively.
- **No layout library** without asking the owner first.
- **Subscribe narrowly.** A box component reads only its own node.
- **No hardcoded visual constants.** Everything from `src/styles/tokens.css`.
  Page UI is CSS Modules; Tailwind + shadcn/ui only for menus/dialogs.
- **Dark theme by default.**
- **PROJECT.md** is the owner's plain-language snapshot: update it (and its
  "Last updated" line) whenever what's built, what's next or the stack
  changes. Same five sections every time.
- Bump `package.json`'s patch version with every user-visible change (shown
  in the version badge).

## Workflow

The owner starts a fresh chat for each step with "Read PROJECT.md and
CLAUDE.md, then do step (next)". "(next)" means the top item under Ready in
`FEATURE_BACKLOG.md` (the numbered plans under PROJECT.md's "What's next" are
history). Each chat:

1. Read `PROJECT.md` (and `git log --oneline | head`) to get oriented, and
   name the step you're doing with its place in its plan: "Doing step 2
   of 3 of Bracket mode: b2, layout and the page".
2. Say briefly what you'll build and why, then build it. New pure logic
   goes in `domain/` with tests.
3. `npm run build`, `npm test` and `npm run lint` must pass.
4. Check it in the browser pane (dev server: `linkkit` in
   `.claude/launch.json`, port 5181; the app is at /linkkit/). Clear any `linkkit:*` localStorage
   keys you created while testing.
5. Move the item from `FEATURE_BACKLOG.md` to `BUILT.md` (see "Feature
   backlog, built list and ideas"). Update `PROJECT.md`: add what now works, and record any decision the owner made in the step
   (the next chat only knows what's written down). Bump the patch
   version, commit on `main`, push.
6. A step too big for one chat: split it in `FEATURE_BACKLOG.md` (e.g. BK-5a, BK-5b) and
   stop at a working, pushed point; the next chat picks up the rest.
7. End the chat's report with the plan's progress, in bold on its own
   line: "**Step 2 of 3 done (Bracket mode). Next chat: step 3, b3 ...**",
   or "**Step 3 of 3 done: Bracket mode is finished.**" Count the plan's
   numbered steps (a split step's parts count as one each).

## Git and deploy

- Repo: github.com/AlexLCBranco/linkkit (public). Work on `main`, one
  commit per coherent change, only after the build passes.
- Vercel project `linkkit` (team `alexlcbrancos-projects`): every push to
  `main` deploys to https://linkkit-lake.vercel.app (`linkkit.vercel.app`
  belongs to someone else). The Vercel CLI is logged in: `npx -y
  vercel@latest ls linkkit` lists deployments.

## Dev servers

- One dev server only: `linkkit` in `.claude/launch.json`, port 5181,
  `--strictPort`. No second configs or fallback ports.
- Reuse it if it's already running (check `preview_list`, or whether 5181
  is listening) instead of starting another.
- Stop what you started (`preview_stop`) when the chat's work is done. Don't
  stop a server another chat started without asking the owner.

## Testing in the browser pane

When the Claude window is behind other windows, the pane stops drawing:
`requestAnimationFrame`, `ResizeObserver` and CSS animations stall, which
looks exactly like an app bug (edges missing, glides frozen mid-way). If
things look frozen, retry the screenshot or check the DOM with JavaScript.
After a broken hot reload, restart the dev server.

## Testing policy

Automate every check that can be automated: unit, integration, and end-to-end
with Playwright against the live site, using throwaway data the test creates
and deletes itself. Never hand the owner a manual checklist for something a
script can do. Manual steps only for what truly can't be automated (browser
permission prompts like folder pickers, and judging feel/usability). Keep
those to the minimum, say why each one can't be automated, and give one short
step at a time.

Tests and scripts run headless and close every browser window and process
they open, even on failure. After any run, no test window may be left open
on the owner's PC.

## Commands

```bash
npm run dev      # dev server
npm run build    # type-check + production build
npm test         # vitest
npm run lint     # oxlint
```

## Feature backlog, built list and ideas (owner's standing workflow, updated 2026-11-15)

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.
- `IDEAS.md`: ideas the owner mentioned that are not planned (maybe later, maybe never). Never built from directly.

The owner's messages. Always read the lists from `main` on GitHub, never from your local checkout or branch
(Claude Code sessions run on a branch made at session start, so `git pull` there does NOT bring in backlog
items added later): run `git fetch origin main`, then read with `git show origin/main:FEATURE_BACKLOG.md`
(same for `BUILT.md` and `IDEAS.md`). Before building, merge `origin/main` into your branch.
- "build what's planned" / "build the backlog": build only the items under Ready in `FEATURE_BACKLOG.md` on
  `origin/main`. If there are none, say "Backlog is empty" and stop. Never build from `IDEAS.md`, `PLAN.md` or
  any other doc, and never fill gaps in a spec with your own defaults: ask.
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `LK-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "ideas" / "what ideas": read `IDEAS.md` only and list it as `I-n — idea`.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build LK-n": that item only.
- "promote I-n": cut it from `IDEAS.md` and add it at the bottom of Ready in `FEATURE_BACKLOG.md` with the next free
  LK ID and a `From I-n` line. Build it only if the owner also asks for that.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit/PR as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under that day's `## <YYYY-MM-DD>` heading (one heading per day, newest first) as
`- LK-n — title (v<version>)`, then at most one plain sentence on what the owner sees. An item is never in both files. IDs are
never reused. Work shipped without a backlog item (a direct request, a fix) gets the same line without the ID:
`- title (v<version>)`. Housekeeping the owner can't see (handoff notes, pins, test-only or CI fixes, docs) goes under a
`### Internal` subheading at the bottom of that day, not in the main list. The same format is used in every one of
the owner's repos, so `gauntlet` can merge them into one `ALL_BUILT.md`.
Follow this file's other rules (branches, tests, version bump) as usual.

When the owner mentions something that isn't to be built now (an aside, "later", "someday", "maybe"), add it at the
bottom of `IDEAS.md` as `- I-n — the idea in plain words (YYYY-MM-DD)` and say so in the report. Never put an idea
in the backlog yourself.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones and add `Blocked:` notes. End with a short report: built / blocked / ideas added / what the owner must test by
hand (only what couldn't be automated). A pasted prompt overrides this section.

Guard: `scripts/check-lists.mjs` runs with the checks (before `npm test`) and fails if an ID is both planned and built, an
ID repeats, or package.json's version has no `BUILT.md` entry. Fix the lists, never the check.
