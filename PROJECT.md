# Linkkit — project summary

_Last updated: 2026-10-05, v0.0.1_

## What it is

A browser widget for "what does this depend on?" maps: boxes connected by
arrows, where A → B means "A needs B". Click a box and everything it needs
lights up teal, everything that breaks without it lights up orange. For
concept maps, dependency maps and relationship maps. Mouse-first, for
normal users. Sibling of Boardkit, Treekit and Vennkit, whose stack and
look it mirrors; built and used on its own. Repo:
github.com/AlexLCBranco/linkkit. Behaviour reference:
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

- Project scaffold only: dark header, status line and an empty dotted page

## What's next

The first build, in order:
1. ~~Scaffold~~ (done)
2. Domain + tests: data model, link rules, reach up/down and counts, a
   loop-safe layered layout, page sizing, versioned save and repair, the
   Microsoft 365 sign-in example
3. The page: boxes and arrows, the example map tidied on first load
4. Click a box: teal needs / orange breaks highlight and the status bar
5. Editing with the mouse: add, rename, connect, move, delete, arrow labels
6. Page: "More room" tab, corner grip, animated Tidy up
7. Undo/redo, then box colours (right-click menu, swatch row, keys 1–8 / 0)
8. Several saved maps: switcher, rename, new, duplicate, delete, "Add
   example map"
9. Polish and a full check against the "done when" list

## Open problems

- Treekit's teal and orange box colours look like the needs / breaks
  highlights. Decided: keep all 8; a selected box's highlight hides box
  colours, and the highlight looks different (solid fill, coloured arrows,
  the rest faded). Revisit if it still confuses in use.
