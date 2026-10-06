import { useRef, useState } from "react";

import { useMissingMaps } from "../../store/missingMaps";
import { restoreFrom } from "./backupFile";
// The same strip as the save-failed banner: both are "stop and read this".
import styles from "./SaveFailedBanner.module.css";

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
function listNames(names: readonly string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  return quoted.length <= 1 ? (quoted[0] ?? "") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

/**
 * Says which maps were lost when Linkkit opened: the saved list named them,
 * but their content wasn't in storage (most likely their save failed with
 * storage full, and the tab closed before "Try again"). Without this they
 * would just be gone from the list. Offers restoring from an exported file
 * here, since the menu offers that only on an empty Linkkit; a restore
 * never replaces a map that is already here.
 */
export function MissingMapsBanner() {
  const names = useMissingMaps((s) => s.names);
  const dismiss = useMissingMaps((s) => s.dismiss);
  const filePicker = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ title: string; text: string } | null>(null);

  if (names.length === 0) return null;
  const one = names.length === 1;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        {result ? (
          <>
            <p className={styles.title}>{result.title}</p>
            <p className={styles.body}>{result.text}</p>
          </>
        ) : (
          <>
            <p className={styles.title}>
              {one ? "A map couldn't be found" : `${names.length} maps couldn't be found`}
            </p>
            <p className={styles.body}>
              {listNames(names)} {one ? "was" : "were"} in your list of maps, but{" "}
              {one ? "its" : "their"} content isn't in this browser's storage, so{" "}
              {one ? "it was" : "they were"} taken off the list. Most likely a save failed because
              storage was full and the tab closed before it was retried. If you exported your maps,
              restore from that file: maps already here are left as they are.
            </p>
          </>
        )}
      </div>
      <div className={styles.actions}>
        {!result && (
          <button type="button" className={styles.primary} onClick={() => filePicker.current?.click()}>
            Restore from a file…
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={dismiss}>
          {result ? "OK" : "Dismiss"}
        </button>
      </div>
      <input
        ref={filePicker}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so picking the same file again still counts as a change.
          e.target.value = "";
          if (file) void restoreFrom(file).then(setResult);
        }}
      />
    </div>
  );
}
