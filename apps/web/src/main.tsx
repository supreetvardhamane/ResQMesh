/**
 * ResQMesh — Web Application Entry Point
 * (apps/web/src/main.tsx)
 *
 * Per docs/16_BUILD_CONTRACT.md §Fixed stack:
 * - React 18.3.1 with createRoot
 * - TypeScript strict mode
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
