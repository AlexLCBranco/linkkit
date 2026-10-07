import { Check, CircleQuestionMark, Scissors, type LucideIcon } from "lucide-react";

import type { NodeStatus } from "../../domain/types";

/** How each status is shown (Treekit's): the box's corner badge and the
    status row in the toolbar and menus. */
export const STATUS_META: Readonly<Record<NodeStatus, { readonly label: string; readonly icon: LucideIcon }>> = {
  keep: { label: "Keep", icon: Check },
  maybe: { label: "Maybe", icon: CircleQuestionMark },
  cut: { label: "Cut", icon: Scissors },
};
