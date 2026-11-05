import { test, expect, type APIRequestContext } from "@playwright/test";

async function fixture(request: APIRequestContext, dependencies = true) {
  let snapshot=await (await request.post("/api/databases",{data:{title:"Database 1"}})).json();
  const initial=snapshot.dataSources[0];
  const pair=dependencies?[
    {id:"before",key:"before",name:"Blocked by",type:"relation",localRelation:true,dependencyRole:"blockedBy"},
    {id:"after",key:"after",name:"Blocking",type:"relation",localRelation:true,dependencyRole:"blocking",inversePropertyId:"before"},
  ]:[];
  const source=await (await request.put(`/api/data-sources/${initial.id}`,{data:{baseRevision:initial.revision,properties:[...initial.properties,{id:"date",key:"date",name:"Date",type:"date"},{id:"assign",key:"assign",name:"Assign",type:"people"},...pair]}})).json();
  const records=[];
  for (const [title,start,end] of [["Card 1","2026-10-29","2026-11-02"],["Card 3","2026-11-02","2026-11-06"],["Card 2","2026-11-02","2026-11-04"],["Card 4","2026-10-27","2026-10-31"]]) records.push(await (await request.post(`/api/data-sources/${source.id}/records`,{data:{baseRevision:source.revision,title,properties:{date:{start,end}}}})).json());
  if(dependencies) expect((await request.put(`/api/data-sources/${source.id}/records/${records[2].id}`,{data:{baseRevision:records[2].revision,schemaRevision:source.revision,propertyId:"before",value:[{pageId:records[3].id,title:"Card 4"}]}})).ok()).toBeTruthy();
  snapshot=await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  snapshot=await (await request.post(`/api/databases/${snapshot.database.id}/views`,{data:{baseRevision:snapshot.database.revision,name:"Timeline view",type:"timeline",rowOrder:records.map(r=>r.id),layout:{datePropertyId:"date"}}})).json();
  return {snapshot,source,records,timeline:snapshot.views.at(-1)};
}

test("Notion-style timeline shares dependencies, assignments, eight scales and local Calendar",async({page,request},info)=>{
  test.setTimeout(90000); const data=await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  // Older views may not have a saved table preference. Keep names on the cards by default.
  await expect(page.locator(".database-timeline-header .database-timeline-label")).toBeHidden();
  await expect(page.getByRole("button",{name:"Show table",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"View settings",exact:true}).click();
  await page.getByRole("dialog",{name:"View settings",exact:true}).getByRole("button",{name:/^Layout/}).click();
  const layout = page.getByRole("dialog",{name:"Layout",exact:true});
  await expect(layout.getByRole("switch",{name:"Show table",exact:true})).toHaveAttribute("aria-checked","false");
  await layout.getByRole("button",{name:"Close",exact:true}).click();
  const link=page.locator(`.database-timeline-links path[data-from="${data.records[3].id}"][data-to="${data.records[2].id}"]`);
  await expect(link).toHaveCount(1); await expect(page.locator(".database-timeline-today-badge")).toHaveText("3");
  await expect(page.locator(".database-timeline-bar").first()).toHaveCSS("border-radius","6px");
  await expect(page.locator(".database-timeline-open")).toHaveCount(4);
  await expect(page.getByRole("button",{name:"Open Card 2",exact:true})).toBeInViewport();
  const initialScroll = await page.locator(".database-timeline-scroll").evaluate(el => el.scrollLeft);
  await page.getByRole("button",{name:"Time scale",exact:true}).click();
  const menu=page.getByRole("dialog",{name:"Time scale",exact:true});
  for(const label of ["Hours","Day","Week","Bi-week","Month","Quarter","Year","5 Years"]) await expect(menu.getByRole("button",{name:label,exact:true})).toBeVisible();
  expect(await page.locator(".database-timeline-scroll").evaluate(el => el.scrollLeft)).toBe(initialScroll);
  await expect(page.getByRole("button",{name:"Open Card 2",exact:true})).toBeInViewport();
  await page.screenshot({path:info.outputPath("timeline-month-menu.png"),fullPage:true});
  await page.keyboard.press("Escape");
  for(const label of ["Hours","Day","Week","Bi-week","Quarter","Year","5 Years","Month"]) {
    await page.getByRole("button",{name:"Time scale",exact:true}).click(); await page.getByRole("dialog",{name:"Time scale",exact:true}).getByRole("button",{name:label,exact:true}).click();
    await expect(page.getByRole("button",{name:"Time scale",exact:true})).toHaveText(label);
  }
  await page.reload(); await expect(page.getByRole("button",{name:"Time scale",exact:true})).toHaveText("Month");
  await page.getByRole("button",{name:"Show table",exact:true}).click(); await expect(page.getByRole("button",{name:"Hide table",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator(".database-timeline-header .database-timeline-label")).toHaveText("Name");
  await expect(page.locator(".database-timeline-header .database-timeline-label")).toBeVisible();
  await page.getByRole("button",{name:"Hide table",exact:true}).click();
  await expect(page.getByRole("button",{name:"Show table",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator(".database-timeline-header .database-timeline-label")).toBeHidden();
  await page.getByRole("tab",{name:"Table",exact:true}).click();
  await expect(page.getByRole("button",{name:"Blocking: Card 4",exact:true})).toContainText("Card 2");
  const person=await (await request.post("/api/people",{data:{name:"Maya demo"}})).json(); expect(person.id).toBeTruthy();
  await page.getByRole("button",{name:"Assign: Card 1",exact:true}).click(); await page.getByRole("option",{name:"Maya demo",exact:true}).click();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[0].id}`)).json()).properties.assign?.[0]?.id).toBe(person.id);
  await page.getByRole("button",{name:"Blocking: Card 4",exact:true}).click(); await page.getByRole("option",{name:"Card 1",exact:true}).click();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[0].id}`)).json()).properties.before?.[0]?.pageId).toBe(data.records[3].id);
  await page.getByRole("tab",{name:"Timeline view",exact:true}).click(); await expect(page.locator(".database-timeline-links path")).toHaveCount(2);
  await page.screenshot({path:info.outputPath("timeline-dependencies.png"),fullPage:true});
  await page.getByRole("button",{name:"Manage in Calendar",exact:true}).click(); await expect(page.locator(".database-layout-calendar")).toBeVisible();
  await expect(page.locator(".database-calendar-day[data-date='2026-11-02']")).toContainText("Card 2");
});

