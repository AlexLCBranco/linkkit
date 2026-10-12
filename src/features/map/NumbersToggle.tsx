import { Hash } from "lucide-react";

import { useMapStore } from "../../store/mapStore";
import styles from "./HideCutToggle.module.css";

/**
 * "Numbers" (Steps maps only): shows or hides the step numbers on the
 * boxes. Saved with the map and an undo step, like "Hide cut", which it
 * mirrors in look; it moves no box (the numbers float on the boxes' top
 * edges). Pressed while the numbers show.
 */
export function NumbersToggle() {
  const isSteps = useMapStore((s) => s.map.kind === "steps");
  const shown = useMapStore((s) => !s.map.hideNumbers);
  const setHideNumbers = useMapStore((s) => s.setHideNumbers);
  if (!isSteps) return null;

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={shown}
      aria-label="Step numbers"
      onClick={() => setHideNumbers(shown)}
      title={shown ? "Hide the step numbers" : "Show the step numbers"}
    >
      <Hash size={14} aria-hidden />
      <span className={styles.word}>Numbers</span>
    </button>
  );
}
