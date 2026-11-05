import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../server/vault.js";
import { databaseChart, databaseChartSeries, chartAggregate } from "../../src/features/databases/database-chart-model.js";
import { timelineEdit, timelineWindow } from "../../src/features/databases/database-timeline-model.js";
import { importNotionView } from "../../server/notion-view-import.js";
import type { DatabaseDataSource } from "../../src/features/databases/database-model.js";
import type { Page } from "../../src/shared/types.js";

const source: DatabaseDataSource = { id:"source", title:"Tasks", revision:"", properties:[
  {id:"title",key:"title",name:"Name",type:"title"},
  {id:"state",key:"state",name:"Status",type:"status",options:[{id:"todo",name:"To do"},{id:"done",name:"Done"},{id:"empty",name:"Empty"}]},
  {id:"amount",key:"amount",name:"Amount",type:"number"},
  {id:"date",key:"date",name:"Date",type:"date",notion:{id:"remote-date"}},
  {id:"tags",key:"tags",name:"Tags",type:"multi_select",options:[{id:"a",name:"A"},{id:"b",name:"B"}]},
] };
const page = (id: string, properties: Record<string,unknown>): Page => ({ id,title:id,properties,body:"",updated:"",revision:"",icon:"",parent:null,dataSourceId:source.id });
test("chart aggregates typed numbers, empty options, negative and zero values without counting missing values in averages", () => {
  const rows = [page("A",{state:"todo",amount:0}),page("B",{state:"todo",amount:10}),page("C",{state:"done",amount:-4}),page("D",{state:"todo"}),page("E",{state:"done",amount:"20"})];
  assert.deepEqual(databaseChart(rows,source,{chartGroupBy:"state",chartValueId:"amount",chartAggregation:"sum"}).map(g=>[g.label,g.value]),[["To do",10],["Done",-4],["Empty",0]]);
  assert.equal(chartAggregate(rows,source.properties[2],"average"),2);
  assert.equal(chartAggregate(rows,source.properties[2],"min"),-4);
  assert.equal(chartAggregate(rows,source.properties[2],"max"),10);
  assert.deepEqual(databaseChart(rows,source,{chartGroupBy:"state",chartOmitZero:true,chartSort:"ascending"}).map(g=>g.value),[2,3]);
  assert.equal(databaseChart(Array.from({length:125},(_,i)=>page(String(i),{})),source,{})[0].value,125);
});
test("chart date buckets cross year boundaries and multi-select groups deduplicate records per category", () => {
  const rows = [page("A",{date:{start:"2027-01-01"},tags:["a","a","b"]}),page("B",{date:{start:"2026-12-31"}})];
  const groups = databaseChart(rows,source,{chartGroupBy:"date",chartDateBucket:"week"});
  assert.deepEqual(groups.map(g=>[g.label,g.value]),[["2026-12-28",2]]);
  assert.deepEqual(databaseChart(rows,source,{chartGroupBy:"tags"}).map(g=>[g.label,g.value]),[["A",1],["B",1],["No Tags",1]]);
});

test("chart series retain exact intersections, averages and cumulative record provenance", () => {
  const rows = [page("A",{state:"todo", date:{start:"2026-01-01"}, amount:10, tags:["a","a","b"]}), page("B",{state:"done", date:{start:"2026-01-01"}, amount:30, tags:["a"]}), page("C",{state:"todo", date:{start:"2026-01-02"}, amount:-4, tags:["b"]}), page("D",{state:"todo", date:{start:"2026-01-02"}})];
  const grouped = databaseChartSeries(rows,source,{chartGroupBy:"state",chartSeriesBy:"tags",chartValueId:"amount",chartAggregation:"average"});
  assert.deepEqual(grouped.series.find(s=>s.key==="a")!.points.map(p=>p.value),[10,30,0]);
  assert.deepEqual(grouped.series.find(s=>s.key==="b")!.points[0].pages.map(p=>p.id),["A","C"]);
  assert.equal(grouped.series.find(s=>s.key==="b")!.points[0].value,3);
  const cumulative = databaseChartSeries(rows,source,{chartGroupBy:"date",chartSeriesBy:"state",chartValueId:"amount",chartAggregation:"sum",chartCumulative:true});
  assert.deepEqual(cumulative.series.find(s=>s.key==="todo")!.points.map(p=>p.value),[10,6]);
  assert.deepEqual(cumulative.series.find(s=>s.key==="todo")!.points[1].pages.map(p=>p.id),["A","C","D"]);
  const average = databaseChartSeries(rows,source,{chartGroupBy:"date",chartValueId:"amount",chartAggregation:"average",chartCumulative:true});
  assert.deepEqual(average.series[0].points.map(p=>p.value),[20,-4]);
  const donut = databaseChartSeries(rows,source,{chartType:"donut",chartGroupBy:"state",chartSeriesBy:"tags"});
  assert.equal(donut.series.length,1);
  assert.equal(chartAggregate(rows,source.properties[2],"sum"),36);
});

