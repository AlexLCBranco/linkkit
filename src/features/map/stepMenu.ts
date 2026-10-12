import { ArrowDown, CircleHelp, CircleStop, Columns3, Split, type LucideIcon } from "lucide-react";

import type { StepType } from "../../domain/types";

/** One entry of a step's "Add next" menu (owner's spec, Steps). */
export interface AddNextItem {
  readonly type: StepType;
  readonly label: string;
  /** What it adds, in a few words (the item's tooltip). */
  readonly hint: string;
  readonly Icon: LucideIcon;
}

/**
 * The "Add next" menu, in the spec's order. Step comes first: it is the
 * default (Enter picks it as the menu opens; Tab adds one without the
 * menu). Shared by the box's "+" and its right-click menu.
 */
export const ADD_NEXT_ITEMS: readonly AddNextItem[] = [
  { type: "step", label: "Step", hint: "One next step", Icon: ArrowDown },
  { type: "yesno", label: "Yes / No", hint: "This step asks a question: two branches, “Yes” and “No”", Icon: CircleHelp },
  { type: "choice", label: "Choice", hint: "Pick one of several branches (Option A, B, C …)", Icon: Split },
  { type: "parallel", label: "Parallel", hint: "Branches that all happen, then join", Icon: Columns3 },
  { type: "end", label: "End", hint: "The process ends here: nothing comes after it", Icon: CircleStop },
];
