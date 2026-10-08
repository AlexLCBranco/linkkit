import { AddBoxButton } from "../features/map/AddBoxButton";
import { ExportMenu } from "../features/export/ExportMenu";
import { AlignPanel } from "../features/map/AlignPanel";
import { DeleteBranchDialog } from "../features/map/DeleteBranchDialog";
import { ArrowLengthPanel } from "../features/map/ArrowLengthPanel";
import { DirectionToggle } from "../features/map/DirectionToggle";
import { HistoryButtons } from "../features/map/HistoryButtons";
import { HideCutToggle } from "../features/map/HideCutToggle";
import { MapCanvas } from "../features/map/MapCanvas";
import { ReachStatus } from "../features/map/ReachStatus";
import { SelectionBar } from "../features/map/SelectionBar";
import { TidyButton } from "../features/map/TidyButton";
import { ZoomControls } from "../features/map/ZoomControls";
import { MapSwitcher } from "../features/maps/MapSwitcher";
import { NotesPanel } from "../features/notes/NotesPanel";
import { LinkedChip } from "../features/maps/BoardLink";
import { LinkHoldBanner } from "../features/maps/LinkHoldBanner";
import { MissingMapsBanner } from "../features/maps/MissingMapsBanner";
import { SaveFailedBanner } from "../features/maps/SaveFailedBanner";
import { SyncToast } from "../features/maps/SyncToast";
import { TrashFullDialog } from "../features/trash/TrashFullDialog";
import { TrashPanel } from "../features/trash/TrashPanel";
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
        <LinkedChip />
        <AddBoxButton />
        <TidyButton />
        <HistoryButtons />
        <DirectionToggle />
        <ArrowLengthPanel />
        <AlignPanel />
        <HideCutToggle />
        <div className={styles.spacer} />
        <ExportMenu />
        <TrashPanel />
      </header>
      <SaveFailedBanner />
      <MissingMapsBanner />
      <LinkHoldBanner />
      <div className={styles.status} aria-live="polite">
        <ReachStatus />
      </div>
      <main className={styles.main}>
        {/* Keyed by the map: another map gets a fresh canvas (its own box
            measurements, glide and scroll) instead of inheriting this one's. */}
        <MapCanvas key={mapId} />
        <SelectionBar />
        <ZoomControls />
        <NotesPanel />
      </main>
      <DeleteBranchDialog />
      <TrashFullDialog />
      <SyncToast />
      <VersionBadge />
    </div>
  );
}
