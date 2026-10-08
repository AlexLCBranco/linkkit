import { Keyboard } from "lucide-react";
import { Fragment } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { SHORTCUT_GROUPS, SHORTCUTS, shortcutCaps, type Shortcut } from "../../domain/shortcuts";
import { useShortcutsDialog } from "../../store/shortcutsDialog";
import styles from "./HeaderButton.module.css";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const ROWS: readonly Shortcut[] = Object.values(SHORTCUTS);

const TAGS = { tree: "Trees only", "not-tree": "Not in trees" } as const;

/**
 * A keyboard button in the header that opens a read-only list of every
 * shortcut, as in Treekit; `?` opens it too, and Esc closes it (Radix's
 * dialog). The rows come from `domain/shortcuts.ts`, the same table the
 * key handlers read, so the list can't promise a key that does nothing.
 */
export function ShortcutsDialog() {
  const open = useShortcutsDialog((s) => s.open);
  const setOpen = useShortcutsDialog((s) => s.setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={styles.button} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          <Keyboard size={16} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shortcuts</DialogTitle>
          <DialogDescription>Every one of these also has a mouse way: a click, a drag or a right-click.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <ShortcutList key={group} title={group} rows={ROWS.filter((row) => row.group === group)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutList({ title, rows }: { readonly title: string; readonly rows: readonly Shortcut[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.does} className="flex items-center justify-between gap-4">
            <span className="text-foreground">
              {row.does}
              {row.typing && <Tag>While typing</Tag>}
              {row.only && <Tag>{TAGS[row.only]}</Tag>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {shortcutCaps(row, isMac).map((caps, index) => (
                <Fragment key={caps.join("+")}>
                  {index > 0 && <span className="text-xs text-muted-foreground">or</span>}
                  <KbdGroup>
                    {caps.map((cap) => (
                      <Kbd key={cap}>{cap}</Kbd>
                    ))}
                  </KbdGroup>
                </Fragment>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tag({ children }: { readonly children: string }) {
  return (
    <span className="ml-2 inline-block rounded-sm border border-foreground/15 px-1 align-middle text-xs whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}
