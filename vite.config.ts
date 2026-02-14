import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
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
