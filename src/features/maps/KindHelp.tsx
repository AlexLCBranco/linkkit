import { CircleHelp } from "lucide-react";
import { Tooltip } from "radix-ui";
import { useState, type SyntheticEvent } from "react";

import styles from "./KindHelp.module.css";

// The icon sits inside a menu item: these keep a press on it from also
// choosing the item (which would make the map).
const keepFromItem = (e: SyntheticEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

/**
 * A small "?" at the end of a menu item: hover it (or click it) and a
 * short description of that kind of map shows beside the menu. Hidden
 * until asked for, so the menu stays short.
 */
export function KindHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <span
            role="button"
            aria-label="What is this?"
            className={styles.help}
            onPointerDown={keepFromItem}
            onPointerUp={keepFromItem}
            onClick={(e) => {
              keepFromItem(e);
              setOpen((was) => !was);
            }}
          >
            <CircleHelp size={14} />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="right" sideOffset={12} className={styles.tip}>
            {text}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
