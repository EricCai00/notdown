// Run the installed official app in a disposable profile/vault. No user's vault
// or settings are read. The only plugin calls Obsidian's documented render API.
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),dir=path.resolve('.run/dialect-audit/obsidian-isolated');
const profile=path.join(dir,'appdata'),vault=path.join(dir,'vault'),out=path.join(dir,'official.json');
const plugin=path.join(vault,'.obsidian/plugins/dialect-audit');
await mkdir(plugin,{recursive:true});await mkdir(path.join(profile,'obsidian'),{recursive:true});
const corpus=JSON.parse(await readFile('docs/fixtures/dialect-audit/cases.json','utf8'));
const source=await readFile('docs/fixtures/dialect-audit/obsidian.md','utf8');
const inputs=corpus.suites.obsidian.cases.map(c=>({id:c.id,source:source.slice(c.start,c.end)}));
inputs.push({id:'whole-document',source});
await writeFile(path.join(dir,'inputs.json'),JSON.stringify(inputs));
await writeFile(path.join(profile,'obsidian','obsidian.json'),JSON.stringify({vaults:{'1234567890abcdef':{path:vault,ts:Date.now(),open:true}}}));
await writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({safeMode:false,showInlineTitle:false}));
await writeFile(path.join(vault,'.obsidian','community-plugins.json'),JSON.stringify(['dialect-audit']));
await writeFile(path.join(vault,'.obsidian','core-plugins.json'),JSON.stringify(['file-explorer','global-search','backlink','tag-pane','page-preview','properties','bases']));
await writeFile(path.join(plugin,'manifest.json'),JSON.stringify({id:'dialect-audit',name:'Local dialect audit',version:'1.0.0',minAppVersion:'1.0.0',description:'Isolated official MarkdownRenderer audit',author:'Notdown audit',isDesktopOnly:true}));
await copyFile('docs/fixtures/dialect-audit/Target.md',path.join(vault,'Target.md'));
await copyFile('docs/fixtures/dialect-audit/assets/sample.svg',path.join(vault,'sample.svg'));
await writeFile(path.join(vault,'Audit.md'),'# Isolated syntax audit\n');
await writeFile(path.join(plugin,'main.js'),`
const {Plugin,MarkdownRenderer,Component,apiVersion}=require('obsidian');
const fs=require('fs');
module.exports=class extends Plugin {
 onload(){ this.app.workspace.onLayoutReady(()=>this.audit()); }
 async audit(){
  const output=${JSON.stringify(out)};
  try {
   if(this.app.vault.adapter.getBasePath()!==${JSON.stringify(vault)})throw Error('Unexpected vault: refusing to run');
   const items=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir,'inputs.json'))},'utf8'));
   const results=[];
   for(const item of items){
    const el=document.createElement('div');el.className='markdown-rendered';document.body.appendChild(el);
    const component=new Component();component.load();
    try{await MarkdownRenderer.render(this.app,item.source,el,'Audit.md',component);await new Promise(r=>setTimeout(r,100));results.push({id:item.id,html:el.innerHTML});}
    catch(error){results.push({id:item.id,error:String(error)});}
    finally{component.unload();el.remove();}
   }
   fs.writeFileSync(output,JSON.stringify({apiVersion,renderer:'Obsidian MarkdownRenderer.render',vault:this.app.vault.adapter.getBasePath(),results},null,2));
  }catch(error){fs.writeFileSync(output,JSON.stringify({error:String(error)}));}
 }
};
`);
const child=spawn(process.env.OBSIDIAN_PATH||path.join(process.env.LOCALAPPDATA||'', 'Obsidian/Obsidian.exe'),['--user-data-dir='+path.join(profile,'obsidian')],{windowsHide:true,env:{...process.env,APPDATA:profile},stdio:'ignore'});
console.log('Isolated app PID '+child.pid+'; output '+out);
let done=false;
for(let i=0;i<90;i++){
 await new Promise(r=>setTimeout(r,1000));
 try{await stat(out);done=true;break;}catch{}
}
child.kill();
if(!done)throw Error('Official app did not run the isolated render plugin within 90 seconds. No HTML oracle produced.');
console.log((await readFile(out,'utf8')).slice(0,350));
