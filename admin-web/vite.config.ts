import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.ADMIN_WEB_API_TARGET || "http://127.0.0.1:3030";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/auth": apiTarget,
      "/health": apiTarget,
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/admin-web"),
    emptyOutDir: true,
  },
});
