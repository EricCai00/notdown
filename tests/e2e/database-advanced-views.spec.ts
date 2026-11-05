import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function fixture(request: APIRequestContext) {
  const snapshot = await (await request.post("/api/databases",{data:{title:"Product launch"}})).json();
  const ds = snapshot.dataSources[0];
  const fields = [...ds.properties,{id:"status",key:"status",name:"Status",type:"status",options:[{id:"todo",name:"Planned",color:"blue"},{id:"done",name:"Complete",color:"green"}]},{id:"due",key:"due",name:"Schedule",type:"date"},{id:"budget",key:"budget",name:"Budget",type:"number"}];
  const schema = await (await request.put(`/api/data-sources/${ds.id}`,{data:{baseRevision:ds.revision,properties:fields}})).json();
  const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-10`;
  const records = [];
  for (const [i,title] of ["Research & discovery","Design review","Release notes"].entries()) {
    const response = await request.post(`/api/data-sources/${ds.id}/records`,{data:{baseRevision:schema.revision,title,properties:{status:i===2?"done":"todo",budget:i===0?0:i===1?120:80,due:{start:day,end:day.slice(0,8)+String(12+i)}}}}); expect(response.ok()).toBeTruthy();
    let record = await response.json(); const body = `## ${title}\n\nA **shared update** for the team.\n\n- Confirm the scope\n- Review the next milestone\n\n> Keep the original Markdown source.\n\n<script>window.feedUnsafe = true</script>\n`;
    record = await (await request.put(`/api/pages/${record.id}`,{data:{baseRevision:record.revision,body}})).json(); records.push(record);
  }
  return {snapshot,schema,records,day};
}
async function create(page: Page, name: string) { await page.getByRole("button",{name:"New view",exact:true}).click(); await page.getByRole("dialog",{name:"New view",exact:true}).getByRole("button",{name,exact:true}).click(); await page.getByRole("button",{name:"Create view",exact:true}).click(); await expect(page.locator(`.database-layout-${name.toLowerCase()}`)).toBeVisible(); }
async function layout(page: Page) { await page.getByRole("button",{name:"View settings",exact:true}).click(); await page.getByRole("dialog",{name:"View settings",exact:true}).getByRole("button",{name:/^Layout/}).click(); return page.getByRole("dialog",{name:"Layout",exact:true}); }
async function choose(page: Page, label: string, value: string) {
  if (label === "Chart type") { await page.getByRole("group", { name: label, exact: true }).getByRole("button", { name: value, exact: true }).click(); return; }
  await page.getByRole("dialog",{name:"Layout",exact:true}).getByRole("button",{name:new RegExp(`^${label}`)}).click(); await page.getByRole("dialog",{name:label,exact:true}).getByRole("button",{name:value,exact:true}).click();
}

test("timeline date movement, resize, persisted scale and conflict recovery",async ({page,request},info)=>{
  const data=await fixture(request); await page.goto(`/#database/${data.snapshot.database.id}`); await create(page,"Timeline");
  const first=page.locator(`.database-timeline-row[data-page-id="${data.records[0].id}"]`), bar=first.locator(".database-timeline-open"); await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS("display","block");
  const box=(await bar.boundingBox())!; await page.mouse.move(box.x+box.width/2,box.y+14); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+36,box.y+14,{steps:5}); await page.mouse.up();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[0].id}`)).json()).properties.due.start).toBe(data.day.slice(0,8)+"11");
  const resize=first.getByRole("button",{name:/Adjust end date/}); await resize.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[0].id}`)).json()).properties.due.end).toBe(data.day.slice(0,8)+"14");
  await layout(page); await choose(page,"Time scale","Quarter"); await page.getByRole("dialog",{name:"Layout",exact:true}).getByRole("button",{name:"Close",exact:true}).click(); await page.reload(); await expect(page.getByRole("button",{name:"Time scale",exact:true})).toHaveText("Quarter");
  await page.screenshot({path:info.outputPath("timeline.png"),fullPage:true});
  const latest=await (await request.get(`/api/pages/${data.records[0].id}`)).json(); await request.put(`/api/pages/${latest.id}`,{data:{baseRevision:latest.revision,body:"External edit"}});
  await first.locator(".database-timeline-open").focus(); await page.keyboard.press("Alt+ArrowRight"); await expect(page.locator(".database-message").first()).toContainText("Edits remain in this tab");
  expect((await (await request.get(`/api/pages/${latest.id}`)).json()).body).toBe("External edit");
});

