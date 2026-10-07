import { useLinkHold } from "../../store/linkHold";
import { useMapStore } from "../../store/mapStore";
// The same strip as the save-failed banner: both are "stop and read this".
import styles from "./SaveFailedBanner.module.css";

/**
 * Shown while the open tree is shared with a Boardkit board Linkkit can't
 * write: saved by a newer Boardkit, or damaged (Boardkit repairs a damaged
 * board when it opens it). The tree shows Linkkit's last copy and refuses
 * every change until the board reads cleanly again; the banner then goes
 * by itself (Linkkit hears Boardkit's save).
 */
export function LinkHoldBanner() {
  const id = useMapStore((s) => s.map.id);
  const reason = useLinkHold((s) => s.held[id]);
  if (!reason) return null;

  return (
    <div className={styles.banner} role="status">
      <div className={styles.text}>
        <p className={styles.title}>This map can't be changed right now</p>
        <p className={styles.body}>
          {reason === "newer"
            ? "It's shared with a Boardkit board saved by a newer version of Boardkit. Reload this page to get the newest Linkkit, then change it."
            : "It's shared with a Boardkit board that is damaged. Open that board in Boardkit, which repairs it; this map then opens as usual."}{" "}
          Until then you see Linkkit's last copy.
        </p>
      </div>
      <div className={styles.actions}>
        {reason === "newer" && (
          <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
            Reload
          </button>
        )}
      </div>
    </div>
  );
}
