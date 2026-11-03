import { promises as fs } from "node:fs";
import path from "node:path";

type Language = "en" | "zh-CN";
export function createUILanguageStore(filename: () => string) {
  let queue = Promise.resolve();
  return {
    async get(): Promise<Language | null> {
      await queue.catch(() => {});
      try {
        const value = JSON.parse(await fs.readFile(filename(), "utf8"));
        return value === "en" || value === "zh-CN" ? value : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
      }
    },
    set(value: unknown) {
      if (value !== "en" && value !== "zh-CN") throw new Error("Invalid interface language");
      queue = queue.catch(() => {}).then(async () => {
        const target = filename(), temporary = `${target}.tmp`;
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(temporary, JSON.stringify(value), "utf8");
        await fs.rename(temporary, target);
      });
      return queue;
    },
  };
}
