import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
// Per docs/16_BUILD_CONTRACT.md §Fixed stack — Vite 5.4.14, React 18.3.1
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to FastAPI backend during local dev
      "/v1": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  define: {
    // Expose API base URL to app code
    __VITE_API_BASE_URL__: JSON.stringify(
      process.env.VITE_API_BASE_URL || "http://localhost:8000"
    ),
  },
});
