import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper.js";

const cases = [
  {
    variant: "markdown",
    flag: "blank_before_header",
    source: "text\n# Heading",
    selector: "h1",
    count: 0,
    checked: true,
  },
  {
    variant: "markdown_strict",
    flag: "backtick_code_blocks",
    source: "```\ncode\n```",
    selector: "pre",
    count: 0,
    checked: false,
  },
  {
    variant: "markdown_phpextra",
    flag: "fenced_code_blocks",
    source: "~~~\ncode\n~~~",
    selector: "pre",
    count: 1,
    checked: true,
  },
  {
    variant: "markdown_mmd",
    flag: "backtick_code_blocks",
    source: "```\ncode\n```",
    selector: "pre",
    count: 1,
    checked: true,
  },
  {
    variant: "markdown_github",
    flag: "lists_without_preceding_blankline",
    source: "text\n- item",
    selector: "ul",
    count: 1,
    checked: true,
  },
  {
    variant: "commonmark_x",
    flag: "fenced_divs",
    source: "::: {.note}\nBody\n:::",
    selector: ".pm-fenced-div",
    count: 1,
    checked: true,
  },
];

for (const sample of cases)
  test(`${sample.variant}: native parsing, extension reset, editing and persistence`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [],
      pandoc: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/markdown/**", (route) => {
      pandoc.push(route.request().url());
      return route.abort();
    });
    const body = sample.source + "\n\n3. First\n4. Second\n5. Third\n\nTail";
    const response = await request.post("/api/pages", {
      data: {
        title: sample.variant,
        body,
        bodyFormat: "markdown",
        syntax: {
          version: 1,
          variant: sample.variant,
          extensions: { future_flag: true },
        },
      },
    });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(
      (id) => localStorage.setItem("notdown-page", id),
      note.id,
    );
    await page.goto("/");
    await expect(page.locator(".pm-document")).toBeVisible();
    await expect(page.locator(".pm-document ol > li")).toHaveCount(3);
    await page.locator('.editing-modes [data-mode="split"]').click();
    const variants = page.getByLabel("Markdown dialect", { exact: true });
    await expect(variants.locator("option")).toHaveCount(14);
    await expect(variants.locator("option:disabled")).toHaveCount(0);
    await expect(page.locator(".pm-document " + sample.selector)).toHaveCount(
      sample.count,
    );
    await page.locator(".syntax-options summary").click();
    const flag = page.locator(`[data-extension="${sample.flag}"]`);
    await expect(flag).toBeChecked({ checked: sample.checked });
    await flag.setChecked(!sample.checked);
    await expect(page.locator(".pm-document " + sample.selector)).toHaveCount(
      1 - sample.count,
    );
    await expectSource(page, body);
    await expect(page.locator(".pending-extensions")).toHaveCount(0);
    await page.locator("[data-reset-extensions]").click();
    await expect(flag).toBeChecked({ checked: sample.checked });
    await expect(page.locator(".pm-document " + sample.selector)).toHaveCount(
      sample.count,
    );
    await page.locator(".syntax-options summary").click();
    await page
      .locator(".pm-document p")
      .filter({ hasText: /^Tail$/ })
      .click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    await expectSource(page, body + " edited");
    await page.keyboard.press("Control+s");
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/pages/${note.id}`)).json()).body,
      )
      .toBe(body + " edited");
    await page.reload();
    await expect(variants).toHaveValue(sample.variant);
    await expect(page.locator(".pm-document " + sample.selector)).toHaveCount(
      sample.count,
    );
    await expect(page.locator(".pm-document")).toContainText("Tail edited");
    const saved = await (await request.get(`/api/pages/${note.id}`)).json();
    expect(saved.syntax.extensions).toEqual({ future_flag: true });
    // Changing presets reinterprets the exact source, including the edited block gaps.
    await variants.selectOption(
      sample.variant === "commonmark_x" ? "markdown_strict" : "commonmark_x",
    );
    await expectSource(page, body + " edited");
    await variants.selectOption(sample.variant);
    await expect(page.locator(".pm-document " + sample.selector)).toHaveCount(
      sample.count,
    );
    expect(pandoc).toEqual([]);
    expect(errors).toEqual([]);
  });
