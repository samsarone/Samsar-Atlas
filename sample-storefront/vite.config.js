import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const atlasProxyTarget =
  process.env.VITE_ATLAS_PROXY_TARGET || "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/a2a": {
        target: atlasProxyTarget,
        changeOrigin: true,
      },
      "/tasks": {
        target: atlasProxyTarget,
        changeOrigin: true,
      },
      "/agents": {
        target: atlasProxyTarget,
        changeOrigin: true,
      },
      "/.well-known": {
        target: atlasProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
