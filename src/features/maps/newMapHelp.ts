/**
 * What each "+ New ▸" item is called: the name says what you get, and
 * whether the map arranges itself or you place the boxes (owner,
 * 2026-11-13). Display text only: the kinds inside are unchanged ("tree",
 * "steps", "connections", "bracket").
 */
export const NEW_MAP_NAMES = {
  tree: "Decision tree (arranges itself)",
  steps: "Flowchart (Yes/No and choices, arranges itself)",
  map: "Free map (you place the boxes)",
  bracket: "Bracket",
} as const;

/** What each "+ New ▸" item makes, in a sentence or two (its "?"). */
export const NEW_MAP_HELP = {
  tree: "A decision tree: one start, and each choice leads on to the next. It arranges itself as it grows. Click a box to see the way to it.",
  steps: "A flowchart: a process in order, with Yes/No questions and choices that branch and join again. It arranges itself.",
  map: "A free map: boxes and arrows for what depends on what, placed wherever you like. Click a box to see what it needs and what breaks without it.",
  bracket: "A knockout tournament for 4 to 256 players. Pick each match's winner until one champion is left.",
  template: "Start from a ready-made example, or from a map you saved as a template.",
  boardkit: "Turn a Boardkit board into a tree: lists and cards become boxes, and edits show in both apps.",
} as const;
