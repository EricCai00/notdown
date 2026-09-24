import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';

export const sources = {
  commonmark: 'https://spec.commonmark.org/0.31.2/',
  'commonmark-tests': 'https://spec.commonmark.org/0.31.2/spec.json',
  'gfm-spec': 'https://github.github.com/gfm/',
  'gfm-tests': 'https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt',
  'github-basic': 'https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax',
  'github-tables': 'https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables',
  'github-code': 'https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks',
  'github-math': 'https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions',
  'github-diagrams': 'https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams',
  'github-collapse': 'https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections',
  original: 'https://daringfireball.net/projects/markdown/syntax',
  phpextra: 'https://michelf.ca/projects/php-markdown/extra/',
  mmd: 'https://fletcher.github.io/MultiMarkdown-6/syntax/',
  pandoc: 'https://pandoc.org/MANUAL.html',
  'pandoc-pinned': 'https://raw.githubusercontent.com/jgm/pandoc/3.11/MANUAL.txt',
  typora: 'https://support.typora.io/Markdown-Reference/',
  'typora-diagrams': 'https://support.typora.io/Draw-Diagrams-With-Markdown/',
  'typora-export': 'https://support.typora.io/Export/',
  notion: 'https://developers.notion.com/guides/data-apis/enhanced-markdown',
  'notion-api': 'https://developers.notion.com/guides/data-apis/working-with-markdown-content',
};
for (const name of ['Obsidian Flavored Markdown', 'Basic formatting syntax', 'Advanced formatting syntax', 'Callouts', 'Embed files', 'Internal links', 'HTML content', 'Properties']) {
  const folder = ['Embed files', 'Internal links'].includes(name) ? 'Linking notes and files' : name === 'Properties' ? 'Editing and formatting' : 'Editing and formatting';
  sources['obsidian-' + name.toLowerCase().replaceAll(' ', '-')] = `https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/${encodeURIComponent(folder)}/${encodeURIComponent(name)}.md`;
}
const dir = '.run/dialect-audit/sources';
const mirrors = {
 typora:'_posts/basic/2016-01-01-Markdown Reference.md',
 'typora-diagrams':'_posts/basic/2022-09-05-Draw Diagrams With Markdown.md',
 'typora-export':'_posts/basic/2021-04-20-Export.md',
};
await mkdir(dir, { recursive: true });
const manifest = await Promise.all(Object.entries(sources).map(async ([id, url]) => {
  let source;
  try { source = await readFile(`${dir}/${id}.source`, 'utf8'); } catch {}
  if (!source) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) return { id, url, error: `${response.status} ${response.statusText}` };
      source = await response.text();
    } catch (error) {
      if (!mirrors[id]) return { id, url, error: String(error) };
      const mirror='https://raw.githubusercontent.com/typora/support.typora.io/gh-pages/'+encodeURI(mirrors[id]);
      const response=await fetch(mirror);
      if(!response.ok)return {id,url,error:`Mirror: ${response.status}`};
      source=await response.text();
    }
  }
  await writeFile(`${dir}/${id}.source`, source);
  const headings = [];
  function text(node) { return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(''); }
  function walk(node) {
    if (/^h[1-6]$/.test(node.tagName)) headings.push(text(node));
    if (['script', 'style', 'nav'].includes(node.tagName)) return '';
    if (node.nodeName === '#text') return node.value;
    return (node.childNodes || []).map(walk).join('') + (/^(p|pre|div|li|h[1-6])$/.test(node.tagName) ? '\n' : '');
  }
  const plain = source.includes('<!DOCTYPE') || source.includes('<html') ? walk(parse(source)) : source;
  await writeFile(`${dir}/${id}.txt`, plain);
  return { id, url, retrievedFrom:mirrors[id]&&source.startsWith('---')?'https://raw.githubusercontent.com/typora/support.typora.io/gh-pages/'+encodeURI(mirrors[id]):url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(source), headings };
}));
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(manifest.map(({ id, bytes, error, headings }) => ({ id, bytes, error, headings: headings?.length })));
