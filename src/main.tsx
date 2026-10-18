import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { EmbedApp } from "./app/EmbedApp";
import { initEmbedBridge } from "./app/embedBridge";
import { MovedNotice } from "./app/MovedNotice";
import { movedTo } from "./domain/address";
import { initAutoBackup } from "./features/maps/autoBackup";
import { initAutoSave } from "./store/autoSave";
import { initBackupHold } from "./store/backupHold";
import { embedded, useEmbedStatus } from "./store/embed";
import { initOtherTabs } from "./store/mapStore";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

// On an old address only the "this app moved" notice runs: no autosave and
// no automatic backups, so the maps this address holds are left as they are.
const moved = movedTo(window.location.hostname);
// A frame on the gauntlet canvas (`?embed=1&id=…`): one map, no chrome.
const embed = embedded();
if (embed) document.documentElement.dataset.embed = "";
// A frame whose map isn't here shows only that; it saves nothing.
const placeholder = embed !== null && useEmbedStatus.getState().status !== "ok";
if (!moved && !placeholder) {
  initAutoSave();
  initOtherTabs();
  initBackupHold();
  initAutoBackup();
}
if (!moved && embed) initEmbedBridge();

createRoot(container).render(
  <StrictMode>{moved ? <MovedNotice to={moved} /> : embed ? <EmbedApp /> : <App />}</StrictMode>,
);