test("chart aggregation, five styles, drilldown and feed preview share records",async({page,request},info)=>{
  test.setTimeout(90000); const data=await fixture(request); await page.goto(`/#database/${data.snapshot.database.id}`); await create(page,"Chart");
  await expect(page.locator(".database-chart-mark")).toHaveCount(2);
  await layout(page); await choose(page,"Measure","Budget"); await choose(page,"Chart type","Horizontal bar"); await page.getByRole("dialog",{name:"Layout",exact:true}).getByRole("button",{name:"Close",exact:true}).click();
  await page.getByRole("button",{name:"Planned: 120",exact:true}).click(); await expect(page.locator(".database-chart-records tbody tr")).toHaveCount(2); await page.getByRole("button",{name:"Close",exact:true}).click();
  for (const type of ["Line chart","Donut","Number","Vertical bar"]) { await layout(page); await choose(page,"Chart type",type); await page.getByRole("dialog",{name:"Layout",exact:true}).getByRole("button",{name:"Close",exact:true}).click(); if(type==="Number") await expect(page.locator(".database-chart-number")).toHaveText("200"); else await expect(page.locator(".database-chart-mark")).toHaveCount(2); }
  await page.screenshot({path:info.outputPath("chart.png"),fullPage:true});
  await create(page,"Feed"); await expect(page.locator(".database-feed-content strong")).toHaveCount(3); expect(await page.evaluate(()=>!!(window as any).feedUnsafe)).toBe(false);
  await page.screenshot({path:info.outputPath("feed.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844}); await expect(page.locator(".database-layout-feed")).toBeVisible(); await page.screenshot({path:info.outputPath("feed-narrow.png"),fullPage:true});
  await page.reload(); await expect(page.locator(".database-feed-content")).toHaveCount(3);
  for(const record of data.records) expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(record.body);
});

test("inline charts aggregate past the load limit, honor filters and retain language routing",async({page,request},info)=>{
  test.setTimeout(90000); const data=await fixture(request);
  for(let i=0;i<27;i++) expect((await request.post(`/api/data-sources/${data.schema.id}/records`,{data:{baseRevision:data.schema.revision,title:`Task ${i}`,properties:{status:"todo"}}})).ok()).toBeTruthy();
  let snapshot=await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json();
  snapshot=await (await request.post(`/api/databases/${snapshot.database.id}/views`,{data:{baseRevision:snapshot.database.revision,type:"chart",name:"Counts",layout:{chartType:"number",loadLimit:25}}})).json();
  const chart=snapshot.views.find((view:any)=>view.name==="Counts");
  const parent=await (await request.post("/api/pages",{data:{title:"Launch dashboard",syntax:{version:1,variant:"notdown",extensions:{}},body:`Before\n\n<database url="#page/${snapshot.database.id}" inline="true"></database>\n\nAfter\n`}})).json();
  await page.goto(`/#page/${parent.id}`); const inline=page.getByRole("region",{name:"Inline database",exact:true});
  await inline.getByRole("tab",{name:"Counts",exact:true}).click(); await expect(inline.locator(".database-chart-number")).toHaveText("30"); await expect(inline.locator(".database-load-more")).toHaveCount(0);
  await inline.locator(".database-chart-number").click(); await expect(inline.locator(".database-chart-records tbody tr")).toHaveCount(30);
  const updated=await request.put(`/api/database-views/${chart.id}`,{data:{baseRevision:chart.revision,filters:[{propertyId:"status",operator:"equals",value:"done"}]}}); expect(updated.ok()).toBeTruthy();
  await page.reload(); await expect(inline.locator(".database-chart-number")).toHaveText("1");
  await page.evaluate(()=>localStorage.setItem("notdown-ui-language","zh-CN")); await page.reload();
  await expect(page.getByRole("button",{name:"配置图表",exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("inline-chart-chinese.png"),fullPage:true});
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(parent.body);
});

test("Wiki picker creates and switches advanced layouts without replacing Home",async({page,request})=>{
  const home=await (await request.post("/api/pages",{data:{title:"Team knowledge",body:"Keep this Home"}})).json();
  const child=await (await request.post("/api/pages",{data:{title:"Release update",body:"## Update\n\nShared knowledge",parent:home.id}})).json();
  const current=await (await request.get(`/api/pages/${home.id}`)).json();
  const conversion=await request.post(`/api/pages/${home.id}/wiki`,{data:{baseRevision:current.revision}}); expect(conversion.ok()).toBeTruthy();
  await page.goto(`/#database/${home.id}`);
  for (const type of ["Timeline","Chart","Feed"]) { await page.locator(".wiki-view-trigger").click(); await create(page,type); await expect(page.locator(".wiki-view-trigger")).toHaveText(type); }
  await expect(page.locator(".database-feed-content")).toContainText("Shared knowledge");
  await page.locator(".wiki-view-trigger").click(); await page.getByRole("menuitemradio",{name:"Home",exact:true}).click(); await expect(page.locator(".pm-document").first()).toContainText("Keep this Home");
  expect((await (await request.get(`/api/pages/${child.id}`)).json()).body).toBe(child.body);
});
