import { defineConfig } from "vite";
import { build } from "esbuild";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  root: mode === "mobile" ? path.resolve("src/mobile") : undefined,
  publicDir: path.resolve("public"),
  plugins: [{
    name: "notdown-ojs-sandbox",
    resolveId: id => ["virtual:notdown-ojs", "virtual:notdown-ojs-output"].includes(id) ? "\0" + id.slice(8) : undefined,
    async load(id) {
      if (!["\0notdown-ojs", "\0notdown-ojs-output"].includes(id)) return;
      const entry = id.endsWith("-output") ? "src/editor/ojs-output.ts" : "src/editor/ojs-runtime.ts";
      this.addWatchFile(path.resolve(entry));
      if (!id.endsWith("-output")) this.addWatchFile(path.resolve("src/editor/ojs-scheduler.ts"));
      const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", minify: true });
      return `export default ${JSON.stringify(result.outputFiles[0].text)}`;
    },
  }],
  server: {
    // Generated editor assets are prepared before startup. Watching their bulk
    // updates during a build can fail with EBUSY on Windows and stop the server.
    watch: { ignored: ["**/public/vendor", "**/public/vendor/**", "**/.run/**"] },
    proxy: {
      "^/v/[a-f0-9]{64}/(api|assets)(/|$)": "http://127.0.0.1:4318",
      "/api": "http://127.0.0.1:4318",
      "/assets": "http://127.0.0.1:4318",
    },
  },
  build: {
    ...(mode === "mobile" ? { outDir: path.resolve(".run/android-frontend"), emptyOutDir: true }
      : process.env.NOTDOWN_E2E_FRONTEND_DIR ? { outDir: path.resolve(process.env.NOTDOWN_E2E_FRONTEND_DIR), emptyOutDir: true } : {}),
    assetsDir: "static",
    rollupOptions: {
      input: mode === "mobile" ? path.resolve("src/mobile/index.html") : { main: "index.html", lab: "markdown-lab.html", catalog: "block-catalog.html" },
      output: { manualChunks: { editor: ["prosemirror-view", "prosemirror-state", "prosemirror-model", "prosemirror-commands", "prosemirror-history", "prosemirror-schema-list"] } },
    },
  },
}));