test("enable dependency fields, connect by dragging and preserve conflicting edits",async({page,request})=>{
  test.setTimeout(60000); const data=await fixture(request,false);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z")); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await page.getByRole("button",{name:"Dependencies",exact:true}).click();
  const connector=page.getByRole("button",{name:"Edit dependencies: Card 4",exact:true});
  await expect(connector).toHaveCount(1);
  const source=await (await request.get(`/api/data-sources/${data.source.id}`)).json(), forward=source.properties.find((field:any)=>field.dependencyRole==="blockedBy");
  const bar=page.locator(`.database-timeline-row[data-page-id='${data.records[3].id}'] .database-timeline-open`); await bar.hover();
  const from=(await connector.boundingBox())!, target=(await page.locator(`.database-timeline-row[data-page-id='${data.records[2].id}'] .database-timeline-open`).boundingBox())!;
  await page.mouse.move(from.x+8,from.y+9); await page.mouse.down(); await page.mouse.move(target.x+20,target.y+10,{steps:8}); await page.mouse.up();
  await expect(page.locator(".database-timeline-links path")).toHaveCount(1);
  const current=await (await request.get(`/api/pages/${data.records[2].id}`)).json();
  expect(current.properties[forward.key][0].pageId).toBe(data.records[3].id);
  await request.put(`/api/pages/${current.id}`,{data:{baseRevision:current.revision,body:"External draft"}});
  const open=page.locator(`.database-timeline-row[data-page-id='${current.id}'] .database-timeline-open`); await open.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".database-message").first()).toContainText("Edits remain in this tab");
  expect((await (await request.get(`/api/pages/${current.id}`)).json()).body).toBe("External draft");
});

