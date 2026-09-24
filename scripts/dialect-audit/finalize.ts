import {renderAuditViewer} from './viewer.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parse,serialize} from 'parse5';
import {createHash} from 'node:crypto';
import {parseNative} from '../../src/markdown-engine/codec.js';
import {renderNotionMarkdown} from '../../src/document/document-format.js';
import {compareHtml} from './compare.js';
const output='.run/dialect-audit/results';
const data=JSON.parse(await readFile(output+'/results.json','utf8'));
const corpus=JSON.parse(await readFile('docs/fixtures/dialect-audit/cases.json','utf8'));
const gh=JSON.parse(await readFile('.run/dialect-audit/github-official/official.json','utf8'));
data.info.github={renderer:gh.renderer,mode:gh.mode,context:gh.context,successful:gh.results.filter((x:any)=>x.status===200).length};
for(const item of gh.results){
 if(item.status!==200)continue;
 if(item.id==='whole-document'){await writeFile(output+'/gfm.github-service.html',item.html);continue;}
 const row=data.results.find((r:any)=>r.variant==='gfm'&&r.id===item.id);
 if(!row)throw Error('Unknown GitHub fixture '+item.id);
 row.cmarkCore??=row.official;row.official=item.html;row.officialService={date:item.date,requestId:item.requestId};
 for(const p of Object.values<any>(row.profiles)){
  p.authority='GitHub REST /markdown (gfm, public github/docs context)';
  if(p.notdown!==undefined)p.comparison=compareHtml(item.html,p.notdown);
 }
}
try{
 const obs=JSON.parse(await readFile('.run/dialect-audit/obsidian-isolated/official.json','utf8'));
 if(obs.error)throw Error(obs.error);
 data.info.obsidian={renderer:obs.renderer,apiVersion:obs.apiVersion};
 for(const item of obs.results){
  if(item.error)continue;
  if(item.id==='whole-document'){await writeFile(output+'/obsidian.official.html',item.html);continue;}
  const row=data.results.find((r:any)=>r.variant==='obsidian'&&r.id===item.id);
  if(!row)continue;row.official=item.html;
  for(const p of Object.values<any>(row.profiles)){p.authority=obs.renderer;p.comparison=compareHtml(item.html,p.notdown);}
 }
}catch(e){data.info.obsidianUnavailable='Installed Obsidian 1.13.7: isolated profile/vault plugin did not return HTML within two 90-second attempts. '+String(e);}
try{
 const html=await readFile(output+'/typora.official.html','utf8');
 const parsed:any=parse(html);
 const findBody=(n:any):any=>n.tagName==='body'?n:(n.childNodes||[]).map(findBody).find(Boolean);
 const fragment=serialize(findBody(parsed));
 const captured=await readFile(output+'/typora.application-saved.md','utf8');
 const native=renderNotionMarkdown(captured,[],{document:parseNative(captured,{version:1,variant:'typora',extensions:{}})});
 await writeFile(output+'/typora.application-saved.notdown.html',native);
 let metadata={version:'not recorded'};
 try{metadata=JSON.parse(await readFile(output+'/typora.official.meta.json','utf8'));}catch{}
 data.info.typoraWhole={...metadata,renderer:'Typora native HTML (without styles) export',sha256:createHash('sha256').update(html).digest('hex'),scope:'Whole application-saved anthology only; Typora added whitespace to blank code lines. Original fixture restored. Existing preferences were not changed or exhaustively recorded. Not an independent-case oracle.',comparison:compareHtml(fragment,native)};
 await writeFile(output+'/typora.official.fragment.html',fragment);
}catch{data.info.typoraWholeUnavailable='Native HTML export not found; no independent-case oracle.';}
const summaries=Object.keys(corpus.suites).map(variant=>{
 const rows=data.results.filter((r:any)=>r.variant===variant);
 const profiles:any={};
 for(const name of ['default','documented','disabled','file-path']){
  const ps=rows.flatMap((r:any)=>r.profiles[name]?[r.profiles[name]]:[]);
  if(!ps.length)continue;
  profiles[name]={runs:ps.length,compared:ps.filter((p:any)=>p.comparison).length,rawEqual:ps.filter((p:any)=>p.comparison?.rawEqual).length,domEqual:ps.filter((p:any)=>p.comparison?.domEqual).length,textEqual:ps.filter((p:any)=>p.comparison?.textEqual).length,roundtripExact:ps.filter((p:any)=>p.roundtripExact).length,nativeErrors:ps.filter((p:any)=>p.error).length,pandocErrors:ps.filter((p:any)=>p.pandocError).length};
 }
 return {variant,cases:rows.length,profiles};
});
const differences=data.results.flatMap((r:any)=>Object.entries<any>(r.profiles).filter(([,p])=>!p.comparison?.domEqual).map(([profile,p])=>({variant:r.variant,id:r.id,profile,startLine:r.startLine,url:r.url,authority:p.authority??null,comparison:p.comparison??null,specComparison:p.specComparison??null,pandocComparison:p.pandocComparison??null,error:p.error??null})));
data.summaries=summaries;
await writeFile(output+'/results.json',JSON.stringify(data,null,2));
await mkdir('docs/data/dialect-audit-2026-09-23',{recursive:true});
await writeFile('docs/data/dialect-audit-2026-09-23/summary.json',JSON.stringify({info:data.info,summaries,specChecks:['commonmark','gfm'].map(variant=>{const rows=data.results.filter((r:any)=>r.variant===variant&&r.expected!==null);return {variant,cases:rows.length,officialVsSpecDomDifferences:rows.filter((r:any)=>!r.profiles.default.officialVsSpec.domEqual).map((r:any)=>r.id)};})},null,2)+'\n');
await writeFile('docs/data/dialect-audit-2026-09-23/differences.json',JSON.stringify(differences,null,2)+'\n');
for(const variant of Object.keys(corpus.suites))await writeFile(output+'/'+variant+'.cases.json',JSON.stringify(data.results.filter((r:any)=>r.variant===variant),null,2));
const table=['| 方言 | 独立输入 | 默认有官方对照 | DOM 相同 | 文本相同 | 文档扩展 / 关闭 / 路径配置 |','| --- | ---: | ---: | ---: | ---: | --- |',...summaries.map(s=>`| ${s.variant} | ${s.cases} | ${s.profiles.default.compared} | ${s.profiles.default.domEqual} | ${s.profiles.default.textEqual} | ${s.profiles.documented?.runs||0} / ${s.profiles.disabled?.runs||0} / ${s.profiles['file-path']?.runs||0} |`)].join('\n');
await writeFile(output+'/summary-table.md',table+'\n');
await writeFile(output+'/index.html',await renderAuditViewer(data.results,summaries));
console.log(table);
