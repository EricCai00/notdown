import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = '.run/dialect-audit/tools';
await mkdir(dir, {recursive:true});
async function get(url, name) {
  const r = await fetch(url, {signal:AbortSignal.timeout(120000)});
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  await writeFile(`${dir}/${name}`, b);
  return b;
}
const releases = await (await fetch('https://downloads.php.net/~windows/releases/releases.json')).json();
const php = releases['8.4']['nts-vs17-x64'].zip;
const bytes = await get('https://downloads.php.net/~windows/releases/' + php.path, 'php.zip');
if (createHash('sha256').update(bytes).digest('hex') !== php.sha256) throw Error('PHP checksum mismatch');
await writeFile(`${dir}/php-release.json`, JSON.stringify({version:releases['8.4'].version,...php},null,2));
await Promise.all([
  get('https://daringfireball.net/projects/downloads/Markdown_1.0.1.zip','markdown.zip'),
  ...['MarkdownInterface.php','Markdown.php','MarkdownExtra.php'].map(name=>get('https://raw.githubusercontent.com/michelf/php-markdown/2.0.0/Michelf/'+name,name)),
]);
await writeFile(`${dir}/package.json`, JSON.stringify({private:true,type:'module',dependencies:{commonmark:'0.31.2'}}));
await writeFile(`${dir}/extra.php`, `<?php
require __DIR__.'/MarkdownInterface.php';
require __DIR__.'/Markdown.php';
require __DIR__.'/MarkdownExtra.php';
$items=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$out=[];
foreach($items as $s) $out[]=\\Michelf\\MarkdownExtra::defaultTransform($s);
echo json_encode($out,JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
`);
console.log('Downloaded PHP '+ releases['8.4'].version + ', Markdown.pl 1.0.1, PHP Markdown Extra 2.0.0');