test("connector draws a solid arrow under the pointer and creates a linked page on blank space", async ({page,request}, info) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await page.getByRole("button", {name:"Open Card 3", exact:true}).hover();
  const connector = page.getByRole("button", {name:"Edit dependencies: Card 3", exact:true});
  const from = (await connector.boundingBox())!;
  const day = (await page.locator('.database-timeline-tick[data-date="2026-11-12"]').boundingBox())!;
  const x = day.x + day.width/2, y = from.y + from.height/2;
  await page.mouse.move(from.x+12, y); await page.mouse.down(); await page.mouse.move(x,y,{steps:10});
  const preview = page.locator(".database-timeline-dependency-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS("stroke-dasharray", "none");
  await expect(page.locator(".is-dependency-target")).toHaveCount(0);
  const geometry = await preview.evaluate(el => {
    const path = el as SVGPathElement, svg = path.ownerSVGElement!;
    const point = path.getPointAtLength(path.getTotalLength()-Math.sqrt(61));
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
    return {x:screen.x, y:screen.y, width:svg.getBoundingClientRect().width};
  });
  expect(geometry.width).toBeGreaterThan(1000);
  expect(geometry.x).toBeCloseTo(x,0); expect(geometry.y).toBeCloseTo(y,0);
  await page.screenshot({path:info.outputPath("dependency-drag.png")});
  const scroller = page.locator(".database-timeline-scroll");
  const beforeScroll = await preview.getAttribute("d");
  await scroller.evaluate(el => { el.scrollLeft += 36; });
  await expect(preview).not.toHaveAttribute("d", beforeScroll!);
  await scroller.evaluate(el => { el.scrollLeft -= 36; });
  await expect(preview).toHaveAttribute("d", beforeScroll!);
  const oldPath = await preview.getAttribute("d");
  await page.mouse.move(x,y+6); await expect(preview).not.toHaveAttribute("d",oldPath!);
  await page.mouse.move(x,y);
  await page.mouse.up();
  const title = page.getByRole("textbox", {name:"Page title",exact:true});
  await expect(title).toBeFocused();
  const snapshot = await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json();
  const created = snapshot.pages.find((p:any) => !data.records.some(r => r.id === p.id));
  expect(created.title).toBe("Untitled");
  expect(created.properties.date).toEqual({start:"2026-11-12",end:"2026-11-16"});
  expect(created.properties.before[0].pageId).toBe(data.records[1].id);
  const link = page.locator(`.database-timeline-links path[data-from="${data.records[1].id}"][data-to="${created.id}"]`);
  await expect(link).toBeVisible();
  await page.screenshot({path:info.outputPath("dependency-new-page.png")});
  await title.fill("Created from a connector"); await title.press("Enter");
  await expect(page.getByRole("button", {name:"Open Created from a connector",exact:true})).toBeVisible();
  await page.reload(); await expect(link).toBeVisible();
  expect((await (await request.get(`/api/pages/${created.id}`)).json()).title).toBe("Created from a connector");
});

test("connector cancels on Escape or outside the timeline without creating records", async ({page,request}) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  for (const cancel of [true,false]) {
    await page.getByRole("button", {name:"Open Card 3",exact:true}).hover();
    const from = (await page.getByRole("button", {name:"Edit dependencies: Card 3",exact:true}).boundingBox())!;
    await page.mouse.move(from.x+12,from.y+10); await page.mouse.down();
    const viewport = (await page.locator(".database-timeline-scroll").boundingBox())!;
    await page.mouse.move(from.x+120,viewport.y+viewport.height+40,{steps:6});
    await expect(page.locator(".database-timeline-dependency-preview")).toBeVisible();
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".database-timeline-dependency-preview")).toHaveCount(0);
  }
  const snapshot = await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json();
  expect(snapshot.pages).toHaveLength(4);
  await expect(page.locator(".database-timeline-links path")).toHaveCount(1);
});

test("blank drops respect scheduling and retain a conflicting inline title draft", async ({page,request}) => {
  const data = await fixture(request);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await page.getByRole("button", {name:"Open Card 3",exact:true}).hover();
  const from = (await page.getByRole("button", {name:"Edit dependencies: Card 3",exact:true}).boundingBox())!;
  const day = (await page.locator('.database-timeline-tick[data-date="2026-11-03"]').boundingBox())!;
  const emptyRow = (await page.locator(".database-timeline-new").boundingBox())!;
  await page.mouse.move(from.x+12,from.y+10); await page.mouse.down();
  await page.mouse.move(day.x+18,emptyRow.y+emptyRow.height-2,{steps:8}); await page.mouse.up();
  const title = page.getByRole("textbox", {name:"Page title",exact:true}); await expect(title).toBeFocused();
  const snapshot = await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json();
  const created = snapshot.pages.find((p:any) => !data.records.some(r => r.id === p.id));
  expect(created.properties.date).toEqual({start:"2026-11-07",end:"2026-11-11"});
  const baseline = await (await request.get(`/api/pages/${created.id}`)).json();
  expect((await request.put(`/api/pages/${created.id}`,{data:{baseRevision:baseline.revision,body:"External notes"}})).ok()).toBeTruthy();
  await title.fill("My new task"); await title.press("Enter");
  await expect(page.locator(".database-message").first()).toContainText("Edits remain in this tab");
  const current = await (await request.get(`/api/pages/${created.id}`)).json();
  expect(current.title).toBe("Untitled"); expect(current.body).toBe("External notes");
  expect(await page.evaluate(() => Object.values(sessionStorage).some(value => value.includes("My new task")))).toBeTruthy();
});

