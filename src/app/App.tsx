import { AddBoxButton } from "../features/map/AddBoxButton";
import { MapCanvas } from "../features/map/MapCanvas";
import { ReachStatus } from "../features/map/ReachStatus";
import { TidyButton } from "../features/map/TidyButton";
import { useMapStore } from "../store/mapStore";
import styles from "./App.module.css";
import { VersionBadge } from "./VersionBadge";

/**
 * Page chrome only: a header, the status bar and the area the map fills.
 * It knows nothing about boxes or arrows, so the map can later be embedded
 * elsewhere (a shared board) without changes here.
 */
export function App() {
  const name = useMapStore((s) => s.map.name);
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.name}>{name}</span>
        <AddBoxButton />
        <TidyButton />
      </header>
      <div className={styles.status} aria-live="polite">
        <ReachStatus />
      </div>
      <main className={styles.main}>
        <MapCanvas />
      </main>
      <VersionBadge />
    </div>
  );
}
