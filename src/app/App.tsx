import { MapCanvas } from "../features/map/MapCanvas";
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
      </header>
      <div className={styles.status}>Click any box to see what it needs and what breaks without it.</div>
      <main className={styles.main}>
        <MapCanvas />
      </main>
      <VersionBadge />
    </div>
  );
}
