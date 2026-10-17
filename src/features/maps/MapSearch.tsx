import { useEffect, useRef } from "react";

import styles from "./MapSwitcher.module.css";

/**
 * The map menu's search box. It takes the focus as the menu opens (after
 * Radix has focused the menu itself), so the user can just type. Keys stay
 * in the box: the menu would otherwise jump to an item starting with the
 * typed letter. Arrow down moves into the list; Enter opens the first match;
 * Escape still closes the menu.
 */
export function MapSearch({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus());
    return () => clearTimeout(id);
  }, []);

  return (
    <input
      ref={input}
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") return;
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          e.currentTarget.closest('[role="menu"]')?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }
      }}
      placeholder="Find a map…"
      aria-label="Find a map"
      className={styles.search}
    />
  );
}
