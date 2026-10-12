import { Plus } from "lucide-react";
import { useRef } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { addNextOffer } from "../../domain/steps";
import type { NodeId } from "../../domain/types";
import { useMapStore } from "../../store/mapStore";
import { ADD_NEXT_ITEMS } from "./stepMenu";

/**
 * A Steps box's "+" in its hover toolbar. On a step that may go on, it
 * opens the "Add next" menu (Step, Yes / No, Choice, Parallel, End); on a
 * Choice or Parallel it adds one more branch straight away; on an End or a
 * Yes / No it isn't there (`addNextOffer`).
 *
 * The menu opens with Step highlighted, so Enter adds a plain step. The
 * picked step is added once the menu has closed: the new box's name field
 * needs the focus, which the open menu would pull back.
 */
export function AddNextButton({ nodeId, className }: { readonly nodeId: NodeId; readonly className: string }) {
  const offer = useMapStore((s) => addNextOffer(s.map, nodeId));
  const first = useRef<HTMLDivElement>(null);
  const afterClose = useRef<(() => void) | null>(null);
  if (offer === null) return null;

  if (offer === "branch") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => useMapStore.getState().addStepBranch(nodeId)}
        aria-label="Add a branch"
        title="Add a branch (Tab)"
      >
        <Plus size={14} />
      </button>
    );
  }

  return (
    // Step highlighted as the menu opens (once Radix has put the focus on
    // the menu itself), so Enter picks it.
    <DropdownMenu onOpenChange={(open) => open && setTimeout(() => first.current?.focus())}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className} aria-label="Add next" title="Add next (Tab: a step)">
          <Plus size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="center"
        className="min-w-40"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const run = afterClose.current;
          afterClose.current = null;
          run?.();
        }}
      >
        <DropdownMenuLabel>Add next</DropdownMenuLabel>
        {/* End after a step that already goes on is refused by the store,
            with a hint saying why (a greyed item could not say it). */}
        {ADD_NEXT_ITEMS.map(({ type, label, hint, Icon }, i) => (
          <DropdownMenuItem
            key={type}
            ref={i === 0 ? first : undefined}
            title={hint}
            onSelect={() => (afterClose.current = () => useMapStore.getState().addStep(nodeId, type))}
          >
            <Icon aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
