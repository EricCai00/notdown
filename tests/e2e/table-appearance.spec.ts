import { expect, test } from "@playwright/test";

test("typing a lone pipe in Split adds an empty line-block row without creating a table", async ({ page, request }) => {
  const verse = "| dada\n| dasdasd\n| esfsdf\n| fsfsf\n|     jf;ljs;djds;\n| $1\\$2\n| $1\\$2\n| $1\\$2";
  const tableSource = "| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3 |";
  const source = verse + "\n\n\n" + tableSource;
  const response = await request.post("/api/pages", { data: {
    title: "Line block and table boundary", body: source,
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await page.locator('.editing-modes [data-mode="split"]').click();
  const editor = page.locator("#editor .pm-document");
  const rows = editor.locator(".pm-line-block .pm-verse-line");
  await expect(rows).toHaveCount(8);
  await expect(editor.locator("table")).toHaveCount(1);
  const input = page.locator("#source-editor");
  await input.click();
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.type("|");
  await expect(rows).toHaveCount(9);
  await expect(rows.last()).toHaveText("");
  await expect(editor.locator("table")).toHaveCount(1);
  await expect(editor.locator("table")).toContainText("苹果");
  await page.keyboard.press("Backspace");
  await expect(rows).toHaveCount(8);
  await page.keyboard.type("|");
  await expect(rows).toHaveCount(9);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(verse + "\n|\n\n" + tableSource);
  await page.reload();
  await expect(rows).toHaveCount(9);
  await expect(editor.locator("table")).toHaveCount(1);
});

for (const variant of ["notdown", "gfm"]) {
  test(`${variant} table headers and body share borders and column alignment in Page and Split`, async ({ page, request }, testInfo) => {
    const response = await request.post("/api/pages", { data: {
      title: "Table appearance",
      body: "| 默认 | 左对齐 | 居中 | 右对齐 |\n| --- | :--- | :---: | ---: |\n| 苹果 | 香蕉 | 梨 | 3 |",
      syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    const table = page.locator("#editor .pm-table");
    const alignments = ["left", "left", "center", "right"];
    const check = async () => {
      await expect(table.locator("tr")).toHaveCount(2);
      if (variant === "notdown") await expect(table.locator("th")).toHaveCount(4);
      const cells = await table.locator("th, td").evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return {
          borders: ["Top", "Right", "Bottom", "Left"].map(side =>
            style.getPropertyValue(`border-${side.toLowerCase()}`)),
          padding: style.padding,
          align: style.textAlign,
          textAlign: getComputedStyle(element.querySelector("p")!).textAlign,
        };
      }));
      expect(cells).toHaveLength(8);
      for (const [index, cell] of cells.entries()) {
        expect(cell.borders).toEqual(Array(4).fill("1px solid rgb(227, 226, 224)"));
        expect(cell.padding).toBe("6px 10px");
        expect(cell.align).toBe(alignments[index % 4]);
        expect(cell.textAlign).toBe(alignments[index % 4]);
      }
    };
    for (const mode of ["document", "split"]) {
      await page.locator(`.editing-modes [data-mode="${mode}"]`).click();
      await check();
      await table.screenshot({ path: testInfo.outputPath(`${mode}-table.png`) });
    }
    await table.locator("tr").last().locator("td p").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type("0");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("30");
    await page.reload();
    await check();
    await expect(table.locator("tr").last().locator("td").last()).toHaveText("30");
  });
}
