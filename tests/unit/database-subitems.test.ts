import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault";
import { enableSubitems, nestedSubitems, subitemRows } from "../../src/features/databases/database-subitems";
import { queryDatabase, fieldValue } from "../../src/features/databases/database-query";
import type { DatabaseDataSource, DatabaseView } from "../../src/features/databases/database-model";
import type { Page } from "../../src/shared/types";

test("sub-item enablement reuses a Notion self-relation by identity and keeps unknown fields and order",()=>{
  const source={id:"source",notion:{id:"remote"},properties:[
    {id:"title",key:"title",name:"Name",type:"title"},
    {id:"kids",key:"kids",name:"Renamed children",type:"relation",readOnly:true,custom:42,notion:{id:"%40kids"}},
    {id:"parent",key:"parent",name:"Renamed parent",type:"relation",readOnly:true,notion:{id:"%40parent",relation:{limit:1,type:"dual_property",data_source_id:"remote",dual_property:{synced_property_id:"%40kids"}}}},
  ]} as unknown as DatabaseDataSource;
  const patch=enableSubitems(source,()=>assert.fail("Existing pair must be reused"));
  assert.deepEqual(patch.properties.map(f=>f.id),["title","kids","parent"]);assert.equal(patch.properties[1].custom,42);
  assert.equal(source.properties[2].readOnly,true);assert.equal(patch.properties[2].readOnly,false);
  assert.equal(nestedSubitems(source,{} as DatabaseView),false);
  assert.equal(nestedSubitems({...source,...patch},{} as DatabaseView),true);
  assert.equal(nestedSubitems({...source,...patch},{layout:{subitemDisplay:"flat"}} as DatabaseView),false);
});

test("hierarchy preserves sibling order, handles empty expansion, filtered or missing parents and corrupt cycles",()=>{
  let next=0;const base={id:"s",properties:[]} as unknown as DatabaseDataSource;
  const source={...base,...enableSubitems(base,()=>String(++next))};const key=source.subitems!.parentPropertyId;
  const page=(id:string,parent?:string)=>({id,title:id,dataSourceId:"s",properties:{[key]:parent?[{pageId:parent}]:[]}} as unknown as Page);
  const pages=[page("grandchild","child"),page("root"),page("child","root"),page("empty")];
  assert.deepEqual(subitemRows(pages,source,new Set()).map(r=>r.page.id),["root","empty"]);
  assert.deepEqual(subitemRows(pages,source,new Set(["root","child","empty"])).map(r=>[r.page.id,r.depth,r.children]),[["root",0,1],["child",1,1],["grandchild",2,0],["empty",0,0]]);
  assert.deepEqual(subitemRows([pages[0]],source,new Set()).map(r=>r.page.id),["grandchild"]);
  assert.equal(subitemRows([page("a","b"),page("b","a")],source,new Set(["a","b"])).length,2);
});

test("sub-item writes enforce one parent, source ownership, acyclic hierarchy and CAS; turning off preserves values",async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"notdown-subitems-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const vault=createVault(root),snapshot=await vault.databases.create({title:"Tasks"}),initial=snapshot.dataSources[0];
  let next=0;const source=await vault.databases.updateSource(initial.id,enableSubitems(initial,()=>`sub${++next}`),initial.revision);
  const parentField=source.properties.find(f=>f.subitemRole==="parent")!,childrenField=source.properties.find(f=>f.subitemRole==="children")!;
  const a=await vault.databases.createRecord(source.id,{title:"A"},source.revision);
  const b=await vault.databases.createRecord(source.id,{title:"B",properties:{[parentField.key]:[{pageId:a.id}]}},source.revision);
  const c=await vault.databases.createRecord(source.id,{title:"C",properties:{[parentField.key]:[{pageId:b.id}]}},source.revision);
  const write=(page:Page,value:unknown,revision=page.revision)=>vault.databases.updateCell(source.id,page.id,{propertyId:parentField.id,value,baseRevision:revision,schemaRevision:source.revision});
  await assert.rejects(write(a,[{pageId:c.id}]),/cycle/);
  await assert.rejects(vault.update(a.id,{properties:{...a.properties,[parentField.key]:[{pageId:c.id}]}},a.revision,source.revision),/cycle/);
  await assert.rejects(write(b,[{pageId:a.id},{pageId:c.id}]),/one parent/);
  await assert.rejects(write(b,[{pageId:"missing"}]),/this data source/);
  await assert.rejects(vault.databases.updateCell(source.id,a.id,{propertyId:childrenField.id,value:[],baseRevision:a.revision,schemaRevision:source.revision}),/derived/);
  const other=await vault.databases.create({title:"Other"}),foreign=await vault.databases.createRecord(other.dataSources[0].id,{title:"Foreign"},other.dataSources[0].revision);
  await assert.rejects(write(b,[{pageId:foreign.id}]),/this data source/);
  const rows=queryDatabase([a,b,c],source,snapshot.views[0]);assert.deepEqual(fieldValue(a,childrenField),[{pageId:b.id,title:"B"}]);assert.equal(rows.length,3);
  const detached=await write(b,[]);await assert.rejects(write(b,[{pageId:a.id}]),/conflict|changed|modified/i);
  assert.deepEqual((await vault.get(b.id)).properties[parentField.key],[]);
  assert.ok((await vault.listConflicts()).length>0);
  const disabled=await vault.databases.updateSource(source.id,{subitems:{...source.subitems!,enabled:false}},source.revision);
  assert.equal(disabled.subitems!.enabled,false);assert.deepEqual((await vault.get(c.id)).properties[parentField.key],[{pageId:b.id}]);
  assert.equal(detached.title,"B");
  await assert.rejects(vault.databases.updateSource(source.id,{properties:disabled.properties.filter(f=>f.id!==parentField.id)},disabled.revision),/Parent item|sub-item/);
});

test("scope uses parent identities before filtering and disabled views ignore the scope",()=>{
  let id=0;const base={id:"s",properties:[{id:"title",key:"title",name:"Name",type:"title"}]} as unknown as DatabaseDataSource;
  const source={...base,...enableSubitems(base,()=>String(++id))},key=source.subitems!.parentPropertyId;
  const page=(id:string,parent?:string)=>({id,title:id,dataSourceId:"s",properties:{[key]:parent?[{pageId:parent}]:[]}} as unknown as Page);
  const pages=[page("parent"),page("child","parent"),page("grandchild","child"),page("orphan","missing")];
  const view={type:"table",layout:{subitemDisplay:"flat"}} as DatabaseView;
  const ids=(scope:"parents"|"all"|"children",title="")=>queryDatabase(pages,source,{...view,filters:title?[{propertyId:"title",operator:"equals",value:title}]:[],layout:{...view.layout,subitemScope:scope}}).map(p=>p.id);
  assert.deepEqual(ids("parents"),["parent","orphan"]);assert.deepEqual(ids("children"),["child","grandchild"]);
  assert.deepEqual(ids("parents","grandchild"),[]);assert.deepEqual(ids("all","grandchild"),["grandchild"]);
  assert.equal(queryDatabase(pages,source,{...view,layout:{subitemDisplay:"disabled",subitemScope:"parents"}}).length,4);
  const parents=queryDatabase(pages,source,{...view,layout:{subitemScope:"parents"}});
  assert.equal(subitemRows(parents,source,new Set())[0].children,1,"A filtered-out child still marks its parent's toggle as nonempty");
});
