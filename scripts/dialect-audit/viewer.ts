import {readFile} from 'node:fs/promises';
import {parseFragment,serialize} from 'parse5';

const pandocOwned=new Set(['markdown','commonmark_x','markdown_github']);
/** Dedupe by renderer identity, never merely by coincidentally equal output. */
export function comparisonOutputs(row:any,profile:any):{label:string;html:string}[]{
 const outputs:{label:string;html:string}[]=[];
 if(pandocOwned.has(row.variant)){
  if(typeof profile.pandoc==='string')outputs.push({label:'官方 · Pandoc HTML',html:profile.pandoc});
 }else if(typeof row.official==='string')outputs.push({label:'官方 HTML',html:row.official});
 if(typeof profile.notdown==='string')outputs.push({label:'Notdown HTML',html:profile.notdown});
 if(!pandocOwned.has(row.variant)&&typeof profile.pandoc==='string')outputs.push({label:'Pandoc HTML',html:profile.pandoc});
 return outputs;
}

/** Static preview only: raw HTML remains untouched in the adjacent code panel. */
export function previewDocument(html:string):string{
 const root:any=parseFragment(html);
 const blocked=new Set(['script','iframe','object','embed','base','meta','link','form']);
 function clean(node:any){
  node.childNodes=(node.childNodes||[]).filter((child:any)=>!blocked.has(child.tagName));
  if(node.attrs)node.attrs=node.attrs.filter((a:any)=>!/^on/i.test(a.name)&&!['srcdoc','action','formaction','target','ping','autofocus'].includes(a.name)&&(!['href','xlink:href'].includes(a.name)||a.value.startsWith('#')));
  for(const child of node.childNodes)clean(child);
  if(node.content)clean(node.content);
 }
 clean(root);
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:14px;color:#243247;font:15px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #cbd2dc;padding:5px 9px}blockquote{margin-left:0;padding-left:14px;border-left:3px solid #bbc7d5}img{max-width:100%}a{color:#17649b}code{font-family:Consolas,monospace}</style></head><body>${serialize(root)}</body></html>`;
}

export async function renderAuditViewer(rows:any[],summaries:any[]):Promise<string>{
 const data=rows.map(row=>({...row,profiles:Object.fromEntries(Object.entries<any>(row.profiles).map(([key,p])=>[key,{...p,outputs:comparisonOutputs(row,p).map(o=>({...o,preview:previewDocument(o.html)}))}]))}));
 const json=JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 const template=await readFile(new URL('./viewer.html',import.meta.url),'utf8');
 return template.replace('__COUNT__',String(rows.length)).replace('__DIALECTS__',summaries.map(s=>`<option>${s.variant}</option>`).join('')).replace('__RESULTS__',()=>json);
}
