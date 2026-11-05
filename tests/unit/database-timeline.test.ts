import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { timelineViewport, timelineWindow, timelineScales } from "../../src/features/databases/database-timeline-model.js";
import { dependencyValue, relationIds } from "../../src/features/databases/database-dependencies.js";
import { queryDatabase, fieldValue } from "../../src/features/databases/database-query.js";
import { scheduleDependencies } from "../../src/features/databases/database-scheduling.js";
import type { DatabaseDataSource, DatabaseProperty } from "../../src/features/databases/database-model.js";
import type { Page } from "../../src/shared/types.js";

const scheduleDate: DatabaseProperty = {id:"date",key:"date",name:"Date",type:"date"};
const scheduleBefore: DatabaseProperty = {id:"before",key:"before",name:"Blocked by",type:"relation",localRelation:true,dependencyRole:"blockedBy"};
const scheduleSource = {id:"source",properties:[scheduleDate,scheduleBefore]} as DatabaseDataSource;
const scheduledPage = (id:string,start:string,end:string|null,before:string[]=[]): Page => ({id,title:id,parent:null,icon:"",body:"",revision:"revision",updated:"2026-11-03",dataSourceId:"source",properties:{date:{start,end,custom:"keep"},before:before.map(pageId=>({pageId}))}});

test("dependency scheduling shifts the complete downstream chain, preserves duration and leaves unrelated tasks alone",()=>{
  const a=scheduledPage("3","2026-11-02","2026-11-06"), b=scheduledPage("4","2026-10-27","2026-10-31"), c=scheduledPage("2","2026-11-02","2026-11-04",["4"]), unrelated=scheduledPage("unrelated","2026-10-01",null);
  const pages=[c,unrelated,b,a], original=structuredClone(pages);
  const changes=scheduleDependencies(pages,scheduleSource,[{page:b,field:scheduleBefore,value:[{pageId:a.id}]}]);
  assert.deepEqual(changes.filter(change=>change.field.id==="date").map(change=>[change.page.id,change.value]),[
    ["4",{start:"2026-11-07",end:"2026-11-11",custom:"keep"}],
    ["2",{start:"2026-11-12",end:"2026-11-14",custom:"keep"}],
  ]);
  assert.deepEqual(pages,original);
  const disabled=scheduleDependencies(pages,{...scheduleSource,dependencyAutoShift:false},[{page:b,field:scheduleBefore,value:[{pageId:a.id}]}]);
  assert.equal(disabled.length,1);
});

test("dependency scheduling follows all predecessors across a diamond and preserves single-day values",()=>{
  const a=scheduledPage("a","2026-11-01","2026-11-05"), b=scheduledPage("b","2026-11-06",null,["a"]), c=scheduledPage("c","2026-11-04","2026-11-08",["a"]), d=scheduledPage("d","2026-11-06",null,["b","c"]);
  const changes=scheduleDependencies([d,c,b,a],scheduleSource,[{page:a,field:scheduleDate,value:{start:"2026-11-03",end:"2026-11-07"}}]);
  assert.deepEqual(changes.find(change=>change.page.id==="d")?.value,{start:"2026-11-13",end:null,custom:"keep"});
  assert.deepEqual(changes.find(change=>change.page.id==="b")?.value,{start:"2026-11-08",end:null,custom:"keep"});
  assert.equal(changes.length,4);
});

test("dependency scheduling rejects cycles and overlapping timed tasks before returning a write plan",()=>{
  const a=scheduledPage("a","2026-11-01","2026-11-05"), b=scheduledPage("b","2026-11-06",null,["a"]);
  assert.throws(()=>scheduleDependencies([a,b],scheduleSource,[{page:a,field:scheduleBefore,value:[{pageId:"b"}]}]),/cycle/);
  b.properties.date={start:"2026-11-06T09:00:00",end:"2026-11-06T11:00:00",time_zone:"America/Los_Angeles"};
  assert.throws(()=>scheduleDependencies([a,b],scheduleSource,[{page:a,field:scheduleDate,value:{start:"2026-11-05",end:"2026-11-09"}}]),/timed or zoned/);
});

