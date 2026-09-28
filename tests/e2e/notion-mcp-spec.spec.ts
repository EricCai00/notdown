import { expect, test } from '@playwright/test';

for (const variant of ['notdown', 'notion-markdown']) {
  test(`${variant}: official MCP containers edit and reopen with their own syntax`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://example.com/mcp.html', route => route.fulfill({ contentType: 'text/html', body: '<h1>Sandbox attachment</h1>' }));
    const body = '<tabs>\n\t<tab icon="📄">\n\t\tFirst\n\t\tTab body\n\t</tab>\n\t<tab>\n\t\tSecond\n\t\tSecond body\n\t</tab>\n</tabs>\n\n<meeting-notes>\n\tWeekly meeting\n\t<summary>\n\t\tSummary\n\t</summary>\n\t<notes>\n\t\tManual notes\n\t</notes>\n\t<transcript>\n\t\tOriginal transcript\n\t</transcript>\n</meeting-notes>\n\n<embed src="https://example.com/mcp.html" color="blue">Caption</embed>\n\n<folder url="{{1}}">Folder reference</folder>\n\n<database data-source-url="collection://x" wiki="true">Wiki reference</database>\n\nMCP $`x^2`$ REST $y+1$ `first<br>second`\n\nTail';
    const response = await request.post('/api/pages', { data: { title: 'MCP syntax', body, bodyFormat: 'notion-markdown', syntax: { version: 1, variant, extensions: {} } } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => { if (window === window.top) localStorage.setItem('notdown-page', id); }, note.id);
    await page.goto('/');
    const editor = page.locator('.pm-document');
    await expect(editor.getByRole('tab', { name: 'First', exact: true })).toBeVisible();
    await editor.getByRole('tab', { name: 'Second', exact: true }).click();
    await page.keyboard.press('Control+s');
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
    await editor.getByRole('tab', { name: 'First', exact: true }).click();
    await editor.getByRole('tab', { name: 'First', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.getByRole('textbox', { name: 'Tab title' }).fill('Renamed');
    await page.getByRole('dialog', { name: 'Rename tab' }).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByRole('tab', { name: 'Renamed', exact: true })).toBeVisible();
    await expect(editor.locator('.pm-meeting-section')).toHaveCount(3);
    await expect(editor.locator('.pm-object-meeting_notes h3')).toHaveText('Weekly meeting');
    await expect(editor.getByRole('button', { name: 'Transcribe', exact: true })).toHaveCount(0);
    await expect(editor.locator('.pm-embed iframe')).toHaveAttribute('sandbox', '');
    await expect(editor.locator('.pm-notion-folder')).toHaveText('Folder reference');
    await expect(editor.locator('.pm-notion-database')).toHaveText('Wiki reference');
    const notes = editor.locator('.pm-meeting-section[data-section="notes"] p');
    await notes.click(); await page.keyboard.press('End'); await page.keyboard.type(' edited');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('Manual notes edited');
    const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
    expect(saved).toContain('\t\tRenamed\n');
    expect(saved).not.toContain('title="Renamed"');
    expect(saved).toContain('<transcript>\n\t\tOriginal transcript\n\t</transcript>');
    expect(saved).toContain('$`x^2`$ REST $y+1$');
    await page.reload();
    await expect(editor.getByRole('tab', { name: 'Renamed', exact: true })).toBeVisible();
    await expect(notes).toHaveText('Manual notes edited');
    await expect(editor.locator('.pm-meeting-section[data-section="transcript"] p')).toHaveText('Original transcript');
    expect(errors).toEqual([]);
  });
}
