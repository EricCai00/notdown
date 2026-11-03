import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("desktop-dist", { recursive: true });
await build({ entryPoints: ["src/desktop/main.ts"], outfile: "desktop-dist/main.mjs", bundle: true, platform: "node", format: "esm", packages: "external", target: "node24", sourcemap: true });
await build({ entryPoints: ["src/desktop/preload.ts"], outfile: "desktop-dist/preload.cjs", bundle: true, platform: "node", format: "cjs", external: ["electron"], target: "node24" });
await build({ entryPoints: ["src/desktop/welcome.ts"], outfile: "desktop-dist/welcome.js", bundle: true, platform: "browser", target: "es2022" });
for (const name of ["welcome.html", "welcome.css"]) await copyFile(`src/desktop/${name}`, `desktop-dist/${name}`);
await copyFile("src/assets/notdown-icon.png", "desktop-dist/icon.png");
await copyFile("server/r-notebook-driver.R", "desktop-dist/r-notebook-driver.R");
await copyFile("server/jupyter-driver.py", "desktop-dist/jupyter-driver.py");

for (const name of ["vault-manager.css", "vault-picker.css"]) await copyFile(`src/features/vault/${name}`, `desktop-dist/${name}`);
