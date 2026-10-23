import path from "node:path";
import { runtimeKeys, type RuntimeOptions, type RuntimeSettings } from "../src/shared/runtime-settings";
import { inheritedRuntimes as inherit } from "../src/vault/runtime-settings";
export { runtimeSettingsSchema } from "../src/vault/runtime-settings";
const environmentKeys = { rscript: "NOTDOWN_RSCRIPT", python: "NOTDOWN_PYTHON", julia: "NOTDOWN_JULIA", pandoc: "PANDOC_PATH",
  pythonKernel: "NOTDOWN_JUPYTER_PYTHON_KERNEL", juliaKernel: "NOTDOWN_JUPYTER_JULIA_KERNEL", jupyterDataDir: "JUPYTER_DATA_DIR" } as const;
export const inheritedRuntimes = (): RuntimeSettings => inherit(process.env);
export function runtimeEnvironment(settings: RuntimeOptions): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of runtimeKeys) if (settings[key]) env[environmentKeys[key]] = settings[key];
  if (env.PANDOC_PATH) env.RSTUDIO_PANDOC = path.dirname(env.PANDOC_PATH);
  return env;
}
