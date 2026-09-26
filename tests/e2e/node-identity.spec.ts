import { expect, test } from "@playwright/test";

test("actual editor node names are object IDs before and after saving and reopening", async ({ page, request }) => {
  const body = '# Identity\n\n<mention-user url="user://alice" future="keep">Alice</mention-user> <mention-date start="2026-09-24"/> <mention-page url="#page/missing">Page</mention-page> <mention-link url="https://example.com">Link</mention-link>\n\n<audio src="clip.mp3">Audio</audio>\n\n> Quote\n\nTail';
  const note = await (await request.post("/api/pages", { data: {
    title: "Canonical object IDs", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue("Canonical object IDs");
  const editor = page.locator(".pm-document[contenteditable=true]");
  const names = () => editor.evaluate(element => {
    // Inspect the real ProseMirror document, not CSS labels or a second mapping.
    const doc = (element as HTMLElement & { pmViewDesc: { node: {
      descendants: (visit: (node: { type: { name: string } }) => void) => void;
    } } }).pmViewDesc.node;
    const found: string[] = [];
    doc.descendants(node => { found.push(node.type.name); });
    return [...new Set(found)].sort();
  });
  const expected = ["block.heading", "block.paragraph", "block.quote", "block.audio", "inline.mention_person", "inline.date_or_reminder", "inline.internal_link", "inline.link", "text"].sort();
  await expect.poll(names).toEqual(expected);
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body + "!");
  await page.reload();
  await expect.poll(names).toEqual(expected);
  await expect(editor.locator(":scope > p").last()).toHaveText("Tail!");
  expect(errors).toEqual([]);
});
