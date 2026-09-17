import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app is hosted under a sub-path so it lives at http://localhost/redditdrama/.
// This base must match BASE_PATH in server/index.js.
const BASE = "/redditdrama/";

// The React UI runs on 5173 and proxies API + finished-video requests to the
// Express backend on 8787, so the browser only ever talks to one origin.
export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/redditdrama/api": "http://localhost:8787",
      "/redditdrama/output": "http://localhost:8787",
    },
    // Don't let Vite's HMR watcher touch the asset folders. Large/locked video
    // files there otherwise crash the watcher on Windows (EBUSY), and the app
    // serves those files through the backend anyway, not Vite.
    watch: {
      ignored: [
        "**/public/video-bank/**",
        "**/public/audio/**",
        "**/public/samples/**",
        "**/output/**",
        "**/data/**",
      ],
    },
  },
});
