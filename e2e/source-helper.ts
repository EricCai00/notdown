import { expect, type Page } from "@playwright/test";

/** Small fixtures fit CodeMirror's rendered viewport plus margin. */
export async function expectSource(
  page: Page,
  expected: string | RegExp,
  absent = false,
) {
  const value = () =>
    page
      .locator("#source-editor .cm-line")
      .evaluateAll((lines) => lines.map((l) => l.textContent ?? "").join("\n"));
  if (typeof expected === "string")
    await expect.poll(value).toBe(expected.replace(/\r\n|\r/g, "\n"));
  else if (absent) await expect.poll(value).not.toMatch(expected);
  else await expect.poll(value).toMatch(expected);
}
