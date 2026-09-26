import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Per docs/16_BUILD_CONTRACT.md §Fixed stack — Vite 5.4.14, React 18.3.1
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Fix monorepo path: packages/contracts/types is 2 levels above apps/web/
      "@contracts": resolve(__dirname, "../../packages/contracts/types.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  define: {
    __VITE_API_BASE_URL__: JSON.stringify(
      process.env.VITE_API_BASE_URL || "http://localhost:8000"
    ),
  },
});
