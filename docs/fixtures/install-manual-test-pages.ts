/** Explicit API import. Uses the running createVault queue; never writes page files directly. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { buildManualPages, auditManualPages, type Resources, type Specimen } from './manual-test-pages';

export const suiteId = 'content-acceptance-2026-09-22';
type Page = { id: string; title: string; parent: string | null; body: string; revision: string; properties: Record<string, unknown> };
export function apiClient(base: string) {
  return async function api<T = any>(route: string, data?: unknown, method = 'POST'): Promise<T> {
    const response = await fetch(base + '/api' + route, data === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${result.error}`);
    return result;
  };
}
export async function fixtureAssets() {
  const image = await readFile(new URL('./typora-comparison-image.png', import.meta.url));
  const audio = Buffer.alloc(44 + 8000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28);
  audio.writeUInt16LE(1, 32); audio.writeUInt16LE(8, 34); audio.write('data', 36); audio.writeUInt32LE(8000, 40);
  for (let i = 0; i < 8000; i++) audio[44+i] = Math.round(128 + 16 * Math.sin(i * 2 * Math.PI * 440 / 8000));
  const stream = 'BT /F1 20 Tf 50 760 Td (Notdown local PDF fixture) Tj 0 -32 Td (One page. Text and captions must survive.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let video: Buffer;
  try {
    const page = await browser.newPage();
    const base64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d')!, stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
      const finished = new Promise<Blob>(resolve => recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })));
      recorder.start();
      for (let i = 0; i < 12; i++) {
        context.fillStyle = i % 2 ? '#dae8d7' : '#c9dcf0'; context.fillRect(0,0,320,180);
        context.fillStyle = '#253325'; context.font = '20px sans-serif'; context.fillText('Notdown test video', 35,85); context.fillText(String(i+1), 150,125);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      recorder.stop(); const blob = await finished; stream.getTracks().forEach(t => t.stop());
      const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    video = Buffer.from(base64, 'base64'); if (video.length < 100) throw new Error('Video fixture recording failed');
  } finally { await browser.close(); }
  return [
    { key: 'image', name: 'acceptance-image.png', type: 'image/png', bytes: image },
    { key: 'audio', name: 'acceptance-tone.wav', type: 'audio/wav', bytes: audio },
    { key: 'video', name: 'acceptance-video.webm', type: 'video/webm', bytes: video },
    { key: 'pdf', name: 'acceptance-document.pdf', type: 'application/pdf', bytes: Buffer.from(pdf) },
    { key: 'text', name: 'acceptance-included.txt', type: 'text/plain', bytes: Buffer.from('Local fixture text.\n\nThis paragraph comes from a separate attachment.\n中文附件内容。\n') },
    { key: 'bibliography', name: 'acceptance-bibliography.txt', type: 'text/plain', bytes: Buffer.from('@book{fixture, author={Example, Alice}, title={Local Citation Fixture}, year={2026}, publisher={Notdown Tests}}\n') },
  ];
}

export async function installManualPages(api: ReturnType<typeof apiClient>, parentId: string) {
  const parent = await api<Page>('/pages/' + parentId);
  const existing = (await api<Page[]>('/pages')).filter(p => p.parent === parentId && p.properties?.acceptanceSuite === suiteId);
  if (existing.length) throw new Error('This suite already has pages under the selected parent. Refusing to duplicate or overwrite manual test results.');
  const resources = { target: parentId } as Resources;
  for (const asset of await fixtureAssets()) resources[asset.key as keyof Resources] = (await api('/assets', { name: asset.name, contentType: asset.type, data: asset.bytes.toString('base64') })).path;
  const properties = (key: string) => ({ acceptanceSuite: suiteId, specimen: key, manualResult: 'Not run' });
  const target = await api<Page>('/pages', { title: '90 · Fixture target & synced source', parent: parentId, icon: 'file-text', bodyFormat: 'notion-markdown', syntax: { version: 1, variant: 'notion-markdown', extensions: {} }, properties: properties('target'), body: '# Fixture target\n\n测试页中的页面链接均指向这里；不是待创建的缺失页面。\n\n## Anchor target\n\n<synced_block id="acceptance-source">\nEditable source content for manual refresh and CAS testing.\n</synced_block>\n\n此页也是 Tests 的直接子页面。正文引用不会改变其 parent。\n' });
  resources.target = target.id;
  const specimens = buildManualPages(resources), audit = auditManualPages(specimens);
  const created: { page: Page; specimen?: Specimen }[] = [];
  let childCount = 0;
  for (const specimen of specimens) {
    let page = await api<Page>('/pages', { title: specimen.title, parent: parentId, icon: 'file-text', bodyFormat: ['notion-markdown', 'notdown'].includes(specimen.syntax.variant) ? 'notion-markdown' : 'markdown', syntax: specimen.syntax, properties: properties(specimen.key), body: specimen.body });
    if (specimen.childTarget) {
      const placeholder = specimen.childTarget;
      const child = await api<Page>('/pages', { title: 'Fixture child', parent: page.id, body: 'This page belongs to its dialect specimen.', properties: properties(specimen.key + '-child') });
      // These are freshly generated fixtures, including their source examples.
      specimen.body = specimen.body.replaceAll('#page/' + placeholder, '#page/' + child.id);
      specimen.childTarget = child.id;
      page = await api<Page>('/pages/' + page.id, { body: specimen.body, baseRevision: page.revision }, 'PUT');
      childCount++;
    }
    created.push({ page, specimen });
  }
  const indexBody = '# Test guide — Dialects, extensions & objects\n\n' +
    '这组页面是新增验收材料。原有 Typora、Obsidian 及 Notion 页面保持原样；旧 Obsidian 页的配置仍是 Typora，使用下面的新 Obsidian 页测试其默认预设。\n\n' +
    '11 个方言页使用各自默认配置，扩展覆盖为空。扩展页显式设置所测开关；互相冲突的 reader 以及必须位于页首的元数据使用独立页面。共覆盖 103 个已注册扩展；Outside Markdown scope 放在最后，不假装执行。\n\n' +
    '自动检查只证明样例能解析、结构有效、未修改原文可往返，以及浏览器冒烟检查；逐项编辑体验仍按页面内记录框填写。不要把默认未开启误判为未实现。\n\n' +
    '附件均在当前知识库：PNG、合成 WAV、无声 WebM、单页 PDF、引入文本和 BibTeX。没有自动调用外部模型、安排提醒或开启自动同步。转录精度测试请自行替换成语音。\n\n' +
    '## Dialects\n\n' + created.filter(c => c.specimen?.key.startsWith('dialect-')).map(c => `- [${c.page.title}](#page/${c.page.id})`).join('\n') +
    '\n\n## Extensions & local objects\n\n' + created.filter(c => !c.specimen?.key.startsWith('dialect-') && c.specimen?.key !== 'outside').map(c => `- [${c.page.title}](#page/${c.page.id})`).join('\n') +
    `\n\n## Resources\n\n- [Fixture target & synced source](#page/${target.id})\n- [Local text](${resources.text})\n- [PDF](${resources.pdf})\n\n## Outside Markdown scope\n\n` + created.filter(c => c.specimen?.key === 'outside').map(c => `- [${c.page.title}](#page/${c.page.id})`).join('\n') + '\n';
  const index = await api<Page>('/pages', { title: '00 · Test guide — Start here', parent: parentId, icon: 'file-text', bodyFormat: 'markdown', syntax: { version: 1, variant: 'commonmark', extensions: {} }, properties: properties('index'), body: indexBody });
  for (const { page, specimen } of created) {
    const saved = await api<Page>('/pages/' + page.id);
    if (saved.parent !== parentId || saved.body !== specimen!.body) throw new Error('Saved specimen mismatch: ' + page.id);
  }
  // Creation should not modify the existing parent or reference material.
  if ((await api<Page>('/pages/' + parentId)).revision !== parent.revision) throw new Error('Parent changed during import; inspect it before editing.');
  return { parent: parentId, index: index.id, target: target.id, resources, audit, pages: created.map(c => ({ id: c.page.id, key: c.specimen!.key, title: c.page.title })), count: created.length + childCount + 2 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, parentId, expectedVault] = process.argv.slice(2);
  if (!base || !parentId || !expectedVault || !['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('Usage: node --import tsx docs/fixtures/install-manual-test-pages.ts LOCAL_BASE_URL PARENT_ID EXPECTED_VAULT_PATH');
  const api = apiClient(base), status = await api('/status');
  if (path.resolve(status.vaultPath).toLowerCase() !== path.resolve(expectedVault).toLowerCase()) throw new Error('Wrong vault; no pages were created');
  const manifest = await installManualPages(api, parentId);
  await mkdir('test-results', { recursive: true }); await writeFile('test-results/manual-pages-installed.json', JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ count: manifest.count, index: manifest.index, dialects: manifest.audit.dialects, extensions: manifest.audit.extensions }, null, 2));
}
