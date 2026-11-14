import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function settings(page: Page) {
  await page.getByRole("button",{name:"View settings",exact:true}).click();
  await page.getByRole("dialog",{name:"View settings",exact:true}).getByRole("button",{name:"Sub-items",exact:true}).click();
  return page.getByRole("dialog",{name:"Sub-items",exact:true});
}
async function addChild(page: Page, parent: string, title: string) {
  await page.getByRole("button",{name:`New sub-item: ${parent}`,exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Add row",exact:true});
  await dialog.getByRole("textbox",{name:"Row title",exact:true}).fill(title);
  await dialog.getByRole("button",{name:"Create row",exact:true}).click();
  await expect(dialog).toBeHidden();
}
async function create(request:APIRequestContext) {
  const snapshot=await (await request.post("/api/databases",{data:{title:"Tasks"}})).json();
  const source=snapshot.dataSources[0];
  const root=await(await request.post(`/api/data-sources/${source.id}/records`,{data:{baseRevision:source.revision,title:"Parent task"}})).json();
  return {snapshot,source,root};
}
test("sub-items are opt-in, empty toggles appear on hover, nested creation and disabling preserve relations",async({page,request},info)=>{
  test.setTimeout(60000);const {snapshot,source,root}=await create(request);
  await page.goto(`/#database/${snapshot.database.id}`);
  await expect(page.getByRole("textbox",{name:"Name: Parent task",exact:true})).toBeVisible();
  await expect(page.locator(".database-subitem-toggle")).toHaveCount(0);
  await (await settings(page)).getByRole("button",{name:"Turn on sub-items",exact:true}).click();
  const arrow=page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true});
  await expect(arrow).toHaveCount(1);await page.mouse.move(10,10);await expect(arrow).toHaveCSS("opacity","0");
  await expect(arrow).toHaveCSS("color","rgb(153, 152, 148)");
  await page.locator(`tr[data-page-id="${root.id}"]`).hover();await expect(arrow).toHaveCSS("opacity","1");await arrow.click();
  await expect(page.getByRole("button",{name:"New sub-item: Parent task",exact:true})).toBeVisible();
  await page.mouse.move(10,10);await expect(page.getByRole("button",{name:"Collapse sub-items: Parent task",exact:true})).toHaveCSS("color","rgb(55, 53, 47)");
  await addChild(page,"Parent task","Child task");
  await page.getByRole("button",{name:"Expand sub-items: Child task",exact:true}).click();await addChild(page,"Child task","Grandchild task");
  await expect(page.locator('tr[data-subitem-depth="2"]')).toContainText("OPEN");
  await page.mouse.move(10,10);await expect(page.getByRole("button",{name:"Collapse sub-items: Parent task",exact:true})).toHaveCSS("opacity","1");
  await page.screenshot({path:info.outputPath("subitems-table.png"),fullPage:true});
  await page.getByRole("button",{name:"Collapse sub-items: Parent task",exact:true}).click();
  await page.mouse.move(10,10);await expect(page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true})).toHaveCSS("opacity","1");
  await expect(page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true})).toHaveCSS("color","rgb(55, 53, 47)");
  await expect(page.getByRole("textbox",{name:"Name: Child task",exact:true})).toBeHidden();
  await (await settings(page)).getByRole("combobox",{name:"Display options",exact:true}).selectOption("flat");
  await expect(page.locator(".database-subitem-toggle")).toHaveCount(0);
  await expect(page.getByRole("textbox",{name:"Name: Grandchild task",exact:true})).toBeVisible();
  await expect(page.locator(`tr[data-page-id="${root.id}"] .database-subitem-summary`)).toHaveText("↳ 1");
  await (await settings(page)).getByRole("combobox",{name:"Include",exact:true}).selectOption("parents");
  await expect(page.getByRole("textbox",{name:"Name: Child task",exact:true})).toBeHidden();
  await expect(page.getByRole("textbox",{name:"Name: Parent task",exact:true})).toBeVisible();
  await (await settings(page)).getByRole("combobox",{name:"Include",exact:true}).selectOption("children");
  await expect(page.getByRole("textbox",{name:"Name: Parent task",exact:true})).toBeHidden();
  await expect(page.getByRole("textbox",{name:"Name: Child task",exact:true})).toBeVisible();
  await (await settings(page)).getByRole("combobox",{name:"Display options",exact:true}).selectOption("disabled");
  await expect(page.getByRole("textbox",{name:"Name: Parent task",exact:true})).toBeVisible();
  await expect(page.locator(".database-subitem-summary")).toHaveCount(0);
  expect((await(await request.get(`/api/databases/${snapshot.database.id}`)).json()).dataSources[0].subitems.enabled).toBe(true);
  const before=await(await request.get(`/api/databases/${snapshot.database.id}`)).json();
  await (await settings(page)).getByRole("button",{name:"Turn off sub-items",exact:true}).click();
  await page.reload();await expect(page.locator(".database-subitem-toggle")).toHaveCount(0);
  await expect(page.getByRole("textbox",{name:"Name: Child task",exact:true})).toBeVisible();
  const after=await(await request.get(`/api/databases/${snapshot.database.id}`)).json();
  expect(after.dataSources[0].subitems.enabled).toBe(false);expect(after.pages.map((p:any)=>p.properties)).toEqual(before.pages.map((p:any)=>p.properties));
  expect(after.dataSources[0].properties.length).toBe(source.properties.length+2);
});

