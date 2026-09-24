import { expect, test } from "@playwright/test";

test("new languages highlight locally and the code menu excludes Mermaid", async ({ page, request }) => {
  const samples = [
    ["agda", "module Main where"],
    ["ascii-art", "  /\\_/\\\n ( o.o )"],
    ["assembly", "mov eax, 42"],
    ["bnf", '<digit> ::= "0" | "1"'],
    ["dhall", "let answer = 42 in answer"],
    ["ebnf", 'digit = "0" | "1" ;'],
    ["hcl", 'resource "aws_instance" "web" {}'],
    ["idris", "module Main\nanswer : Nat"],
    ["llvm", "define i32 @main() { ret i32 0 }"],
    ["mathematica", "Plot[Sin[x], {x, 0, Pi}]"],
    ["notion-formula", 'if(prop("完成"), true, 42)'],
    ["purescript", "module Main where\nanswer :: Int"],
    ["smalltalk", "true ifTrue: [Transcript show: 'hello']."],
    ["solidity", "contract Counter { uint value = 1; }"],
    ["toml", '[package]\nname = "hello"'],
  ];
  const response = await request.post("/api/pages", {
    data: {
      title: "All new code languages",
      body: samples.map(([language, code]) => `\`\`\`${language}\n${code}\n\`\`\``).join("\n\n"),
      syntax: { version: 1, variant: "notdown", extensions: {} },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const blocks = page.locator(".pm-document .pm-code-block");
  await expect(blocks).toHaveCount(15);
  for (const [index, [language, source]] of samples.entries()) {
    const code = blocks.nth(index).locator("code");
    await expect(code).toHaveText(source);
    if (language === "ascii-art") await expect(code.locator(".pm-code-token")).toHaveCount(0);
    else {
      await expect(code.locator(".pm-code-token").first()).toBeVisible();
      expect(await code.locator(".pm-code-token").evaluateAll(nodes => nodes.some(node =>
        getComputedStyle(node).color !== getComputedStyle(node.closest("code")!).color))).toBe(true);
    }
  }
  const block = blocks.first();
  await block.hover();
  await block.getByRole("button", { name: "Code language" }).click();
  const options = page.locator(".pm-code-language-option");
  await expect(options).toHaveCount(104);
  await expect(page.getByRole("group", { name: "Notion", exact: true }).locator("button")).toHaveCount(87);
  await expect(page.getByRole("group", { name: "Custom", exact: true }).locator("button")).toHaveCount(17);
  const names = await options.allTextContents();
  expect(names[0]).toBe("ABAP");
  expect(names[names.indexOf("PHP") + 1]).toBe("Plain Text");
  expect(names).not.toContain("Mermaid");
  for (const name of ["ASCII Art", "Notion Formula", "Visual Basic", "WebAssembly", "XML", "YAML"])
    expect(names).toContain(name);
  await page.getByRole("searchbox").fill("coq");
  await page.getByRole("button", { name: "Rocq", exact: true }).click();
  await expect(block.getByRole("button", { name: "Code language" })).toHaveText("Rocq");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("```rocq\nmodule Main where");
  await page.reload();
  await expect(blocks.first().getByRole("button", { name: "Code language" })).toHaveText("Rocq");
  await expect(blocks.nth(10).locator("code")).toHaveText(samples[10][1]);
});

test("unknown fences survive and disabled Mermaid diagrams do not become menu choices", async ({ page, request }) => {
  const body = "```mermaid\nflowchart LR\nA-->B\n```\n\n```Future-Lang\nconst untouched = 1;\n```";
  const response = await request.post("/api/pages", {
    data: { title: "Legacy code languages", body, syntax: { version: 1, variant: "notdown", extensions: { diagrams: false } } },
  });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const blocks = page.locator(".pm-code-block");
  await expect(blocks).toHaveCount(2);
  await blocks.first().hover();
  await blocks.first().getByRole("button", { name: "Code language" }).click();
  await expect(page.locator(".pm-code-language-option")).toHaveCount(104);
  await page.getByRole("searchbox").fill("mermaid");
  await expect(page.getByText("No languages found")).toBeVisible();
  await page.keyboard.press("Escape");
  await blocks.last().hover();
  await blocks.last().getByRole("button", { name: "Code language" }).click();
  await expect(page.locator(".pm-code-language-option.is-current")).toHaveText("Future-Lang");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});
