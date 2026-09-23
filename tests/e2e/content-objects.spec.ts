import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function create(request: APIRequestContext) {
  const response = await request.post("/api/pages", {
    data: {
      title: "Content object revision regression",
      body: "> [!NOTE]\n> Original\n\n[toc]\n\n## Original heading",
      bodyFormat: "markdown",
      syntax: { version: 1, variant: "typora", extensions: { alerts: true } },
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function open(page: Page, id: string) {
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    id,
  );
  await page.goto("/");
  await expect(page.locator(".pm-callout")).toBeVisible();
}
async function append(page: Page, text: string) {
  await page.locator(".pm-callout p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("external refresh replaces both the merged object DOM and its save revision", async ({
  page,
  request,
}) => {
  const note = await create(request);
  await open(page, note.id);
  const body = "> [!TIP]\n> Remote\n\n[toc]\n\n## Remote heading";
  const response = await request.put(`/api/pages/${note.id}`, {
    data: { ...note, body, baseRevision: note.revision },
  });
  expect(response.status()).toBe(200);
  const remote = await response.json();
  await expect(page.locator(".pm-callout p")).toHaveText("Remote", {
    timeout: 9000,
  });
  await expect(page.locator(".pm-toc button")).toHaveText("Remote heading");
  const pending = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith(`/api/pages/${note.id}`),
  );
  await append(page, " locally");
  await page.keyboard.press("Control+s");
  const payload = (await pending).postDataJSON();
  expect(payload.baseRevision).toBe(remote.revision);
  expect(payload.body).toContain("Remote locally");
  expect(payload.body).not.toContain("Original");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("Remote locally");
});

test("local input during an external refresh keeps its original revision and preserves both versions", async ({
  page,
  request,
}) => {
  const note = await create(request);
  await open(page, note.id);
  let refreshReceived!: () => void;
  const received = new Promise<void>((resolve) => {
    refreshReceived = resolve;
  });
  let releaseRefresh!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/pages", async (route) => {
    const response = await route.fetch();
    refreshReceived();
    await release;
    await route.fulfill({ response });
  });
  const remoteBody = "> [!WARNING]\n> Disk update\n\n[toc]\n\n## Disk heading";
  await request.put(`/api/pages/${note.id}`, {
    data: { ...note, body: remoteBody, baseRevision: note.revision },
  });
  await received;
  const pending = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith(`/api/pages/${note.id}`),
  );
  await append(page, " local pending");
  releaseRefresh();
  await page.keyboard.press("Control+s");
  const payload = (await pending).postDataJSON();
  expect(payload.baseRevision).toBe(note.revision);
  expect(payload.body).toContain("Original local pending");
  await expect(
    page.getByRole("heading", {
      name: "Two versions detected; both have been preserved",
    }),
  ).toBeVisible();
  await expect(page.locator(".conflict-columns")).toContainText("Disk update");
  await expect(page.locator(".conflict-columns")).toContainText(
    "Original local pending",
  );
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(
    remoteBody,
  );
  const conflicts = await (await request.get("/api/conflicts")).json();
  expect(
    conflicts.some((c: any) =>
      c.proposed?.body?.includes("Original local pending"),
    ),
  ).toBe(true);
});

test("two windows retain independent callout drafts and stale saves create a conflict", async ({
  page,
  context,
  request,
}) => {
  const note = await create(request);
  const second = await context.newPage();
  const pattern = `**/api/pages/${note.id}`;
  for (const window of [page, second]) {
    // Simulate an unavailable save endpoint so both local drafts remain recoverable.
    await window.route(pattern, (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            json: { error: "Test save unavailable" },
          })
        : route.continue(),
    );
    await open(window, note.id);
  }
  const sessions = await Promise.all(
    [page, second].map((window) =>
      window.evaluate(() => sessionStorage.getItem("notdown-session")),
    ),
  );
  expect(sessions[0]).not.toBe(sessions[1]);
  await append(page, " Window A");
  await append(second, " Window B");
  const drafts = await page.evaluate(
    ({ id, sessions }) =>
      sessions.map((session) =>
        JSON.parse(localStorage.getItem(`notdown-draft:${id}:${session}`)!),
      ),
    { id: note.id, sessions },
  );
  expect(drafts[0].body).toContain("Window A");
  expect(drafts[0].body).not.toContain("Window B");
  expect(drafts[1].body).toContain("Window B");
  expect(drafts[1].body).not.toContain("Window A");
  await page.reload();
  await second.reload();
  await expect(page.locator(".pm-callout p")).toHaveText("Original Window A");
  await expect(second.locator(".pm-callout p")).toHaveText("Original Window B");
  await page.unroute(pattern);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("Window A");
  await second.unroute(pattern);
  await second.keyboard.press("Control+s");
  await expect(
    second.getByRole("heading", {
      name: "Two versions detected; both have been preserved",
    }),
  ).toBeVisible();
  await expect(second.locator(".conflict-columns")).toContainText("Window A");
  await expect(second.locator(".conflict-columns")).toContainText("Window B");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain("Window A");
  expect(saved.body).not.toContain("Window B");
  await second.close();
});
