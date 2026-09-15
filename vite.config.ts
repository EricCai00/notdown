import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Generated editor assets are prepared before startup. Watching their bulk
    // updates during a build can fail with EBUSY on Windows and stop the server.
    watch: { ignored: ["**/public/vendor", "**/public/vendor/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4318",
      "/assets": "http://127.0.0.1:4318",
    },
  },
  build: {
    assetsDir: "static",
    rollupOptions: { output: { manualChunks: { editor: ["prosemirror-view", "prosemirror-state", "prosemirror-model", "prosemirror-commands", "prosemirror-history", "prosemirror-schema-list"] } } },
  },
});
