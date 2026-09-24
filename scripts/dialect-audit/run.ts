import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {parseNative,serializeNative} from '../../src/markdown-engine/codec.js';
import {renderNotionMarkdown} from '../../src/document/document-format.js';
import {compareHtml} from './compare.js';

const root=process.cwd(),fixtures=path.resolve('docs/fixtures/dialect-audit');
const out=path.resolve('.run/dialect-audit/results');
const tools=path.resolve('.run/dialect-audit/tools');
const catalog=JSON.parse(await readFile(path.join(fixtures,'cases.json'),'utf8'));
const require=createRequire(path.join(tools,'package.json'));
const commonmark=require('commonmark');
const python=process.env.AUDIT_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const perl=process.env.PERL_PATH||'C:/Program Files/Git/usr/bin/perl.exe';
const markdownPl=process.env.MARKDOWN_PL_PATH||path.join(tools,'markdown/Markdown_1.0.1/Markdown.pl');
const php=process.env.PHP_PATH||path.join(tools,'php/php.exe');
const mmd=process.env.MULTIMARKDOWN_PATH||'C:/Program Files/libMultiMarkdown 6.7.0/bin/multimarkdown.exe';
const pandoc=process.env.PANDOC_PATH||'pandoc';
function run(exe:string,args:string[],input='',cwd=root):Promise<string>{
 return new Promise((resolve,reject)=>{
   const p=spawn(exe,args,{cwd,windowsHide:true,stdio:'pipe'});let stdout='',stderr='';
   const timer=setTimeout(()=>{p.kill();reject(Error('Timeout: '+exe));},30000);
   p.stdout.setEncoding('utf8').on('data',c=>stdout+=c);p.stderr.setEncoding('utf8').on('data',c=>stderr+=c);
   p.on('error',e=>{clearTimeout(timer);reject(e);});
   p.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(stderr||`${exe}: ${code}`));});
   p.stdin.on('error',()=>{});p.stdin.end(input);
 });
}
const version=async(exe:string,args:string[])=>{try{return (await run(exe,args)).trim().split(/\r?\n/).slice(0,3).join(' ');}catch(e){return String(e);}};
const info={
 timestamp:new Date().toISOString(),gitHead:await run('git',['rev-parse','HEAD']),
 dirty:await run('git',['status','--short']),node:process.version,
 commonmark:JSON.parse(await readFile(path.join(tools,'node_modules/commonmark/package.json'),'utf8')).version,
 cmarkgfm:await version(python,['-c',"import sys;sys.path.insert(0,'.run/gfm-renderer');import importlib.metadata as m;print(m.version('cmarkgfm'))"]),
 php:await version(php,['-v']),phpMarkdownExtra:'2.0.0',markdownPl:'1.0.1',
 mmd:await version(mmd,['--version']),pandoc:await version(pandoc,['--version']),
 paths:{python,perl,markdownPl,php,mmd,pandoc},
 scope:'parseNative(source, {version:1, variant, extensions}) → renderNotionMarkdown(document). No Lab/Pandoc fallback. Static exporter, not live ProseMirror DOM.',
};
const formats=new Set((await run(pandoc,['--list-input-formats'])).trim().split(/\r?\n/));
const parser=new commonmark.Parser();const writer=new commonmark.HtmlRenderer({safe:false});
await mkdir(out,{recursive:true});
const results:any[]=[];const whole:any[]=[];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function engineHashes(){
 const all:Record<string,string>={};
 for(const dir of ['src/document','src/markdown-engine'])for(const name of await readdir(dir))if(/\.(ts|json)$/.test(name))all[dir+'/'+name]=hash(await readFile(dir+'/'+name,'utf8'));
 return all;
}
const engineAtStart=await engineHashes();
async function mapLimit<T,R>(items:T[],fn:(x:T,i:number)=>Promise<R>):Promise<R[]>{
 let next=0;const values:R[]=[];
 await Promise.all(Array.from({length:4},async()=>{while(next<items.length){const i=next++;values[i]=await fn(items[i],i);}}));
 return values;
}
async function officialBatch(variant:string,sources:string[]){
 if(variant==='commonmark')return sources.map(s=>writer.render(parser.parse(s)));
 if(variant==='gfm')return JSON.parse(await run(python,['scripts/dialect-audit/cmark-gfm.py'],JSON.stringify(sources)));
 if(variant==='markdown_phpextra')return JSON.parse(await run(php,[path.join(tools,'extra.php')],JSON.stringify(sources)));
 if(variant==='markdown_strict')return mapLimit(sources,s=>run(perl,[markdownPl],s));
 if(variant==='markdown_mmd'){
   const dir=path.resolve('.run/dialect-audit/mmd-inputs');await mkdir(path.join(dir,'assets'),{recursive:true});
   for(const file of ['include.md','include.txt','include.html','assets/include.md'])await copyFile(path.join(fixtures,file),path.join(dir,file));
   return mapLimit(sources,async(s,i)=>{const file=path.join(dir,`case-${i}.md`);await writeFile(file,s);return run(mmd,['--snippet','--to=html',file],'',dir);});
 }
 return null;
}
function native(source:string,variant:string,extensions:any,sourcePath?:string){
 const config:any={version:1,variant,extensions,...(sourcePath?{sourcePath}:{})};
 const doc=parseNative(source,config);
 return {html:renderNotionMarkdown(source,[],{document:doc}),roundtrip:serializeNative(doc,config),nodeTypes:[...new Set(doc.content.content.map(n=>n.type.name))]};
}
for(const [variant,suite] of Object.entries<any>(catalog.suites)){
 const document=await readFile(path.join(fixtures,suite.file),'utf8');
 if(hash(document)!==suite.sha256)throw Error(`Fixture changed: ${suite.file}; rebuild the corpus.`);
 const cases=suite.cases.map((c:any)=>({...c,markdown:document.slice(c.start,c.end)}));
 for(const c of cases)if(hash(c.markdown)!==c.sha256)throw Error('Invalid source offsets '+c.id);
 const sourceInputs=[...cases.map((c:any)=>c.markdown),document];
 let official:(string[]|null)=null;let officialError='';
 try{official=await officialBatch(variant,sourceInputs);}catch(e){officialError=String(e);}
 const readerFlags:Record<string,boolean>={};
 if(formats.has(variant)) for(const s of (await run(pandoc,['--list-extensions='+variant])).trim().split(/\r?\n/))readerFlags[s.slice(1)]=s[0]==='+';
 const entries=await mapLimit(cases,async(c:any,i:number)=>{
   const row:any={variant,id:c.id,source:c.markdown,url:c.url,section:c.section,note:c.note,startLine:c.startLine,official:official?.[i]??null,officialError,expected:c.expected??null,profiles:{}};
   const profiles:any[]=[['default',{}]];
   if(Object.keys(c.extensions||{}).length)profiles.push(['documented',c.extensions]);
   if(['markdown','commonmark_x','markdown_github'].includes(variant)&&Object.keys(c.extensions||{}).length)profiles.push(['disabled',Object.fromEntries(Object.keys(c.extensions).map(k=>[k,false]))]);
   if(c.id==='pandoc-rebase_relative_paths')profiles.push(['file-path',{rebase_relative_paths:true}]);
   for(const [name,extensions]of profiles){
     const p:any={extensions};
     const inputPath=name==='file-path'?`.run/dialect-audit/path-inputs/${variant}/case.md`:undefined;
     if(inputPath){await mkdir(path.dirname(inputPath),{recursive:true});await writeFile(inputPath,c.markdown);p.sourcePath=inputPath;}
     try{const n=native(c.markdown,variant,extensions,inputPath);p.notdown=n.html;p.roundtripExact=n.roundtrip===c.markdown;p.roundtrip=n.roundtrip;p.nodeTypes=n.nodeTypes;}catch(e){p.error=String(e);}
     if(formats.has(variant)){
       const unsupported=Object.keys(extensions).filter(id=>!(id in readerFlags));
       if(unsupported.length)p.pandocSkipped='Reader does not expose: '+unsupported.join(', ');
       else try{const reader=variant+Object.entries(extensions).map(([id,on])=>(on?'+':'-')+id).join('');p.pandoc=await run(pandoc,['--sandbox','-f',reader,'-t','html5','--wrap=none','--mathml','--syntax-highlighting=none',...(inputPath?[inputPath]:[])],inputPath?'':c.markdown);p.pandocReader=reader;}catch(e){p.pandocError=String(e);}
     }
     // Only Pandoc's own dialects use Pandoc as their official oracle.
     const authoritative=['markdown','commonmark_x','markdown_github'].includes(variant)?p.pandoc:row.official;
     p.authority=['markdown','commonmark_x','markdown_github'].includes(variant)?'Pandoc':variant==='gfm'&&c.id.startsWith('doc-')?'cmark-gfm core only; GitHub website postprocessing NOT covered':row.official!==null?'upstream parser':null;
     if(authoritative!==undefined&&authoritative!==null&&p.notdown!==undefined)p.comparison=compareHtml(authoritative,p.notdown);
     if(row.expected!==null&&p.notdown!==undefined)p.specComparison=compareHtml(row.expected,p.notdown);
     if(row.expected!==null&&authoritative!==undefined&&authoritative!==null)p.officialVsSpec=compareHtml(row.expected,authoritative);
     if(p.pandoc!==undefined&&p.notdown!==undefined)p.pandocComparison=compareHtml(p.pandoc,p.notdown);
     row.profiles[name]=p;
   }
   return row;
 });
 results.push(...entries);
 const summary:any={variant,official:official?.at(-1)??null,officialError};
 try{summary.notdown=native(document,variant,{}).html;}catch(e){summary.error=String(e);}
 if(formats.has(variant))try{summary.pandoc=await run(pandoc,['--sandbox','-f',variant,'-t','html5','--wrap=none','--mathml','--syntax-highlighting=none'],document);}catch(e){summary.pandocError=String(e);}
 if(['markdown','commonmark_x','markdown_github'].includes(variant))summary.official=summary.pandoc;
 for(const engine of ['official','notdown','pandoc'])if(typeof summary[engine]==='string')await writeFile(path.join(out,`${variant}.${engine}.html`),summary[engine]);
 whole.push(summary);
 await writeFile(path.join(out,variant+'.cases.json'),JSON.stringify(entries,null,2));
 console.log(variant,JSON.stringify({cases:entries.length,domEqual:entries.filter((e:any)=>e.profiles.default.comparison?.domEqual).length,textEqual:entries.filter((e:any)=>e.profiles.default.comparison?.textEqual).length,errors:entries.filter((e:any)=>e.profiles.default.error).length,official:!!official||['markdown','commonmark_x','markdown_github'].includes(variant)}));
}
const engineAtEnd=await engineHashes();
Object.assign(info,{engineAtStart,engineAtEnd,engineChangedDuringRun:JSON.stringify(engineAtStart)!==JSON.stringify(engineAtEnd)});
await writeFile(path.join(out,'results.json'),JSON.stringify({info,results,whole},null,2));
await writeFile(path.join(out,'environment.json'),JSON.stringify(info,null,2));
console.log('Results: '+out);
