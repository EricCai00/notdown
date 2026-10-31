import { expect, type Page } from "@playwright/test";
export async function selectWikiView(page: Page, name: string) {
  await page.locator('.wiki-view-trigger').click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
  if (name === 'Home') await expect(page.locator('.pm-document').first()).toBeVisible();
  else await expect(page.locator('.wiki-view-trigger')).toHaveText(name);
}
