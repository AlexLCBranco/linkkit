import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { MovedNotice } from "./app/MovedNotice";
import { movedTo } from "./domain/address";
import { initAutoBackup } from "./features/maps/autoBackup";
import { initAutoSave } from "./store/autoSave";
import { initOtherTabs } from "./store/mapStore";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

// On an old address only the "this app moved" notice runs: no autosave and
// no automatic backups, so the maps this address holds are left as they are.
const moved = movedTo(window.location.hostname);
if (!moved) {
  initAutoSave();
  initOtherTabs();
  initAutoBackup();
}

createRoot(container).render(
  <StrictMode>{moved ? <MovedNotice to={moved} /> : <App />}</StrictMode>,
);
