import { AddBoxButton } from "../features/map/AddBoxButton";
import { DeleteBranchDialog } from "../features/map/DeleteBranchDialog";
import { HistoryButtons } from "../features/map/HistoryButtons";
import { MapCanvas } from "../features/map/MapCanvas";
import { SelectionBar } from "../features/map/SelectionBar";
import { TidyButton } from "../features/map/TidyButton";
import { ZoomControls } from "../features/map/ZoomControls";
import { BackupHoldBanner } from "../features/maps/BackupHoldBanner";
import { EmbedBackupStrip } from "../features/maps/EmbedBackupStrip";
import { LinkHoldBanner } from "../features/maps/LinkHoldBanner";
import { SaveFailedBanner } from "../features/maps/SaveFailedBanner";
import { SyncToast } from "../features/maps/SyncToast";
import { NotesPanel } from "../features/notes/NotesPanel";
import { LinkPromptHost } from "../features/map/LinkPromptHost";
import { TrashFullDialog } from "../features/trash/TrashFullDialog";
import { useEmbedStatus } from "../store/embed";
import { useMapStore } from "../store/mapStore";
import styles from "./App.module.css";

/**
 * Embed mode (`?embed=1&id=…`): one map for a frame on the gauntlet canvas.
 * No header, map menu, export or trash: only the map and the few tools that
 * editing with the mouse needs (add, tidy, undo, redo), floating in a
 * corner. Every warning banner still shows, since this frame may be the
 * only place the user sees the map.
 */
export function EmbedApp() {
  const status = useEmbedStatus((s) => s.status);
  const mapId = useMapStore((s) => s.map.id);
  if (status !== "ok") return <EmbedGone status={status} />;
  return (
    <div className={styles.app} data-embed-app="">
      <SaveFailedBanner />
      <LinkHoldBanner />
      <BackupHoldBanner />
      <EmbedBackupStrip />
      <main className={styles.main}>
        <MapCanvas key={mapId} />
        <SelectionBar />
        <ZoomControls />
        <NotesPanel />
        <LinkPromptHost />
        <div className={styles.embedTools} aria-label="Map tools" role="toolbar">
          <AddBoxButton />
          <TidyButton />
          <HistoryButtons />
        </div>
      </main>
      <DeleteBranchDialog />
      <TrashFullDialog />
      <SyncToast />
    </div>
  );
}

function EmbedGone({ status }: { status: "missing" | "deleted" }) {
  return (
    <div className={styles.embedGone} role="status" data-testid="embed-gone">
      <p className={styles.embedGoneTitle}>{status === "deleted" ? "This map was deleted" : "This map isn't here"}</p>
      <p>
        {status === "deleted"
          ? "It was deleted in another tab or frame. If it's in Linkkit's Recently deleted, restore it there and reload."
          : "No Linkkit map in this browser has this frame's link. It may have been deleted for good, or made in another browser."}
      </p>
    </div>
  );
}
