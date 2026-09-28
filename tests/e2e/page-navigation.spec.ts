import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function create(request: APIRequestContext, title: string, body = 'Original body') {
  const response = await request.post('/api/pages', { data: { title, body } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function visit(page: Page, id: string, title: string) {
  await page.locator(`#page-tree [data-open="${id}"]`).click();
  await expect(page.locator('#page-title')).toHaveValue(title);
  await expect(page).toHaveURL(new RegExp(`#page/${id}$`));
}
async function open(page: Page, id: string) {
  await page.goto(`/#page/${id}`);
  await expect(page.locator('.pm-document')).toBeVisible();
}
async function append(page: Page, text: string) {
  await page.locator('.pm-document > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

test('navigation uses one fresh list snapshot and refreshes changed backlinks', async ({ page, request }) => {
  const a = await create(request, 'Snapshot A');
  const b = await create(request, 'Snapshot B');
  const source = await create(request, 'Backlink source', `[Target](#page/${b.id})`);
  await open(page, a.id);
  const reads: string[] = [];
  page.on('request', req => {
    if (req.method() === 'GET' && new URL(req.url()).pathname.startsWith('/api/pages')) reads.push(new URL(req.url()).pathname);
  });
  await visit(page, b.id, b.title);
  expect(reads).toContain('/api/pages');
  expect(reads).not.toContain(`/api/pages/${b.id}`);
  await expect(page.locator('#backlinks')).toContainText(source.title);
  await visit(page, a.id, a.title);
  expect((await request.put(`/api/pages/${source.id}`, { data: { body: 'Link removed externally', baseRevision: source.revision } })).ok()).toBeTruthy();
  expect((await request.put(`/api/pages/${b.id}`, { data: { body: 'Fresh destination body', baseRevision: b.revision } })).ok()).toBeTruthy();
  await visit(page, b.id, b.title);
  await expect(page.locator('.pm-document')).toContainText('Fresh destination body');
  await expect(page.locator('#backlinks')).toBeEmpty();
});

test('page switches retain unchanged sidebar rows and icons, but refresh changed page metadata', async ({ page, request }) => {
  const a = await create(request, 'Stable sidebar A');
  const b = await create(request, 'Stable sidebar B');
  await open(page, a.id);
  const row = await page.locator(`#page-tree [data-page-row="${a.id}"]`).elementHandle();
  const rowIcon = await page.locator(`#page-tree [data-page-row="${a.id}"] .tree-add svg`).elementHandle();
  const searchIcon = await page.locator('.search-launch svg').elementHandle();
  await visit(page, b.id, b.title);
  expect(await row!.evaluate(el => el.isConnected)).toBe(true);
  expect(await rowIcon!.evaluate(el => el.isConnected)).toBe(true);
  expect(await searchIcon!.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.locator(`#page-tree [data-page-row="${a.id}"]`)).not.toHaveClass(/active/);
  await expect(page.locator(`#page-tree [data-page-row="${b.id}"]`)).toHaveClass(/active/);
  await append(page, ' body edit keeps sidebar');
  await visit(page, a.id, a.title);
  expect(await row!.evaluate(el => el.isConnected)).toBe(true);
  expect(await rowIcon!.evaluate(el => el.isConnected)).toBe(true);
  expect((await request.put(`/api/pages/${b.id}`, { data: { title: 'Renamed sidebar B', baseRevision: (await (await request.get(`/api/pages/${b.id}`)).json()).revision } })).ok()).toBeTruthy();
  await visit(page, b.id, 'Renamed sidebar B');
  expect(await row!.evaluate(el => el.isConnected)).toBe(false);
  await expect(page.locator(`#page-tree [data-open="${b.id}"]`)).toContainText('Renamed sidebar B');
  await expect(page.locator(`#page-tree [data-page-row="${b.id}"] .tree-add svg[data-lucide="plus"]`)).toHaveCount(1);
  expect(await searchIcon!.evaluate(el => el.isConnected)).toBe(true);
});

test('browser and toolbar share page and vault history, including reload and branch truncation', async ({ page, request }) => {
  const a = await create(request, 'History A');
  const c = await create(request, 'History C');
  const b = await create(request, 'History B', `<mention-page url="#page/${c.id}">History C</mention-page>`);
  await open(page, a.id);
  const initialLength = await page.evaluate(() => history.length);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await visit(page, b.id, b.title);
  await visit(page, b.id, b.title);
  expect(await page.evaluate(() => history.length)).toBe(initialLength + 1);
  await page.locator('.pm-document .page-mention').click();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  expect(await page.evaluate(() => history.length)).toBe(initialLength + 2);
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#page-title')).toHaveValue(a.title);
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await page.goForward();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  await page.locator('[data-action="home"]').click();
  await expect(page).toHaveURL(/#vault\/gallery$/);
  const vaultLength = await page.evaluate(() => history.length);
  await page.locator('[data-action="home"]').click();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => history.length)).toBe(vaultLength);
  await page.locator('[data-library-view="graph"]').click();
  await expect(page).toHaveURL(/#vault\/graph$/);
  await page.goBack();
  await expect(page.locator('[data-library-view="gallery"]')).toHaveClass(/selected/);
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  await visit(page, a.id, a.title);
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  await page.evaluate(id => { location.hash = `#page/${id}`; }, b.id);
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();
  await visit(page, a.id, a.title);
  // Two distinct entries may have exactly the same URL.
  await page.evaluate(() => history.go(-4));
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/page-navigation.png' });
});

test('navigation saves input typed while loading and superseded responses cannot replace the chosen page', async ({ page, request }) => {
  const a = await create(request, 'Pending A'), b = await create(request, 'Delayed B'), c = await create(request, 'Latest C');
  await open(page, a.id);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/pages', async route => { await gate; await route.continue(); }, { times: 1 });
  const loading = page.waitForRequest(request => request.url().endsWith('/api/pages') && request.method() === 'GET');
  await page.locator(`#page-tree [data-open="${b.id}"]`).click();
  await loading;
  await append(page, ' typed during navigation');
  await page.locator(`#page-tree [data-open="${c.id}"]`).click();
  release();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  expect((await (await request.get(`/api/pages/${a.id}`)).json()).body).toContain('typed during navigation');
  expect((await (await request.get(`/api/pages/${b.id}`)).json()).body).toBe('Original body');
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(a.title);
  await expect(page.locator('.pm-document')).toContainText('typed during navigation');
});

test('rapid native Back requests keep the final destination and save outgoing input', async ({ page, request }) => {
  const a = await create(request, 'Rapid A'), b = await create(request, 'Rapid B'), c = await create(request, 'Rapid C');
  await open(page, a.id);
  await visit(page, b.id, b.title);
  await visit(page, c.id, c.title);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/pages', async route => { await gate; await route.continue(); }, { times: 1 });
  const loading = page.waitForRequest(request => request.url().endsWith('/api/pages') && request.method() === 'GET');
  await page.evaluate(() => history.back());
  await loading;
  await append(page, ' while going back');
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(new RegExp(`#page/${a.id}$`));
  release();
  await expect(page.locator('#page-title')).toHaveValue(a.title);
  expect((await (await request.get(`/api/pages/${c.id}`)).json()).body).toContain('while going back');
  await page.goForward();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
});

test('Back immediately followed by Forward preserves the current editor and its undo history', async ({ page, request }) => {
  const a = await create(request, 'Return A'), b = await create(request, 'Return B');
  await open(page, a.id);
  await visit(page, b.id, b.title);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/pages', async route => { await gate; await route.continue(); }, { times: 1 });
  const loading = page.waitForRequest(request => request.url().endsWith('/api/pages') && request.method() === 'GET');
  await page.evaluate(() => history.back());
  await loading;
  await append(page, ' keep current input');
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(new RegExp(`#page/${b.id}$`));
  release();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  await expect(page.locator('.pm-document')).toContainText('keep current input');
  expect((await (await request.get(`/api/pages/${b.id}`)).json()).body).toContain('keep current input');
  await page.locator('.pm-document > p').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.pm-document')).not.toContainText('keep current input');
});

test('consecutive hash links keep their real browser positions while requests are pending', async ({ page, request }) => {
  const a = await create(request, 'Hash A'), b = await create(request, 'Hash B'), c = await create(request, 'Hash C');
  await open(page, a.id);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/pages', async route => { await gate; await route.continue(); }, { times: 1 });
  const loading = page.waitForRequest(request => request.url().endsWith('/api/pages') && request.method() === 'GET');
  await page.evaluate(id => { location.hash = `#page/${id}`; }, b.id);
  await loading;
  await page.evaluate(id => { location.hash = `#page/${id}`; }, c.id);
  release();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(a.title);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled();
});

test('failed saving rolls native Back to the current entry without losing drafts or the forward branch', async ({ page, request }) => {
  const a = await create(request, 'Save A'), b = await create(request, 'Save B'), c = await create(request, 'Save C');
  await open(page, a.id);
  await visit(page, b.id, b.title);
  await visit(page, c.id, c.title);
  await page.goBack();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await page.route(`**/api/pages/${b.id}`, route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test save failure' }) }) : route.continue());
  await append(page, ' keep my draft');
  await page.evaluate(() => history.back());
  await expect(page.locator('#save-status')).toContainText('Save failed');
  await expect(page).toHaveURL(new RegExp(`#page/${b.id}$`));
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await expect(page.locator('.pm-document')).toContainText('keep my draft');
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled();
  await page.unroute(`**/api/pages/${b.id}`);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#page-title')).toHaveValue(a.title);
  expect((await (await request.get(`/api/pages/${b.id}`)).json()).body).toContain('keep my draft');
  await page.goForward();
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await page.goForward();
  await expect(page.locator('#page-title')).toHaveValue(c.title);
});

test('conflicts block native Back and preserve both revisions', async ({ page, request }) => {
  const a = await create(request, 'Conflict A'), b = await create(request, 'Conflict B');
  await open(page, a.id);
  await visit(page, b.id, b.title);
  await append(page, ' local draft');
  const changed = await request.put(`/api/pages/${b.id}`, { data: { body: 'External body', baseRevision: b.revision } });
  expect(changed.ok()).toBeTruthy();
  await page.evaluate(() => history.back());
  await expect(page.locator('#save-status')).toContainText('Conflict');
  await expect(page).toHaveURL(new RegExp(`#page/${b.id}$`));
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  expect((await (await request.get(`/api/pages/${b.id}`)).json()).body).toBe('External body');
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('notdown-draft:')).map(key => localStorage.getItem(key)));
  expect(drafts.join(' ')).toContain('local draft');
});

test('missing history destinations do not strand the URL; explicit hash links are recorded once', async ({ page, request }) => {
  const a = await create(request, 'Missing A'), b = await create(request, 'Missing B'), c = await create(request, 'Missing C');
  await open(page, a.id);
  await page.evaluate(id => { location.hash = `#page/${id}`; }, b.id);
  await expect(page.locator('#page-title')).toHaveValue(b.title);
  await visit(page, c.id, c.title);
  expect((await request.put(`/api/pages/${b.id}`, { data: { trashed: true, baseRevision: b.revision } })).ok()).toBeTruthy();
  await page.evaluate(() => history.back());
  await expect(page.locator('.toast')).toContainText('Trash or no longer exists');
  await expect(page).toHaveURL(new RegExp(`#page/${c.id}$`));
  await expect(page.locator('#page-title')).toHaveValue(c.title);
  await page.evaluate(() => history.go(-2));
  await expect(page.locator('#page-title')).toHaveValue(a.title);
});
