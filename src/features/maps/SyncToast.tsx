import { X } from "lucide-react";
import { useEffect } from "react";

import { useSyncNotice } from "../../store/syncNotice";
import styles from "./SyncToast.module.css";

/** How long a message stays before it goes by itself. */
const SHOW_MS = 6000;

/**
 * Says what another tab's save did to this one: an item both tabs
 * changed, where the other tab's version was kept, or the open map deleted
 * there. A toast rather than a banner (Boardkit's choice): nothing is
 * wrong and nothing needs answering, the user just shouldn't wonder where
 * their change went. A message about the user's own edit may carry one
 * button (a bracket's "Cleared 2 later results · Undo").
 */
export function SyncToast() {
  const message = useSyncNotice((s) => s.message);
  const dismiss = useSyncNotice((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, dismiss]);

  if (!message) return null;
  return (
    <div className={styles.toast} role="status" key={message.seq}>
      <p className={styles.text}>{message.text}</p>
      {message.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            dismiss();
            message.action!.run();
          }}
        >
          {message.action.label}
        </button>
      )}
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
