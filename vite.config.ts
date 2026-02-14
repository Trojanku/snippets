import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  css: {
    postcss: resolve(__dirname, "postcss.config.mjs"),
  },
  server: {
    port: 5173,
    host: true, // Expose on Tailscale network
    proxy: {
      "/api": "http://localhost:3811",
    },
  },
  build: {
    outDir: "../../dist/web",
  },
});
