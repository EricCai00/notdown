/** Recheck the current native engine against the frozen official HTML, without
 * overwriting the original audit. Run: npx tsx scripts/dialect-audit/analyze-current.ts */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseNative,serializeNative} from '../../src/markdown-engine/codec.js';
import {renderNotionMarkdown} from '../../src/document/document-format.js';
import {compareHtml} from './compare.js';

const baselinePath='.run/dialect-audit/results/results.json';
const baselineBytes=await readFile(baselinePath,'utf8');
const baseline=JSON.parse(baselineBytes);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function hashes(){
 const result:Record<string,string>={};
 for(const dir of ['src/document','src/markdown-engine']){
  for(const file of (await readdir(dir)).sort())if(/\.(ts|json)$/.test(file))result[dir+'/'+file]=hash(await readFile(dir+'/'+file,'utf8'));
 }
 return result;
}
const start=await hashes();
const rows:any[]=[];
for(const row of baseline.results){
 for(const [profile,previous] of Object.entries<any>(row.profiles)){
  const config:any={version:1,variant:row.variant,extensions:previous.extensions,...(previous.sourcePath?{sourcePath:previous.sourcePath}:{})};
  const official=['markdown','commonmark_x','markdown_github'].includes(row.variant)?previous.pandoc:row.official;
  const entry:any={variant:row.variant,id:row.id,profile,url:row.url,source:row.source,authority:previous.authority??null,extensions:previous.extensions,official:official??null,previousComparison:previous.comparison??null};
  try{
   const document=parseNative(row.source,config);
   entry.notdown=renderNotionMarkdown(row.source,[],{document});
   entry.comparison=typeof official==='string'?compareHtml(official,entry.notdown):null;
   entry.roundtripExact=serializeNative(document,config)===row.source;
   entry.nativeChanged=entry.notdown!==previous.notdown;
   if(row.expected!==null&&row.expected!==undefined)entry.specComparison=compareHtml(row.expected,entry.notdown);
  }catch(error){entry.error=String(error);}
  rows.push(entry);
 }
}
const end=await hashes();
if(JSON.stringify(start)!==JSON.stringify(end))throw Error('Engine changed during recheck; rerun before publishing results.');
const summarize=(items:any[])=>({runs:items.length,compared:items.filter(r=>r.comparison).length,rawEqual:items.filter(r=>r.comparison?.rawEqual).length,domEqual:items.filter(r=>r.comparison?.domEqual).length,textEqual:items.filter(r=>r.comparison?.textEqual).length,roundtripExact:items.filter(r=>r.roundtripExact).length,errors:items.filter(r=>r.error).length,nativeChanged:items.filter(r=>r.nativeChanged).length});
const variants=[...new Set<string>(rows.map(r=>r.variant))];
const selected=/^(list-nesting|mmd-image-figure|extra-fence-length|gfm-example-491|gfm-example-493|autolink-boundary|table-align|extra-abbreviation|doc-collapse|doc-math-dollar|cm-606|cm-632|reference-links|pandoc-fancy_lists|pandoc-implicit_figures)$|definition|html-markdown|attributes|implicit_header|task_lists|transclu|mmd-meta|mmd-citat|mmd-table|obs-block-links|obs-embed-note|obs-comments|mention-agent/;
const evidence=rows.filter(r=>selected.test(r.id));
const summary={generatedAt:new Date().toISOString(),scope:'Current parseNative -> renderNotionMarkdown; frozen upstream HTML; no fresh upstream execution and no browser visual measurement.',baselinePath,baselineSha256:hash(baselineBytes),baselineTimestamp:baseline.info.timestamp,engineHashes:start,engineChangedDuringRun:false,totals:summarize(rows),defaults:summarize(rows.filter(r=>r.profile==='default')),variants:variants.map(variant=>({variant,defaults:summarize(rows.filter(r=>r.variant===variant&&r.profile==='default')),allProfiles:summarize(rows.filter(r=>r.variant===variant))})),changed:rows.filter(r=>r.nativeChanged).map(({variant,id,profile,previousComparison,comparison})=>({variant,id,profile,previousComparison,comparison})),evidence};
await mkdir('.run/dialect-audit/analysis',{recursive:true});
await writeFile('.run/dialect-audit/analysis/current-results.json',JSON.stringify({summary,rows},null,2)+'\n');
await writeFile('docs/data/dialect-audit-2026-09-23/current-analysis.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({generatedAt:summary.generatedAt,totals:summary.totals,defaults:summary.defaults,variants:summary.variants,evidence:evidence.length},null,2));
