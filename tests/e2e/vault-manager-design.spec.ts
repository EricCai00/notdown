import { test, expect } from "@playwright/test";
test("shared vault picker reveals forms and stays usable on narrow screens", async ({ page }) => {
  await page.goto('/'); await page.locator('.workspace-switch').click();
  const dialog = page.locator('.vault-manager-dialog');
  await expect(dialog.locator('[aria-current="true"]')).toBeDisabled();
  await expect(dialog.locator('[data-vault-create]')).toBeHidden();
  await dialog.locator('[data-create-panel] > summary').click();
  await dialog.locator('[data-vault-create] input[name="name"]').fill('Research');
  await expect(dialog.locator('[data-preview]')).toContainText('Research');
  await expect(dialog.locator('[data-vault-create] input[name="path"]')).toBeHidden();
  await page.screenshot({path:'.run/logs/vault-unified-web.png'});
  await page.setViewportSize({width:390,height:844});
  await dialog.locator('[data-open-panel] > summary').click();
  await expect(dialog.locator('[data-vault-create]')).toBeHidden();
  await dialog.locator('[data-vault-open] input').fill('C:\\Notes');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'.run/logs/vault-unified-narrow.png'});
});
