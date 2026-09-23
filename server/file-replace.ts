import { promises as fs } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

/** Windows readers/virus scanners may briefly deny replacement. Never delete
 * the destination to work around it, or replace externally changed content. */
export async function replaceFile(
  temporary: string,
  destination: string,
  expected: Buffer | null,
  rename: typeof fs.rename = fs.rename,
) {
  for (let attempt = 0; ; attempt++) {
    if (attempt) {
      await delay(Math.min(20 * 2 ** (attempt - 1), 160));
      const current = await fs
        .readFile(destination)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
      if (
        current === null
          ? expected !== null
          : expected === null || !current.equals(expected)
      )
        throw new Error(
          "The original file changed while waiting for it to be released. Your draft is preserved; reload and merge.",
        );
    }
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (
        attempt >= 6 ||
        !["EPERM", "EBUSY", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
  }
}
