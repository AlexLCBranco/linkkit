import { AddBoxButton } from "../features/map/AddBoxButton";
import { HistoryButtons } from "../features/map/HistoryButtons";
import { MapCanvas } from "../features/map/MapCanvas";
import { ReachStatus } from "../features/map/ReachStatus";
import { TidyButton } from "../features/map/TidyButton";
import { MapSwitcher } from "../features/maps/MapSwitcher";
import { useMapStore } from "../store/mapStore";
import styles from "./App.module.css";
import { VersionBadge } from "./VersionBadge";

/**
 * Page chrome only: a header, the status bar and the area the map fills.
 * It knows nothing about boxes or arrows, so the map can later be embedded
 * elsewhere (a shared board) without changes here.
 */
export function App() {
  const mapId = useMapStore((s) => s.map.id);
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <MapSwitcher />
        <AddBoxButton />
        <TidyButton />
        <HistoryButtons />
      </header>
      <div className={styles.status} aria-live="polite">
        <ReachStatus />
      </div>
      <main className={styles.main}>
        {/* Keyed by the map: another map gets a fresh canvas (its own box
            measurements, glide and scroll) instead of inheriting this one's. */}
        <MapCanvas key={mapId} />
      </main>
      <VersionBadge />
    </div>
  );
}
