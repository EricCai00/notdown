export const runtimeKeys = ["rscript", "python", "julia", "pandoc", "pythonKernel", "juliaKernel", "jupyterDataDir"] as const;
export type RuntimeSettings = Record<typeof runtimeKeys[number], string>;
export type RuntimeOptions = Partial<RuntimeSettings>;
export type RuntimeSettingsSnapshot = { settings: RuntimeSettings; inherited: RuntimeSettings; revision: string };
export type RuntimeCheck = { available: boolean; detail: string };
