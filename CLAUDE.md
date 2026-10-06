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

Not in this build: tree mode, flowchart mode, collapsing groups, import,
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
CLAUDE.md, then do step (next)". "(next)" means the first step in
PROJECT.md's numbered "What's next" list that isn't struck through. Each
chat:

1. Read `PROJECT.md` (and `git log --oneline | head`) to get oriented, and
   name the step you're doing.
2. Say briefly what you'll build and why, then build it. New pure logic
   goes in `domain/` with tests.
3. `npm run build`, `npm test` and `npm run lint` must pass.
4. Check it in the browser pane (dev server: `linkkit` in
   `.claude/launch.json`, port 5181; the app is at /linkkit/). Clear any `linkkit:*` localStorage
   keys you created while testing.
5. Update `PROJECT.md`: strike the step through (`~~...~~ (done)`), add
   what now works, and record any decision the owner made in the step
   (the next chat only knows what's written down). Bump the patch
   version, commit on `main`, push.
6. A step too big for one chat: split it in PROJECT.md (e.g. 5a, 5b) and
   stop at a working, pushed point; the next chat picks up the rest.

## Git and deploy

- Repo: github.com/AlexLCBranco/linkkit (public). Work on `main`, one
  commit per coherent change, only after the build passes.
- Vercel project `linkkit` (team `alexlcbrancos-projects`): every push to
  `main` deploys to https://linkkit-lake.vercel.app (`linkkit.vercel.app`
  belongs to someone else). The Vercel CLI is logged in: `npx -y
  vercel@latest ls linkkit` lists deployments.

## Testing in the browser pane

When the Claude window is behind other windows, the pane stops drawing:
`requestAnimationFrame`, `ResizeObserver` and CSS animations stall, which
looks exactly like an app bug (edges missing, glides frozen mid-way). If
things look frozen, retry the screenshot or check the DOM with JavaScript.
After a broken hot reload, restart the dev server.

## Commands

```bash
npm run dev      # dev server
npm run build    # type-check + production build
npm test         # vitest
npm run lint     # oxlint
```
