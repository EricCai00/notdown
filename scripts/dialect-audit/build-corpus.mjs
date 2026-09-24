import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parse} from 'parse5';
import {base,gfm,github,extra,mmd,typora,obsidian,notion} from './authored-cases.mjs';
import {pandocProbes,pandocBoundaries} from './pandoc-cases.mjs';

const dir='docs/fixtures/dialect-audit';
await mkdir(dir+'/assets',{recursive:true});
const manifest=JSON.parse(await readFile('.run/dialect-audit/sources/manifest.json','utf8'));
const cm=JSON.parse(await readFile('.run/dialect-audit/sources/commonmark-tests.source','utf8'));
const cmCases=cm.map(x=>({id:`cm-${x.example}`,markdown:x.markdown,expected:x.html,section:x.section,source:'commonmark',url:`https://spec.commonmark.org/0.31.2/#example-${x.example}`,extensions:{}}));
const gfCases=[];
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes||[]).map(text).join('');
const attr=(n,key)=>n.attrs?.find(a=>a.name===key)?.value;
const findAll=(n,p)=>[...(p(n)?[n]:[]),...(n.childNodes||[]).flatMap(c=>findAll(c,p))];
let section='';
function walk(n){
 if(/^h[1-6]$/.test(n.tagName)) section=text(n);
 if(n.tagName==='div' && attr(n,'class')==='example'){
   const codes=findAll(n,c=>c.tagName==='code');
   const md=codes.find(c=>attr(c,'class')==='language-markdown');
   const html=codes.find(c=>attr(c,'class')==='language-html');
   if(md&&html){const id=attr(n,'id');gfCases.push({id:'gfm-'+id,markdown:text(md).replaceAll('→','\t'),expected:text(html).replaceAll('→','\t'),section,source:'gfm-spec',url:'https://github.github.com/gfm/#'+id,extensions:{}});}
 }
 for(const child of n.childNodes||[]) walk(child);
}
walk(parse(await readFile('.run/dialect-audit/sources/gfm-spec.source','utf8')));
if(cmCases.length!==652 || gfCases.length!==677) throw Error(`Unexpected official corpus count: CM ${cmCases.length}, GFM ${gfCases.length}; review upstream version.`);
const supported={};
for(const variant of ['markdown','commonmark_x','markdown_github']){
 const proc=spawnSync(process.env.PANDOC_PATH||'pandoc',['--list-extensions='+variant],{encoding:'utf8',windowsHide:true});
 if(proc.status!==0) throw Error(proc.stderr||'Pandoc unavailable');
 supported[variant]=Object.fromEntries(proc.stdout.trim().split(/\r?\n/).map(s=>[s.slice(1),s[0]==='+']));
 const missing=Object.keys(supported[variant]).filter(id=>!(id in pandocProbes));
 if(missing.length) throw Error('Uncovered Pandoc extensions: '+missing.join(','));
}
const pc=variant=>Object.keys(supported[variant]).map(id=>({id:'pandoc-'+id,markdown:pandocProbes[id]+'\n',source:'pandoc-pinned',section:id,extensions:{[id]:true},note:id==='gutenberg'?'Plain writer option; HTML is not a sufficient oracle.':id==='rebase_relative_paths'?'stdin has no source path; path rebasing requires a separate file-input check.':''}));
const table=gfm.filter(c=>c.id.startsWith('table-'));
const suites={
 commonmark:[...base.map(c=>({...c,source:'commonmark'})),...cmCases],
 gfm:[...base.map(c=>({...c,source:'gfm-spec'})),...gfm,...gfCases,...github],
 markdown_strict:base,
 markdown_phpextra:[...base,...table,...extra],
 markdown_mmd:[...base,...extra.filter(c=>/extra-definition|extra-footnote/.test(c.id)),...mmd],
 markdown:[...base,...pc('markdown'),...pandocBoundaries],
 commonmark_x:[...base.map(c=>({...c,source:'commonmark'})),...pc('commonmark_x'),...pandocBoundaries],
 markdown_github:[...base,...pc('markdown_github'),...pandocBoundaries],
 typora:[...base,...gfm,...typora],
 obsidian:[...base.map(c=>({...c,source:'obsidian-basic-formatting-syntax'})),...gfm,...obsidian],
 'notion-markdown':notion,
};
// Metadata keys are a syntax family, including output-specific keys. Preserve
// them in coverage even where HTML cannot demonstrate their target behavior.
for(const key of ['Author','Affiliation','Biblio Style','BibTeX','Copyright','CSS','Date','HTML Header','Language','LaTeX Author','LaTeX Begin','LaTeX Config','LaTeX Footer','LaTeX Header','LaTeX Leader','LaTeX Mode','LaTeX Title','ODF Header','Title']){
 suites.markdown_mmd.push({id:'mmd-key-'+key.toLowerCase().replaceAll(' ','-'),markdown:`${key}: audit-value\n\nBody\n`,source:'mmd',extensions:{},note:'Metadata key; some effects apply only to standalone or non-HTML outputs.'});
}
const catalog={schemaVersion:1,generatedAt:new Date().toISOString(),sources:manifest,pandocExtensions:supported,suites:{}};
for(const [variant,cases] of Object.entries(suites)){
 let doc=`# ${variant} 官方语法测试文档\n\n每个 CASE 独立执行；完整文件另作整篇转换。行范围以 cases.json 为准。\n元数据文首、未闭合围栏、引用定义等边界必须使用独立片段结果，不能以拼接结果替代。\n\n`;
 const entries=[];
 for(const c of cases){
   if(entries.some(x=>x.id===c.id))throw Error('Duplicate '+c.id);
   doc+=`\n\n<!-- CASE ${c.id} -->\n\n`;
   const start=doc.length;
   const startLine=doc.split('\n').length;
   doc+=c.markdown;
   const {markdown,...meta}=c;
   const origin=manifest.find(s=>s.id===c.source);
   entries.push({...meta,url:c.url||origin?.url,start,end:doc.length,startLine,endLine:startLine+c.markdown.split('\n').length-1,sha256:createHash('sha256').update(c.markdown).digest('hex')});
 }
 await writeFile(`${dir}/${variant}.md`,doc);
 catalog.suites[variant]={file:`${variant}.md`,sha256:createHash('sha256').update(doc).digest('hex'),cases:entries};
}
for(const [file,content] of Object.entries({'include.md':'Title: Child metadata\n\n**Included text**\n','include.txt':'literal include\n','include.html':'<b>HTML wildcard include</b>\n','assets/include.md':'**Nested include**\n','Target.md':'# Heading\n\nTarget content. ^block-id\n','assets/sample.svg':'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#579"/></svg>\n'}))await writeFile(`${dir}/${file}`,content);
await writeFile(`${dir}/cases.json`,JSON.stringify(catalog,null,2)+'\n');
console.log(Object.fromEntries(Object.entries(catalog.suites).map(([v,s])=>[v,s.cases.length])));
