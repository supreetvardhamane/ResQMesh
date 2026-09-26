import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Per docs/16_BUILD_CONTRACT.md §Fixed stack — Vite 5.4.14, React 18.3.1
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // Regex alias: catches ALL relative-depth imports ending in packages/contracts/types
        // e.g. ../../../../packages/contracts/types from src/features/relay/
        // e.g.    ../../../packages/contracts/types from src/App.tsx
        find: /^.*packages\/contracts\/types$/,
        replacement: resolve(__dirname, "../../packages/contracts/types.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  define: {
    __VITE_API_BASE_URL__: JSON.stringify("http://localhost:8000"),
  },
});
