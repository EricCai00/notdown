import { test, expect } from "@playwright/test";

test("official Notion editing cannot write supplemental toggle, column, date or table properties", async ({ page, request }) => {
  const body = '<details>\n<summary>Toggle title</summary>\n\tChild\n</details>\n\n<columns>\n\t<column>\n\t\tLeft\n\t</column>\n\t<column>\n\t\tRight\n\t</column>\n</columns>\n\n<mention-date start="2026-09-23" startTime="12:30" timeZone="Asia/Shanghai"/>\n\n<table>\n<tr><td>A</td><td>B</td></tr>\n</table>\n\nTail';
  const response = await request.post('/api/pages', { data: { title: 'Official syntax boundary', body, bodyFormat: 'notion-markdown', syntax: { version: 1, variant: 'notion-markdown', extensions: { notion_tabs: true, notion_button: true } } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await page.locator('.pm-toggle-chevron').click();
  await expect(page.locator('.pm-toggle-chevron')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.pm-column-resizer').first()).toBeVisible();
  await page.locator('.pm-document [data-mention-kind="date"]').dblclick();
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toHaveValue('12:30');
  await expect(page.getByText('Reminder date and time', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.pm-document td').first().click();
  await expect(page.getByRole('button', { name: 'Merge right', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add caption', exact: true })).toBeDisabled();
  const tail = page.locator('.pm-document > p').filter({ hasText: /^Tail$/ });
  await tail.click(); await page.keyboard.press('End'); await page.keyboard.type(' edited');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace(/Tail$/, 'Tail edited'));
  await page.getByRole('combobox', { name: 'Markdown dialect' }).selectOption('notdown');
  await expect(page.locator('.pm-column-resizer').first()).toBeVisible();
  await page.locator('.pm-toggle-chevron').click();
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('open="false"');
});

test("retired figure and legacy directives remain source when another paragraph is edited", async ({ page, request }) => {
  const body = '<figure src="old.png" alt="Alt" caption="Caption"/>\n\n:::nest\nParent\n:::children\nChild\n:::endnest\n\nTail';
  const response = await request.post('/api/pages', { data: { title: 'Recoverable legacy syntax', body, bodyFormat: 'notion-markdown', syntax: { version: 1, variant: 'notdown', extensions: { local_figure: true } } } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator('.pm-document')).toContainText('Caption');
  const tail = page.locator('.pm-document > p').filter({ hasText: /^Tail$/ });
  await tail.click(); await page.keyboard.press('End'); await page.keyboard.type('!');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body + '!');
});
