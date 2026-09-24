import { test, expect } from "@playwright/test";

test("conflicts and edited merge results show focused red/green differences without changing source", async ({
  page,
  request,
}, testInfo) => {
  const prefix = Array.from(
    { length: 20 },
    (_, i) => `Unchanged introduction ${i}\n`,
  ).join("");
  const suffix = Array.from(
    { length: 20 },
    (_, i) => `Unchanged ending ${i}\n`,
  ).join("");
  const diskBody = `${prefix}Disk version\n${suffix}`;
  const proposedBody = `${prefix}Local version\n${suffix}`;
  const note = await (
    await request.post("/api/pages", {
      data: { title: "Focused conflict diff", body: diskBody },
    })
  ).json();
  const conflictResponse = await request.put(`/api/pages/${note.id}`, {
    data: { baseRevision: "0".repeat(64), body: proposedBody },
  });
  expect(conflictResponse.status()).toBe(409);
  await page.goto(`/#page/${note.id}`);
  await page
    .getByRole("button", { name: "Conflicts and versions", exact: true })
    .click();
  await page
    .locator(".conflict-list > div")
    .filter({ hasText: "Focused conflict diff" })
    .getByRole("button", { name: "Review and merge" })
    .click();
  const comparison = page.locator("[data-conflict-diff]");
  const merged = page.locator("[data-merged-diff]");
  await expect(comparison.locator(".diff-removed")).toHaveText(/Disk version/);
  await expect(comparison.locator(".diff-added")).toHaveText(/Local version/);
  await expect(comparison.locator(".diff-removed")).toHaveCSS(
    "background-color",
    "rgb(255, 235, 233)",
  );
  await expect(comparison.locator(".diff-added")).toHaveCSS(
    "background-color",
    "rgb(218, 251, 225)",
  );
  await expect(
    comparison
      .locator(".diff-context")
      .filter({ hasText: "Unchanged introduction 0" }),
  ).not.toBeVisible();
  await comparison.locator("summary").first().click();
  await expect(
    comparison
      .locator(".diff-context")
      .filter({ hasText: "Unchanged introduction 0" }),
  ).toBeVisible();
  await comparison.locator("summary").first().click();
  await expect(merged.locator(".diff-added")).toContainText("Local version");
  await page.screenshot({ path: testInfo.outputPath("conflict-diff.png") });
  await page.locator(".conflict-source summary").click();
  const mergedBody = `${prefix}Merged version\n${suffix}`;
  await page.locator("#merged-body").fill(mergedBody);
  await expect(merged.locator(".diff-added")).toContainText("Merged version");
  await expect(merged.locator(".diff-removed")).toContainText("Disk version");
  await expect(comparison.locator(".diff-added")).toContainText(
    "Local version",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("#dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("conflict-diff-mobile.png"),
  });
  // A second external update must preserve the manually merged draft as a new conflict.
  await request.put(`/api/pages/${note.id}`, {
    data: {
      baseRevision: note.revision,
      body: `${prefix}New disk version\n${suffix}`,
    },
  });
  await page
    .getByRole("button", { name: "Save merged version", exact: true })
    .click();
  await expect(comparison.locator(".diff-removed")).toContainText(
    "New disk version",
  );
  await expect(merged.locator(".diff-added")).toContainText("Merged version");
  await page
    .getByRole("button", { name: "Save merged version", exact: true })
    .click();
  await expect(page.locator("#dialog")).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(
    mergedBody,
  );
});