test("all eight timeline scales include leap dates and padded cross-month windows", () => {
  assert.equal(timelineScales.length,8);
  for (const [scale] of timelineScales) {
    const bounds=timelineViewport("2028-02-29",scale);
    assert.ok(bounds.start<"2028-02-29"); assert.ok(bounds.days>timelineWindow("2028-02-29",scale).days);
    assert.ok(bounds.dayWidth>0);
  }
  assert.equal(timelineWindow("2028-02-29","5-years").days,1826);
  assert.equal(timelineWindow("2028-02-29","bi-week").days,14);
  assert.equal(timelineWindow("2028-02-29","hours").dayWidth,1152);
});

test("dependencies preserve one forward value, project inverse relations, reject cycles and retain CAS recovery",async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"notdown-dependencies-")); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const vault=createVault(root); const snapshot=await vault.databases.create({title:"Dependencies"}), initial=snapshot.dataSources[0];
  const source=await vault.databases.updateSource(initial.id,{properties:[...initial.properties,
    {id:"before",key:"before",name:"Blocked by",type:"relation",localRelation:true,dependencyRole:"blockedBy"},
    {id:"after",key:"after",name:"Blocking",type:"relation",localRelation:true,dependencyRole:"blocking",inversePropertyId:"before"},
    {id:"people",key:"people",name:"Assign",type:"people"},
  ]},initial.revision);
  const a=await vault.databases.createRecord(source.id,{title:"Card 4"},source.revision);
  let b=await vault.databases.createRecord(source.id,{title:"Card 2"},source.revision);
  const before=source.properties.find(field=>field.id==="before")!, after=source.properties.find(field=>field.id==="after")!;
  b=await vault.databases.updateCell(source.id,b.id,{baseRevision:b.revision,schemaRevision:source.revision,propertyId:"before",value:[{pageId:a.id,title:a.title,custom:"preserved"}]});
  let current=await vault.databases.get(snapshot.database.id);
  assert.deepEqual(dependencyValue(a,after,source,current.pages),[{pageId:b.id,title:b.title}]);
  const rows=queryDatabase(current.pages,source,{...current.views[0],filters:[{propertyId:"after",operator:"is_not_empty"}]});
  assert.deepEqual(rows.map(page=>page.id),[a.id]);
  assert.deepEqual(relationIds(fieldValue(rows[0],after)),[b.id]);
  assert.equal(current.pages.find(page=>page.id===a.id)!.properties.after,undefined);
  await assert.rejects(vault.databases.updateCell(source.id,a.id,{baseRevision:a.revision,schemaRevision:source.revision,propertyId:"before",value:[{pageId:b.id}]}),/cycle/);
  await assert.rejects(vault.update(a.id,{properties:{before:[{pageId:b.id}]}},a.revision,source.revision),/cycle/);
  await assert.rejects(vault.databases.updateCell(source.id,a.id,{baseRevision:a.revision,schemaRevision:source.revision,propertyId:"before",value:[{pageId:"missing"}]}),/other records/);
  await assert.rejects(vault.databases.updateCell(source.id,a.id,{baseRevision:a.revision,schemaRevision:source.revision,propertyId:"after",value:[]}),/derived/);
  const edited=await vault.update(b.id,{body:"External edit"},b.revision);
  await assert.rejects(vault.databases.updateCell(source.id,b.id,{baseRevision:b.revision,schemaRevision:source.revision,propertyId:"before",value:[]}),/changed|conflict|modified/i);
  current=await vault.databases.get(snapshot.database.id);
  assert.equal(current.pages.find(page=>page.id===b.id)!.revision,edited.revision);
  assert.equal((current.pages.find(page=>page.id===b.id)!.properties.before as any[])[0].custom,"preserved");
});