test("chart configuration validates series references and persists style options without bypassing CAS", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"notdown-chart-")); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const vault = createVault(root); let snapshot = await vault.databases.create({title:"Chart settings"});
  const ds = await vault.databases.updateSource(snapshot.dataSources[0].id,{properties:[...snapshot.dataSources[0].properties,...source.properties.slice(1)]},snapshot.dataSources[0].revision);
  snapshot = await vault.databases.get(snapshot.database.id);
  snapshot = await vault.databases.createView(snapshot.database.id,{name:"Series",type:"chart",layout:{chartGroupBy:"date",chartSeriesBy:"state",chartHeight:"large",chartSmooth:true,chartArea:true,chartLegend:false,chartCumulative:true,future:{keep:true}}},snapshot.database.revision);
  const chart = snapshot.views.at(-1)!;
  const saved = await vault.databases.updateView(chart.id,{layout:{...chart.layout,chartGrid:false}},chart.revision);
  await assert.rejects(vault.databases.updateView(chart.id,{layout:{...chart.layout,chartGrid:true}},chart.revision),/changed/);
  const reloaded = (await createVault(root).databases.get(snapshot.database.id)).views.at(-1)!;
  assert.equal(reloaded.layout?.chartGrid,false); assert.equal(reloaded.layout?.chartSeriesBy,"state"); assert.deepEqual(reloaded.layout?.future,{keep:true});
  for (const patch of [{chartSeriesBy:"missing"},{chartHeight:"huge"},{chartGrid:"yes"},{chartCumulative:1}]) await assert.rejects(vault.databases.updateView(chart.id,{layout:{...saved.layout,...patch} as any},saved.revision));
  await assert.rejects(vault.databases.updateSource(ds.id,{properties:ds.properties.filter(p=>p.id!=="state")},ds.revision),/references from views/);
  await assert.rejects(vault.databases.updateSource(ds.id,{properties:ds.properties.map(p=>p.id==="state"?{...p,type:"files"}:p)},ds.revision),/series property/);
});
test("timeline bounds and edits preserve ranges, null ends, unknown fields and reject timed or zoned writes", () => {
  assert.deepEqual(timelineWindow("2028-02-20","month"),{start:"2028-02-01",days:29,dayWidth:36});
  assert.equal(timelineWindow("2028-12-31","year").days,366);
  assert.equal(timelineWindow("2027-01-01","week").start,"2026-12-28");
  assert.deepEqual(timelineEdit({start:"2028-02-28",end:"2028-02-29",custom:1},1,"move"),{start:"2028-02-29",end:"2028-03-01",custom:1});
  assert.deepEqual(timelineEdit({start:"2028-02-28",end:null},1,"move"),{start:"2028-02-29",end:null});
  assert.equal(timelineEdit({start:"2028-02-28",end:"2028-02-29"},2,"start"),undefined);
  assert.deepEqual(timelineEdit({start:"2028-02-28"},2,"end"),{start:"2028-02-28",end:"2028-03-01"});
  for (const value of [{start:"2028-02-28T12:00:00Z"},{start:"2028-02-28",time_zone:"UTC"},{start:"2028-02-30"}]) assert.equal(timelineEdit(value,1,"move"),undefined);
});
test("advanced views persist across vault reloads with CAS, schema reference protection and future fields", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"notdown-advanced-")); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const vault = createVault(root); let snapshot = await vault.databases.create({title:"Advanced views"});
  const ds = await vault.databases.updateSource(snapshot.dataSources[0].id,{properties:[...snapshot.dataSources[0].properties,...source.properties.slice(1)]},snapshot.dataSources[0].revision);
  snapshot = await vault.databases.get(snapshot.database.id);
  for (const type of ["timeline","chart","feed"] as const) snapshot = await vault.databases.createView(snapshot.database.id,{type,name:type,layout:{datePropertyId:"date",timelineScale:"quarter",chartGroupBy:"state",chartValueId:"amount",chartAggregation:"sum",chartType:"line",feedContent:"full",future:{keep:true}}},snapshot.database.revision);
  const reloaded = await createVault(root).databases.get(snapshot.database.id); assert.deepEqual(reloaded.views.map(v=>v.type),["table","timeline","chart","feed"]);
  const current = reloaded.views[2]; const saved = await vault.databases.updateView(current.id,{name:"Updated chart"},current.revision); assert.deepEqual(saved.layout?.future,{keep:true});
  await assert.rejects(vault.databases.updateView(current.id,{name:"Stale"},current.revision),/changed/);
  for (const layout of [{chartType:"pie"},{chartGroupBy:"missing"},{chartValueId:"state"},{chartValueId:"",chartAggregation:"sum"},{timelineScale:"hour"},{feedCover:"yes"},{chartDateBucket:"quarter"}]) await assert.rejects(vault.databases.updateView(current.id,{layout:layout as any},saved.revision));
  await assert.rejects(vault.databases.updateSource(ds.id,{properties:ds.properties.filter(p=>p.id!=="amount")},ds.revision),/references from views/);
  await assert.rejects(vault.databases.updateSource(ds.id,{properties:ds.properties.map(p=>p.id==="amount"?{...p,type:"text"}:p)},ds.revision),/numeric property/);
});
test("Notion advanced view imports retain raw configuration and report unmapped semantics", () => {
  for (const type of ["timeline","chart","feed"]) { const raw={type,configuration:{date_property_id:"remote-date",custom:{keep:true}}}; const result=importNotionView(raw,source.properties,"source"); assert.equal(result.type,type); assert.deepEqual(result.notion,raw); assert.ok(result.importWarnings.length); }
});
