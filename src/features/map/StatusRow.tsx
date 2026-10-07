import type { ComponentType, ReactNode } from "react";

import { NODE_STATUSES, type NodeStatus } from "../../domain/types";
import styles from "./StatusRow.module.css";
import { STATUS_META } from "./statusMeta";

/** The menu item each choice is drawn as (see SwatchRow): the right-click
    menu's or the toolbar dropdown's. */
type ItemComponent = ComponentType<{
  className?: string;
  title?: string;
  "aria-label"?: string;
  "data-current"?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}>;

/**
 * Keep / maybe / cut as one row of small buttons, like the colour row:
 * "none" first, then the three, the current one ringed (Treekit lists them
 * as menu lines; a row keeps the menu short and matches the colours).
 */
export function StatusRow({
  value,
  onPick,
  Item,
}: {
  /** Undefined: several boxes with different statuses (none ringed). */
  readonly value: NodeStatus | null | undefined;
  readonly onPick: (status: NodeStatus | null) => void;
  readonly Item: ItemComponent;
}) {
  return (
    <div className={styles.row}>
      <Item
        className={styles.choice}
        data-current={value === null || undefined}
        title="No status"
        aria-label="No status"
        onSelect={() => onPick(null)}
      >
        <span className={styles.none} aria-hidden>
          –
        </span>
      </Item>
      {NODE_STATUSES.map((status) => {
        const { label, icon: Icon } = STATUS_META[status];
        return (
          <Item
            key={status}
            className={styles.choice}
            data-current={value === status || undefined}
            title={status === "cut" ? `${label} (X)` : label}
            aria-label={label}
            onSelect={() => onPick(status)}
          >
            <Icon size={14} aria-hidden />
          </Item>
        );
      })}
    </div>
  );
}
