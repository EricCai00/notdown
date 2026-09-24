// Official GitHub REST renderer. Sends only authored public synthetic fixtures,
// without credentials, commits, comments, or repository mutations.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const corpus=JSON.parse(await readFile('docs/fixtures/dialect-audit/cases.json','utf8'));
const source=await readFile('docs/fixtures/dialect-audit/gfm.md','utf8');
const cache='.run/dialect-audit/github-official';await mkdir(cache,{recursive:true});
const items=corpus.suites.gfm.cases.filter(c=>c.id.startsWith('doc-')).map(c=>({id:c.id,source:source.slice(c.start,c.end)}));
items.push({id:'whole-document',source});
const results=[];
for(const item of items){
 const file=`${cache}/${item.id}.json`,sha256=createHash('sha256').update(item.source).digest('hex');
 try{const old=JSON.parse(await readFile(file,'utf8'));if(old.sha256===sha256&&old.status===200){results.push(old);continue;}}catch{}
 const response=await fetch('https://api.github.com/markdown',{
  method:'POST',headers:{'Content-Type':'application/json','User-Agent':'notdown-dialect-audit','X-GitHub-Api-Version':'2022-11-28','Accept':'application/vnd.github+json'},
  body:JSON.stringify({text:item.source,mode:'gfm',context:'github/docs'}),signal:AbortSignal.timeout(30000),
 });
 const data={id:item.id,sha256,status:response.status,date:response.headers.get('date'),requestId:response.headers.get('x-github-request-id'),remaining:response.headers.get('x-ratelimit-remaining'),html:await response.text()};
 await writeFile(file,JSON.stringify(data,null,2));results.push(data);
 console.log(item.id,response.status,data.remaining);
 if(response.status!==200)break;
}
await writeFile(`${cache}/official.json`,JSON.stringify({renderer:'GitHub REST POST /markdown',mode:'gfm',context:'github/docs',results},null,2));
