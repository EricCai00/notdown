import { expect, test } from "@playwright/test";

test("Notdown migrates legacy browser state once without replacing newer values", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("yejian-session", "legacy-window");
    localStorage.setItem("yejian-color", "on");
    localStorage.setItem("notdown-color", "off");
    localStorage.setItem("yejian-toc", "pinned");
    localStorage.setItem("yejian-draft:example:legacy-window", '{"body":"unsaved text"}');
  });
  await page.reload();
  await expect(page).toHaveTitle(/Notdown/);
  await expect(page.locator(".workspace-switch")).toContainText("Notdown");
  const state = await page.evaluate(() => ({
    session: sessionStorage.getItem("notdown-session"),
    color: localStorage.getItem("notdown-color"),
    toc: localStorage.getItem("notdown-toc"),
    draft: localStorage.getItem("notdown-draft:example:legacy-window"),
  }));
  expect(state).toEqual({
    session: "legacy-window", color: "off", toc: "pinned",
    draft: '{"body":"unsaved text"}',
  });
  await page.evaluate(() => localStorage.removeItem("notdown-draft:example:legacy-window"));
  await page.reload();
  await expect(page.locator(".workspace-switch")).toContainText("Notdown");
  expect(await page.evaluate(() => localStorage.getItem("notdown-draft:example:legacy-window"))).toBeNull();
});
