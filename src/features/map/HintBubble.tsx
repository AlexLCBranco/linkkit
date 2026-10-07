import { useEffect } from "react";

import { useHint } from "../../store/hint";
import styles from "./HintBubble.module.css";

/** How long a hint stays, matching `--hint-duration`'s fade. */
const HINT_MS = 4500;

/**
 * The hint for a refused action, right where it happened (`store/hint.ts`):
 * "In a tree every box needs a parent: ...". It fades out by itself, and
 * goes at once on the next press anywhere. Drawn over the page, ignoring
 * the mouse. Keyed by `seq`, so the same hint twice runs its fade again.
 */
export function HintBubble() {
  const hint = useHint((s) => s.hint);
  const clear = useHint((s) => s.clear);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(clear, HINT_MS);
    // The press that showed it is over by now; the next one clears it.
    const onDown = () => clear();
    const listen = window.setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(listen);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [hint, clear]);

  if (!hint) return null;
  return (
    <div key={hint.seq} className={styles.hint} style={{ left: hint.at.x, top: hint.at.y }} role="status">
      {hint.text}
    </div>
  );
}
