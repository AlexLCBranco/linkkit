import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { initAutoBackup } from "./features/maps/autoBackup";
import { initAutoSave } from "./store/autoSave";
import { initOtherTabs } from "./store/mapStore";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

initAutoSave();
initOtherTabs();
initAutoBackup();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