test("long task titles stay visible, offscreen tasks can be reached and scrolling extends the date range",async({page,request},info)=>{
  const data=await fixture(request);
  for (const [title,start,end] of [["Long project","2026-10-01","2026-12-15"],["Future task","2026-12-28","2027-01-08"]]) {
    expect((await request.post(`/api/data-sources/${data.source.id}/records`,{data:{baseRevision:data.source.revision,title,properties:{date:{start,end}}}})).ok()).toBeTruthy();
  }
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z")); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await expect(page.locator('.database-timeline-bar-title').filter({hasText:"Long project"})).toBeInViewport();
  const scroller=page.locator('.database-timeline-scroll');
  await scroller.evaluate(el=>el.scrollLeft=60);
  await expect.poll(()=>scroller.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open Card 2',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'Jump to task: Future task',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open Future task',exact:true})).toBeInViewport();
  await page.setViewportSize({width:650,height:844});
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await page.screenshot({path:info.outputPath('timeline-narrow.png'),fullPage:true});
});

test("timeline hover, edge resize, diagonal movement and cancellation match direct manipulation",async({page,request},info)=>{
  const data=await fixture(request); const card=data.records[1];
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z")); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  const row=page.locator(`.database-timeline-row[data-page-id='${card.id}']`), bar=row.locator('.database-timeline-bar'), open=row.locator('.database-timeline-open');
  await open.hover(); await expect(page.locator('.database-timeline-range-highlight')).toBeVisible();
  await expect(page.locator('.database-timeline-range-highlight')).toHaveAttribute('data-start','2026-11-02');
  await expect(row.locator('.database-timeline-connector')).toHaveCSS('opacity','1');
  await page.screenshot({path:info.outputPath('timeline-hover.png'),fullPage:true});
  const end=row.getByRole('button',{name:'Adjust end date: Card 3',exact:true}); await end.hover();
  await expect(row.getByRole('tooltip')).toHaveAttribute('data-date','2026-11-06');
  const edge=(await end.boundingBox())!;
  await page.mouse.move(edge.x+3,edge.y+10); await page.mouse.down(); await page.mouse.move(edge.x+39,edge.y+10,{steps:5});
  await expect(bar).toHaveClass(/is-resizing/); await expect(row.getByRole('tooltip')).toHaveAttribute('data-date','2026-11-07');
  await page.screenshot({path:info.outputPath('timeline-resize.png'),fullPage:true}); await page.mouse.up();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${card.id}`)).json()).properties.date.end).toBe('2026-11-07');
  await expect(bar).not.toHaveClass(/is-resizing/);
  const box=(await open.boundingBox())!, first=(await page.locator(`.database-timeline-row[data-page-id='${data.records[0].id}']`).boundingBox())!;
  await page.mouse.move(box.x+25,box.y+18); await page.mouse.down(); await page.mouse.move(box.x+97,first.y+4,{steps:8});
  await expect(bar).toHaveClass(/is-dragging/); await expect(page.locator('.database-timeline-insertion')).toBeVisible();
  await expect(page.locator('.database-timeline-range-highlight')).toHaveAttribute('data-start','2026-11-04');
  await page.screenshot({path:info.outputPath('timeline-reorder-drag.png'),fullPage:true}); await page.mouse.up();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${card.id}`)).json()).properties.date.start).toBe('2026-11-04');
  await expect.poll(async()=> (await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json()).views.find((view:any)=>view.id===data.timeline.id).rowOrder[0]).toBe(card.id);
  await page.reload(); await expect(page.locator('.database-timeline-row[data-page-id]').first()).toHaveAttribute('data-page-id',card.id);
  const before=await (await request.get(`/api/pages/${card.id}`)).json(); const cancelBox=(await open.boundingBox())!;
  await page.mouse.move(cancelBox.x+20,cancelBox.y+18); await page.mouse.down(); await page.mouse.move(cancelBox.x+92,cancelBox.y+18,{steps:5}); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(bar).not.toHaveClass(/is-dragging/); await expect(page.locator('.database-peek-mount')).toBeHidden();
  expect((await (await request.get(`/api/pages/${card.id}`)).json()).revision).toBe(before.revision);
});