test("timeline uses hierarchy toggles and rounded parent connectors without dependency arrowheads",async({page,request},info)=>{
  const {snapshot,source}=await create(request);
  const schema=await(await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:source.revision,properties:[...source.properties,{id:"date",key:"date",name:"Dates",type:"date"},{id:"parent",key:"parent",name:"Parent item",type:"relation",localRelation:true,subitemRole:"parent"},{id:"children",key:"children",name:"Sub-item",type:"relation",readOnly:true,subitemRole:"children",inversePropertyId:"parent"}],subitems:{enabled:true,parentPropertyId:"parent",childrenPropertyId:"children"}}})).json();
  let parent:any;for(const [title,start,end] of [["A","2026-11-10","2026-11-13"],["B","2026-11-12","2026-11-17"],["C","2026-11-14","2026-11-19"]]) parent=await(await request.post(`/api/data-sources/${source.id}/records`,{data:{baseRevision:schema.revision,title,properties:{date:{start,end},...(parent?{parent:[{pageId:parent.id}]}:{})}}})).json();
  const updated=await(await request.put(`/api/database-views/${snapshot.views[0].id}`,{data:{baseRevision:snapshot.views[0].revision,type:"timeline",layout:{datePropertyId:"date"}}})).json();expect(updated.type).toBe("timeline");
  await page.clock.setFixedTime(new Date("2026-11-14T12:00:00Z"));await page.goto(`/#database/${snapshot.database.id}`);
  await page.mouse.move(10,10);
  await expect(page.getByRole("button",{name:"Expand sub-items: A",exact:true})).toHaveCSS("color","rgb(55, 53, 47)");
  await page.getByRole("button",{name:"Expand sub-items: A",exact:true}).click();
  await page.getByRole("button",{name:"Expand sub-items: B",exact:true}).click();
  await expect(page.locator(".database-subitem-link")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"New sub-item: A",exact:true})).toBeVisible();
  await expect(page.locator('.database-timeline-subitem-preview:not([hidden])')).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Expand sub-items: C",exact:true})).toHaveCSS("opacity","1");
  await expect(page.getByRole("button",{name:"Expand sub-items: C",exact:true})).toHaveCSS("color","rgb(153, 152, 148)");
  await expect(page.getByRole("button",{name:"Open C",exact:true})).toBeVisible();
  const positions=await page.locator('.database-timeline-bar').evaluateAll(bars=>bars.map(bar=>{const toggle=bar.querySelector('.database-subitem-toggle')!.getBoundingClientRect(),open=bar.querySelector('.database-timeline-open')!.getBoundingClientRect();return Math.abs(toggle.top-open.top)<10 && toggle.right<=open.left+2;}));expect(positions.every(Boolean)).toBeTruthy();
  await page.screenshot({path:info.outputPath("subitems-timeline.png"),fullPage:true});
  await page.getByRole("button",{name:"Collapse sub-items: A",exact:true}).click();await expect(page.getByRole("button",{name:"Open C",exact:true})).toHaveCount(0);await expect(page.locator(".database-subitem-link")).toHaveCount(0);
});

