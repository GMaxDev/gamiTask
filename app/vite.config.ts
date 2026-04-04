import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
