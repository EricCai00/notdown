import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../../server/vault.js';
test('extra layouts validate references, preserve unknown settings and enforce CAS',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'notdown-extra-')); t.after(()=>fs.rm(root,{recursive:true,force:true})); const vault=createVault(root);
 let snap=await vault.databases.create({title:'Visits'}); const original=snap.dataSources[0]; const source=await vault.databases.updateSource(original.id,{properties:[...original.properties,{id:'lat',key:'lat',name:'Latitude',type:'number'}]},original.revision);
 for(const type of ['map','form','dashboard'] as const){ snap=await vault.databases.get(snap.database.id); snap=await vault.databases.createView(snap.database.id,{name:type,type},snap.database.revision); }
 const map=snap.views.find(v=>v.type==='map')!, dashboard=snap.views.find(v=>v.type==='dashboard')!, form=snap.views.find(v=>v.type==='form')!;
 const saved=await vault.databases.updateView(map.id,{layout:{mapLatitudeId:'lat',future:{keep:true}}},map.revision);
 await assert.rejects(vault.databases.updateView(map.id,{layout:{}},map.revision),/changed/);
 await assert.rejects(vault.databases.updateView(map.id,{layout:{mapLongitudeId:'bad'}},saved.revision));
 await assert.rejects(vault.databases.updateView(dashboard.id,{layout:{dashboardViewIds:[dashboard.id]}},dashboard.revision));
 await assert.rejects(vault.databases.updateView(form.id,{layout:{formRequiredIds:['bad']}},form.revision));
 await assert.rejects(vault.databases.updateSource(source.id,{properties:original.properties},source.revision),/references/);
 assert.deepEqual((await createVault(root).databases.get(snap.database.id)).views.find(v=>v.id===saved.id)!.layout?.future,{keep:true});
});
