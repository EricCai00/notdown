import { expect, type Locator, type Page } from "@playwright/test";

export async function openBlockProperties(page: Page, block: Locator) {
  await block.scrollIntoViewIfNeeded();
  await block.hover({ position: { x: 4, y: 4 } });
  const handle = page.locator(".pm-block-handle");
  await expect(handle).toHaveClass(/visible/);
  await handle.click();
  await page.getByRole("menuitem", { name: "Properties…", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.locator(".pm-block-property-fields") });
  await expect(dialog).toBeVisible();
  return dialog;
}
