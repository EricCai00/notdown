import { test, expect } from "@playwright/test";

test("settings navigation preserves form drafts and keeps the footer visible across sections", async ({ page }) => {
  await page.goto("/");
  await page.locator('#sidebar [data-action="settings"]').click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings", exact: true });
  const nav = dialog.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.getByRole("button")).toHaveText(["Workspace", "Appearance", "Editing", "Sync & history", "Connections", "Advanced"]);
  const done = dialog.getByRole("button", { name: "Done", exact: true });
  const before = await done.boundingBox();
  await nav.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Connections", exact: true })).toHaveAttribute("aria-current", "location");
  const model = dialog.getByRole("textbox", { name: "Text model", exact: true });
  await expect(model).toBeEnabled();
  await model.fill("Unsaved model draft");
  for (const name of ["Appearance", "Editing", "Sync & history", "Advanced", "Workspace", "Connections"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(done).toBeInViewport();
    expect((await done.boundingBox())!.y).toBe(before!.y);
    await expect(dialog.locator(`#${await nav.getByRole("button", { name, exact: true }).getAttribute("aria-controls")} > header h2`)).toBeFocused();
    await page.screenshot({ path: `.run/logs/settings-${name.toLowerCase().replace(/[^a-z]+/g, "-")}.png` });
  }
  await expect(model).toHaveValue("Unsaved model draft");
  await nav.getByRole("button", { name: "Sync & history", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("webdav");
  await expect(dialog.getByLabel("Remote notebook folder", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Publishable key", { exact: true })).toBeHidden();
  await done.click();
  await expect(dialog).toHaveCount(0);
});

test("narrow settings has a horizontal category bar and no overflowing forms", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await page.locator('#sidebar [data-action="settings"]').click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings", exact: true });
  const nav = dialog.getByRole("navigation", { name: "Settings sections" });
  const done = dialog.getByRole("button", { name: "Done", exact: true });
  for (const name of ["Appearance", "Editing", "Sync & history", "Connections", "Advanced"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(done).toBeInViewport();
    const overflow = await dialog.locator(".settings-body").evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `.run/logs/settings-narrow-${name.toLowerCase().replace(/[^a-z]+/g, "-")}.png` });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