test("timeline empty sub-item lanes preview the hovered date and create a nested record there",async({page,request},info)=>{
  const {snapshot,source,root}=await create(request);
  const schema=await(await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:source.revision,properties:[...source.properties,{id:"date",key:"date",name:"Dates",type:"date"},{id:"parent",key:"parent",name:"Parent item",type:"relation",localRelation:true,subitemRole:"parent"},{id:"children",key:"children",name:"Sub-item",type:"relation",readOnly:true,subitemRole:"children",inversePropertyId:"parent"}],subitems:{enabled:true,parentPropertyId:"parent",childrenPropertyId:"children"}}})).json();
  await request.put(`/api/data-sources/${source.id}/records/${root.id}`,{data:{baseRevision:root.revision,schemaRevision:schema.revision,propertyId:"date",value:{start:"2026-11-10",end:"2026-11-13"}}});
  await request.put(`/api/database-views/${snapshot.views[0].id}`,{data:{baseRevision:snapshot.views[0].revision,type:"timeline",layout:{datePropertyId:"date",timelineTable:true}}});
  await page.clock.setFixedTime(new Date("2026-11-14T12:00:00Z"));await page.goto(`/#database/${snapshot.database.id}`);
  const toggle=page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true});
  await page.mouse.move(10,10);await expect(toggle).toHaveCSS("color","rgb(153, 152, 148)");await expect(toggle).toHaveCSS("opacity","1");
  await toggle.click();await page.mouse.move(10,10);
  await expect(page.getByRole("button",{name:"Collapse sub-items: Parent task",exact:true})).toHaveCSS("color","rgb(55, 53, 47)");
  const lane=page.getByRole("button",{name:"New sub-item: Parent task",exact:true}),preview=lane.locator('.database-timeline-subitem-preview');
  await expect(preview).toBeHidden();await expect(page.locator('.database-timeline-subitem-add')).toHaveCount(1);
  const day=(await page.locator('.database-timeline-tick[data-date="2026-11-18"]').boundingBox())!,box=(await lane.boundingBox())!;
  const x=day.x+day.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await expect(preview).toBeVisible();await expect(lane).toHaveAttribute("data-start","2026-11-18");
  await expect(lane).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(page.locator('.database-subitem-preview-link')).toHaveCount(1);
  expect((await preview.boundingBox())!.x).toBeCloseTo(day.x+2,0);
  await page.screenshot({path:info.outputPath("subitems-cursor-preview.png")});
  await page.locator('.database-timeline-scroll').evaluate(el=>{el.scrollLeft+=72;});
  await expect(lane).toHaveAttribute("data-start","2026-11-20");
  await page.mouse.move(10,10);await expect(preview).toBeHidden();await expect(page.locator('.database-subitem-preview-link')).toHaveCount(0);
  expect((await(await request.get(`/api/databases/${snapshot.database.id}`)).json()).pages).toHaveLength(1);
  await page.mouse.move(x,y);await expect(lane).toHaveAttribute("data-start","2026-11-20");await page.mouse.click(x,y);
  const title=page.getByRole("textbox",{name:"Page title",exact:true});await expect(title).toBeFocused();
  await expect(page.getByRole("dialog",{name:"Add row",exact:true})).toHaveCount(0);
  const saved=await(await request.get(`/api/databases/${snapshot.database.id}`)).json(),child=saved.pages.find((p:any)=>p.id!==root.id);
  expect(child.properties.parent).toEqual([{pageId:root.id,title:"Parent task"}]);expect(child.properties.date).toEqual({start:"2026-11-20",end:"2026-11-24"});
  await title.fill("Created at cursor");await title.press("Enter");await expect(page.getByRole("button",{name:"Open Created at cursor",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Expand sub-items: Created at cursor",exact:true}).click();
  const nested=page.getByRole("button",{name:"New sub-item: Created at cursor",exact:true});
  await nested.focus();await page.keyboard.press("ArrowRight");await expect(nested.locator('.database-timeline-subitem-preview')).toBeVisible();
  const nestedDate=await nested.getAttribute("data-start");await page.keyboard.press("Escape");await expect(nested.locator('.database-timeline-subitem-preview')).toBeHidden();
  expect((await(await request.get(`/api/databases/${snapshot.database.id}`)).json()).pages).toHaveLength(2);
  await nested.focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("Enter");await expect(title).toBeFocused();
  const nestedSaved=await(await request.get(`/api/databases/${snapshot.database.id}`)).json(),grandchild=nestedSaved.pages.find((p:any)=>![root.id,child.id].includes(p.id));
  expect(grandchild.properties.parent[0].pageId).toBe(child.id);expect(grandchild.properties.date.start).toBe(nestedDate);
  await title.fill("Grandchild at cursor");await title.press("Enter");
  await expect(page.getByRole("button",{name:"Open Grandchild at cursor",exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true}).click();await page.getByRole("button",{name:"Expand sub-items: Created at cursor",exact:true}).click();
  await expect(page.getByRole("button",{name:"Open Grandchild at cursor",exact:true})).toBeVisible();
});

test("the table toggle follows the first property or the title setting, and full-page parent editing persists",async({page,request},info)=>{
  const {snapshot,source,root}=await create(request),title=source.properties[0];
  await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:source.revision,properties:[...source.properties,{id:"status",key:"status",name:"Is Active",type:"text"}]}});
  await request.put(`/api/database-views/${snapshot.views[0].id}`,{data:{baseRevision:snapshot.views[0].revision,propertyIds:["status",title.id]}});
  await page.goto(`/#database/${snapshot.database.id}`);
  await (await settings(page)).getByRole("button",{name:"Turn on sub-items",exact:true}).click();
  const row=page.locator(`tr[data-page-id="${root.id}"]`);
  await expect(row.locator('td[data-property-id="status"] .database-subitem-toggle')).toHaveCount(1);
  const panel=await settings(page);await page.screenshot({path:info.outputPath("subitems-settings.png"),fullPage:true});
  await panel.getByRole("button",{name:"Advanced settings",exact:true}).click();
  await page.getByRole("checkbox",{name:"Show nesting toggle on title",exact:true}).check();
  await expect(row.locator(`td[data-property-id="${title.id}"] .database-subitem-toggle`)).toHaveCount(1);
  await row.hover();await page.getByRole("button",{name:"Expand sub-items: Parent task",exact:true}).click();
  await addChild(page,"Parent task","Child task");
  const saved=await(await request.get(`/api/databases/${snapshot.database.id}`)).json(),child=saved.pages.find((p:any)=>p.title==="Child task"),parentKey=saved.dataSources[0].properties.find((f:any)=>f.subitemRole==="parent").key;
  await page.goto(`/#page/${child.id}`);
  await page.getByRole("button",{name:"Parent item: Child task",exact:true}).click();
  await page.getByRole("dialog",{name:"Parent item",exact:true}).getByRole("option",{name:"Parent task",exact:true}).click();
  await expect.poll(async()=>(await(await request.get(`/api/pages/${child.id}`)).json()).properties[parentKey]).toEqual([]);
  await page.reload();await expect(page.getByRole("button",{name:"Parent item: Child task",exact:true})).toContainText("Empty");
});
