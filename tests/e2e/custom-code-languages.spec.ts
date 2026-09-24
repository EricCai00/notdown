import { expect, test } from "@playwright/test";

test("Excel formula selection and typing apply visible token colors", async ({ page, request }, testInfo) => {
  const formula = '=IF(1=1, "dasdas", "adsadasd")';
  const response = await request.post("/api/pages", {
    data: { title: "Excel formula colors", body: `\`\`\`text\n${formula}\n\`\`\``, syntax: { version: 1, variant: "notdown", extensions: {} } },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const block = page.locator(".pm-code-block");
  const code = block.locator("code");
  await block.hover();
  await block.getByRole("button", { name: "Code language" }).click();
  await page.getByRole("searchbox", { name: "Search for a language" }).fill("excel");
  await page.getByRole("button", { name: "Excel Formula", exact: true }).click();
  const checkColors = async () => {
    await expect(code.locator(".pm-code-builtin")).toHaveText("IF");
    await expect(code.locator(".pm-code-builtin")).toHaveCSS("color", "rgb(32, 106, 154)");
    await expect(code.locator(".pm-code-number").first()).toHaveCSS("color", "rgb(155, 75, 143)");
    await expect(code.locator(".pm-code-string").first()).toHaveCSS("color", "rgb(165, 82, 61)");
    await expect(code.locator(".pm-code-operator").first()).toHaveCSS("color", "rgb(79, 94, 119)");
  };
  await checkColors();
  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("+1");
  await expect(code).toHaveText(formula + "+1");
  await checkColors();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain(formula + "+1");
  await page.reload();
  await checkColors();
  await block.screenshot({ path: testInfo.outputPath("excel-formula-colors.png") });
});

test("Custom languages are separate, searchable, colored and preserved after save", async ({ page, request }) => {
  const samples = [
    ["lean4", "Lean", "theorem identity (p : Prop) : p → p := by\n  intro h\n  exact h"],
    ["actionscript", "ActionScript", 'public class Hello { public var message:String = "hi"; }'],
    ["wenyan", "Wenyan", '吾有一言。曰「「😀你好」」。書之。'],
    ["octave", "GNU Octave", '# comment\nif true\nx = "hi";\nendif'],
    ["awk", "AWK", 'BEGIN { print "hello" }'],
    ["cmd", "Batch (CMD)", '@echo off\necho %PATH%'],
    ["wikitext", "Wikitext", "== Title ==\n'''Bold''' [[Page]]"],
    ["jinja2", "Jinja", '<p>{% for x in xs %}{{ x }}{% endfor %}</p>'],
    ["django", "Django Template Language", '<p>{{ title|upper }}</p>'],
    ["svg", "SVG", '<svg xmlns="http://www.w3.org/2000/svg"><circle r="8"/></svg>'],
    ["ttl", "Turtle", '@prefix ex: <https://example.org/> .\nex:s ex:p "hello" .'],
    ["epl", "Easy Programming Language", '.版本 2\n.子程序 问好\n调试输出 (“你好”)'],
    ["excel-formula", "Excel Formula", '=SUM($A$1:B9)'],
    ["regex", "Regular Expression", '^[A-Z]+\\d{2,4}$'],
    ["sed", "sed", '# comment\ns#old#new#g'],
    ["sparql", "SPARQL", 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 10'],
    ["vimscript", "Vimscript", 'let g:name = "hello"\necho g:name'],
    ["mathematica", "Wolfram Language", "Plot[Sin[x], {x, 0, Pi}]"],
  ];
  const body = samples.map(([id, , code]) => `\`\`\`${id}\n${code}\n\`\`\``).join("\n\n");
  const response = await request.post("/api/pages", {
    data: { title: "Custom code languages", body, syntax: { version: 1, variant: "notdown", extensions: {} } },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const blocks = page.locator(".pm-code-block");
  await expect(blocks).toHaveCount(samples.length);
  for (const [index, [, label, code]] of samples.entries()) {
    await expect(blocks.nth(index).getByRole("button", { name: "Code language" })).toHaveText(label);
    await expect(blocks.nth(index).locator("code")).toHaveText(code);
    await expect(blocks.nth(index).locator(".pm-code-token").first()).toBeVisible();
    const palette = await blocks.nth(index).locator("code").evaluate(element => ({
      plain: getComputedStyle(element).color,
      tokens: Array.from(element.querySelectorAll(".pm-code-token"), token => getComputedStyle(token).color),
    }));
    expect(palette.tokens.some(color => color !== palette.plain), `${label} has visible token colors`).toBe(true);
  }
  const first = blocks.first();
  await first.hover();
  await first.getByRole("button", { name: "Code language" }).click();
  const notion = page.getByRole("group", { name: "Notion", exact: true });
  const custom = page.getByRole("group", { name: "Custom", exact: true });
  await expect(notion.locator("button")).toHaveCount(87);
  await expect(custom.locator("button")).toHaveCount(17);
  await expect(notion.getByRole("button", { name: "Lean", exact: true })).toHaveCount(0);
  await expect(custom.locator(".is-current")).toHaveText("Lean");
  const search = page.getByRole("searchbox", { name: "Search for a language" });
  await search.fill("script");
  await expect(notion.getByRole("button", { name: "JavaScript", exact: true })).toBeVisible();
  await expect(custom.getByRole("button", { name: "ActionScript", exact: true })).toBeVisible();
  await search.fill("mathematica");
  await expect(notion.getByRole("button", { name: "Wolfram Language", exact: true })).toBeVisible();
  await expect(custom).toHaveCount(0);
  await search.fill("文言");
  await expect(custom.getByRole("button", { name: "Wenyan", exact: true })).toBeVisible();
  await expect(notion).toHaveCount(0);
  for (const [alias, label] of [["易语言", "Easy Programming Language"], ["rq", "SPARQL"], ["viml", "Vimscript"], ["gsed", "sed"], ["regexp", "Regular Expression"], ["xlsx", "Excel Formula"]]) {
    await search.fill(alias);
    await expect(custom.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await search.fill("cmd");
  await search.press("ArrowDown");
  await expect(custom.getByRole("button", { name: "Batch (CMD)", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(first.getByRole("button", { name: "Code language" })).toHaveText("Batch (CMD)");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("```batch\n");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).toContain("```mathematica\n");
  expect(saved).toContain("```svg\n");
  await page.reload();
  await expect(blocks.first().getByRole("button", { name: "Code language" })).toHaveText("Batch (CMD)");
  await expect(blocks.last().getByRole("button", { name: "Code language" })).toHaveText("Wolfram Language");
  for (const [index, [, , code]] of samples.entries()) await expect(blocks.nth(index).locator("code")).toHaveText(code);
});