test("connecting Card 3 to Card 4 schedules Card 4 and Card 2, including filtered successors",async({page,request},info)=>{
  const data=await fixture(request);
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z')); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  const row=page.locator(`.database-timeline-row[data-page-id='${data.records[1].id}']`); await row.locator('.database-timeline-open').hover();
  const from=(await row.locator('.database-timeline-connector').boundingBox())!, to=(await page.getByRole('button',{name:'Open Card 4',exact:true}).boundingBox())!;
  await page.mouse.move(from.x+10,from.y+10); await page.mouse.down(); await page.mouse.move(to.x+30,to.y+18,{steps:8});
  await expect(page.locator('.database-timeline-dependency-preview')).toHaveCount(1); await page.mouse.up();
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[2].id}`)).json()).properties.date.start).toBe('2026-11-12');
  expect((await (await request.get(`/api/pages/${data.records[3].id}`)).json()).properties.date).toEqual({start:'2026-11-07',end:'2026-11-11'});
  await expect(page.locator('.database-timeline-links path')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('timeline-auto-schedule.png'),fullPage:true});
  await page.getByRole('button',{name:'Search database',exact:true}).click(); await page.getByRole('searchbox',{name:'Search database records',exact:true}).fill('Card 3');
  await expect(page.getByRole('button',{name:'Open Card 2',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open Card 3',exact:true}).focus(); await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[2].id}`)).json()).properties.date.start).toBe('2026-11-13');
  await page.getByRole('button',{name:'Dependencies',exact:true}).click(); await page.getByRole('button',{name:'Do not shift automatically',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Dependencies',exact:true})).toHaveCount(0);
  await expect.poll(async()=> (await (await request.get(`/api/data-sources/${data.source.id}`)).json()).dependencyAutoShift).toBe(false);
  await page.getByRole('button',{name:'Open Card 3',exact:true}).focus(); await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[1].id}`)).json()).properties.date.start).toBe('2026-11-04');
  expect((await (await request.get(`/api/pages/${data.records[2].id}`)).json()).properties.date.start).toBe('2026-11-13');
});

test("dependency schedule conflicts retain the downstream draft and external body",async({page,request})=>{
  const data=await fixture(request); const downstream=await (await request.get(`/api/pages/${data.records[2].id}`)).json();
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z')); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  await expect(page.getByRole('button',{name:'Open Card 2',exact:true})).toBeVisible();
  await request.put(`/api/pages/${downstream.id}`,{data:{baseRevision:downstream.revision,body:'Concurrent downstream notes'}});
  await page.getByRole('button',{name:'Open Card 4',exact:true}).hover();
  await page.getByRole('button',{name:'Edit dependencies: Card 4',exact:true}).click();
  await page.getByRole('dialog',{name:'Blocked by',exact:true}).getByRole('button',{name:'Blocked by: Card 4',exact:true}).click();
  await page.getByRole('option',{name:'Card 3',exact:true}).click();
  await expect(page.locator('.database-message').first()).toContainText('Edits remain in this tab');
  const unchanged=await (await request.get(`/api/pages/${downstream.id}`)).json();
  expect(unchanged.body).toBe('Concurrent downstream notes'); expect(unchanged.properties.date.start).toBe('2026-11-02');
  const drafts=await page.evaluate(()=>Object.values(sessionStorage).filter(value=>value.includes('2026-11-12'))); expect(drafts.length).toBeGreaterThan(0);
});

test("vertical drop keeps a recoverable row-order draft if another window changes the view",async({page,request})=>{
  const data=await fixture(request), card=data.records[1];
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z')); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.timeline.id}`);
  const open=page.getByRole('button',{name:'Open Card 3',exact:true}); await expect(open).toBeVisible();
  expect((await request.put(`/api/database-views/${data.timeline.id}`,{data:{baseRevision:data.timeline.revision,name:'Other window'}})).ok()).toBeTruthy();
  const box=(await open.boundingBox())!, first=(await page.locator('.database-timeline-row[data-page-id]').first().boundingBox())!;
  await page.mouse.move(box.x+20,box.y+18); await page.mouse.down(); await page.mouse.move(box.x+20,first.y+3,{steps:6}); await page.mouse.up();
  await expect(page.locator('.database-message').first()).toContainText('row order draft is preserved');
  const snapshot=await (await request.get(`/api/databases/${data.snapshot.database.id}`)).json(), saved=snapshot.views.find((view:any)=>view.id===data.timeline.id);
  expect(saved.name).toBe('Other window'); expect(saved.rowOrder[0]).toBe(data.records[0].id);
  await page.reload(); await expect(page.locator('.database-message').first()).toContainText('row order draft is preserved');
  const drafts=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.endsWith(':row-order')).map(([,value])=>JSON.parse(value)));
  expect(drafts[0].rowOrder[0]).toBe(card.id);
});
