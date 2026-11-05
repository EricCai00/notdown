import { test, expect, type Page } from "@playwright/test";
async function create(page: Page, name: string) { await page.getByRole("button",{name:"New view",exact:true}).click(); await page.getByRole("dialog",{name:"New view",exact:true}).getByRole("button",{name,exact:true}).click(); await page.getByRole("button",{name:"Create view",exact:true}).click(); await expect(page.locator(`.database-layout-${name.toLowerCase()}`)).toBeVisible(); }
test("form, map and dashboard persist, validate and share records", async ({page,request}, info) => {
  test.setTimeout(120000);
  let snapshot = await (await request.post('/api/databases',{data:{title:'Field visits'}})).json(); let source = snapshot.dataSources[0];
  source = await (await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:source.revision,properties:[...source.properties,{id:'lat',key:'lat',name:'Latitude',type:'number'},{id:'lng',key:'lng',name:'Longitude',type:'number'},{id:'email',key:'email',name:'Email',type:'email'}]}})).json();
  await page.goto(`/#database/${snapshot.database.id}`); await create(page,'Form');
  const form = page.locator('.database-response-form'); const titleName=source.properties.find((p:any)=>p.type==='title').name;
  await form.getByRole('textbox',{name:titleName,exact:true}).fill('Research station'); await form.getByRole('spinbutton',{name:'Latitude',exact:true}).fill('31.23'); await form.getByRole('spinbutton',{name:'Longitude',exact:true}).fill('121.47');
  await page.reload(); await expect(form.getByRole('textbox',{name:titleName,exact:true})).toHaveValue('Research station');
  await form.getByRole('button',{name:'Submit response'}).click(); await expect(form.getByRole('status')).toHaveText('Response saved.');
  snapshot=await (await request.get(`/api/databases/${snapshot.database.id}`)).json(); expect(snapshot.pages).toHaveLength(1);
  await create(page,'Map'); await page.getByRole('combobox',{name:'Latitude',exact:true}).selectOption('lat'); await page.getByRole('combobox',{name:'Longitude',exact:true}).selectOption('lng'); await expect(page.locator('.database-map-pin')).toHaveCount(1);
  await page.getByRole('button',{name:'Show on map',exact:true}).click(); await expect(page.locator('.leaflet-popup')).toContainText('Research station');
  await page.screenshot({path:info.outputPath('map.png'),fullPage:true});
  await create(page,'Chart'); await create(page,'Dashboard'); await expect(page.locator('.database-dashboard-widget')).toHaveCount(3);
  await expect(page.locator('.database-dashboard-widget .database-chart-stage')).toBeVisible();
  await page.locator('.database-dashboard-widget').filter({has:page.locator('.dashboard-widget-title',{hasText:'Map'})}).getByRole('button',{name:'Widget options',exact:true}).click(); await page.getByRole('button',{name:'Remove widget',exact:true}).click(); await page.getByRole('button',{name:'Save layout',exact:true}).click(); await expect(page.locator('.database-dashboard-widget')).toHaveCount(2);
  await page.reload(); await expect(page.locator('.database-dashboard-widget')).toHaveCount(2); await page.setViewportSize({width:390,height:844}); await page.screenshot({path:info.outputPath('dashboard-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'More database views',exact:true}).click(); await page.getByRole('menuitemradio',{name:'Form',exact:true}).click(); await form.getByRole('textbox',{name:titleName,exact:true}).fill('Retained on conflict');
  const latestSource = (await (await request.get(`/api/databases/${snapshot.database.id}`)).json()).dataSources.find((item:any)=>item.id===source.id);
  expect((await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:latestSource.revision,title:'Changed externally'}})).ok()).toBeTruthy();
  await form.getByRole('button',{name:'Submit response'}).click(); await expect(form.getByRole('status')).not.toBeEmpty(); await expect(form.getByRole('textbox',{name:titleName,exact:true})).toHaveValue('Retained on conflict');
  expect((await (await request.get(`/api/databases/${snapshot.database.id}`)).json()).pages).toHaveLength(1);
});
