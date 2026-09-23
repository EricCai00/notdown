import { test, expect } from "@playwright/test";

async function paste(page: import("@playwright/test").Page, url: string) {
  await page.locator(".pm-document").evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, url);
}
test("paste link, mention and preview: inline placement, keyboard menu, undo and Markdown reopen", async ({
  page,
  request,
}) => {
  const note = await (
    await request.post("/api/pages", {
      data: {
        title: "Link preview paste",
        body: "Before ",
        syntax: { version: 1, variant: "notdown", extensions: {} },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.route("**/api/link-previews/resolve", (route) =>
    route.fulfill({
      json: {
        provider: "github",
        title: "Improve caching",
        state: "Open",
        kind: "pull",
        number: "42",
        author: "eric",
        repository: "acme/repo",
        url: "https://github.com/acme/repo/pull/42",
      },
    }),
  );
  await page.goto("/");
  const editor = page.locator(".pm-document");
  await editor.locator("p").first().click();
  await page.keyboard.press("End");
  await paste(page, "https://github.com/acme/repo/pull/42");
  await expect(page.getByRole("menu", { name: "Paste link as" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(editor.locator(".pm-link-mention")).toContainText(
    "Improve caching",
  );
  await page.keyboard.type(" after");
  await expect(editor.locator("p").first()).toContainText("Before");
  await expect(editor.locator("p").first()).toContainText("after");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await paste(page, "https://github.com/acme/repo/pull/42");
  await page.getByRole("menuitem", { name: "Preview", exact: true }).click();
  await expect(editor.locator(".pm-link-preview")).toContainText("Open");
  await expect(editor.locator(".pm-link-preview")).toContainText(
    "#42 · acme/repo · eric",
  );
  await page.keyboard.press("Control+z");
  await expect(editor.locator(".pm-link-preview")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(editor.locator(".pm-link-preview")).toHaveCount(1);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("<mention-link");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json())
    .body;
  expect(saved).toContain("<link-preview");
  expect(saved).not.toContain("Improve caching");
  await page.reload();
  await expect(editor.locator(".pm-link-mention")).toContainText(
    "Improve caching",
  );
  await expect(editor.locator(".pm-link-preview")).toContainText(
    "Improve caching",
  );
  await page.screenshot({
    path: "test-results/link-preview-github.png",
    fullPage: true,
  });
});
test("OneDrive preview and code, errors, refresh, settings and no background document writes", async ({
  page,
  request,
}) => {
  const body =
    '<link-preview url="https://1drv.ms/w/s!file" title="Project document"/>\n\n<link-preview url="https://github.com/acme/repo/blob/main/a.ts#L2-L3"/>\n\nDraft text';
  const note = await (
    await request.post("/api/pages", {
      data: {
        title: "Provider previews",
        body,
        syntax: { version: 1, variant: "notdown", extensions: {} },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  let connected = false;
  await page.route("**/api/link-previews/resolve", (route) => {
    const url = route.request().postDataJSON().url;
    return url.includes("1drv.ms")
      ? connected
        ? route.fulfill({
            json: {
              provider: "onedrive",
              title: "Project.docx",
              kind: "file",
              size: 10240,
              updated: "2026-09-22",
              url,
              image: "https://preview.example/image.svg",
            },
          })
        : route.fulfill({
            status: 401,
            json: {
              error:
                "Connect OneDrive in Settings → Link previews to view this file.",
            },
          })
      : route.fulfill({
          json: {
            provider: "github",
            title: "a.ts",
            kind: "code",
            start: 2,
            code: "const x = '<script>';\nreturn x;",
            repository: "acme/repo",
            url,
          },
        });
  });
  await page.route("https://preview.example/image.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="360"><rect width="700" height="360" fill="#f8f7f3"/><rect x="180" y="20" width="340" height="320" fill="white"/><text x="220" y="80" font-size="24">Project plan</text><path d="M220 120h250m-250 30h200m-200 30h230m-230 30h210" stroke="#ddd" stroke-width="8"/></svg>',
    }),
  );
  await page.goto("/");
  const drive = page.locator(".pm-preview-onedrive");
  await expect(drive).toContainText("Connect OneDrive");
  await expect(page.locator(".pm-preview-code")).toContainText("<script>");
  expect(await page.locator(".pm-preview-code script").count()).toBe(0);
  await page.getByLabel("Page options").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("OneDrive token", { exact: true })
    .fill("test-graph-token");
  connected = true;
  await page
    .getByRole("button", { name: "Connect OneDrive", exact: true })
    .click();
  await expect(page.locator(".link-connection-settings")).toContainText(
    "Token saved locally",
  );
  expect(
    JSON.stringify(
      await (await request.get("/api/link-previews/settings")).json(),
    ),
  ).not.toContain("test-graph-token");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(drive).toContainText("Project.docx");
  await expect(drive.locator("img")).toBeVisible();
  await drive.hover();
  await drive.getByRole("button", { name: "Expand preview" }).click();
  await expect(
    page.getByRole("dialog", { name: "Link preview", exact: true }),
  ).toContainText("Project.docx");
  await page.route("**/api/link-previews/viewer", (route) =>
    route.fulfill({
      json: { url: "https://word-view.officeapps.live.com/test-viewer" },
    }),
  );
  await page.route(
    "https://word-view.officeapps.live.com/test-viewer",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Document viewer</p>",
      }),
  );
  await page
    .getByRole("button", { name: "View document", exact: true })
    .click();
  await expect(page.locator(".pm-preview-document")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".pm-document > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await drive.hover();
  await drive.getByRole("button", { name: "Refresh preview" }).click();
  await expect(page.locator(".pm-document")).toContainText("Draft text edited");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("Draft text edited");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json())
    .body;
  expect(saved).not.toContain("Project.docx");
  expect(saved).not.toContain("test-graph-token");
  await page.screenshot({
    path: "test-results/link-preview-onedrive.png",
    fullPage: true,
  });
});
test("disabled extensions keep ordinary paste behavior", async ({
  page,
  request,
}) => {
  const note = await (
    await request.post("/api/pages", {
      data: {
        title: "No link preview extension",
        body: "plain",
        syntax: { version: 1, variant: "commonmark", extensions: {} },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  await page.locator(".pm-document p").click();
  await page.keyboard.press("End");
  await paste(page, "https://github.com/acme/repo/pull/42");
  await expect(page.getByRole("menu", { name: "Paste link as" })).toBeHidden();
  await expect(page.locator(".pm-link-preview,.pm-link-mention")).toHaveCount(
    0,
  );
});

test("code blocks keep URL paste literal with preview extension enabled", async ({ page, request }) => {
  const codeNote = await (
    await request.post("/api/pages", {
      data: {
        title: "Code link paste",
        body: "```text\nliteral\n```",
        syntax: { version: 1, variant: "notdown", extensions: {} },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    codeNote.id,
  );
  await page.goto("/");
  await page.locator(".pm-document pre code").click();
  await page.keyboard.press("End");
  await paste(page, "https://github.com/acme/repo/pull/42");
  await expect(page.getByRole("menu", { name: "Paste link as" })).toBeHidden();
  await expect(page.locator(".pm-document pre code")).toContainText(
    "https://github.com/acme/repo/pull/42",
  );
});

test("editing mentions and replacing a pending preview never applies a stale response", async ({
  page,
  request,
}) => {
  const note = await (
    await request.post("/api/pages", {
      data: {
        title: "Preview races",
        body: 'Before <mention-link url="https://github.com/acme/repo/issues/1" custom="keep">Original</mention-link> after.\n\n<link-preview url="https://github.com/acme/repo/issues/1" custom="keep"/>',
        syntax: { version: 1, variant: "notdown", extensions: {} },
      },
    })
  ).json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  let release!: () => void, received!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (received = r));
  await page.route("**/api/link-previews/resolve", async (route) => {
    const url = route.request().postDataJSON().url;
    if (url.endsWith("/1")) {
      received();
      await wait;
    }
    await route.fulfill({
      json: {
        provider: "github",
        title: url.endsWith("/1") ? "Stale title" : "Current title",
        kind: "issue",
        state: "Open",
        url,
      },
    });
  });
  await page.goto("/");
  await started;
  const preview = page.locator(".pm-link-preview");
  await preview.hover();
  await preview.getByRole("button", { name: "Edit link preview" }).click();
  const properties = page.locator(".pm-block-properties-dialog");
  await properties
    .getByLabel("URL", { exact: true })
    .fill("https://github.com/acme/repo/issues/2");
  await properties.getByRole("button", { name: "Save", exact: true }).click();
  await expect(preview).toContainText("Current title");
  release();
  await expect(page.locator(".pm-link-mention")).toContainText("Stale title");
  await expect(preview).not.toContainText("Stale title");
  await page.locator(".pm-link-mention-label").click();
  await page.getByRole("button", { name: "Edit mention", exact: true }).click();
  await properties.getByLabel("Label", { exact: true }).fill("Fallback edited");
  await properties
    .getByLabel("URL", { exact: true })
    .fill("https://github.com/acme/repo/issues/2");
  await properties.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".pm-link-mention")).toContainText("Current title");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("Fallback edited");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json())
    .body;
  expect(saved.match(/custom="keep"/g)).toHaveLength(2);
  expect(saved).not.toContain("Stale title");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    preview.getByRole("button", { name: "Edit link preview" }),
  ).toBeVisible();
  expect(
    await preview.evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: "test-results/link-preview-narrow.png",
    fullPage: true,
  });
});
