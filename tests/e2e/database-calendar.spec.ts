import { test, expect, type APIRequestContext } from '@playwright/test';
async function fixture(request:APIRequestContext) {
 let snapshot=await (await request.post('/api/databases',{data:{title:'Calendar example'}})).json(), source=snapshot.dataSources[0];
 source=await (await request.put(`/api/data-sources/${source.id}`,{data:{baseRevision:source.revision,properties:[...source.properties,{id:'status',key:'status',name:'Status',type:'status',options:[{id:'todo',name:'Not started',color:'gray'},{id:'progress',name:'In progress',color:'blue'}]},{id:'date',key:'date',name:'Date',type:'date'},{id:'assign',key:'assign',name:'Assign',type:'people'}]}})).json();
 const records=[]; for(const [title,start,end,status] of [['Card 1','2026-10-29','2026-11-02','progress'],['Card 2','2026-11-02','2026-11-04','todo'],['Card 3','2026-10-31','2026-11-04','todo'],['Card 4','2026-10-27','2026-10-31','todo']]) records.push(await (await request.post(`/api/data-sources/${source.id}/records`,{data:{baseRevision:source.revision,title,properties:{date:{start,end},status}}})).json());
 snapshot=await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
 snapshot=await (await request.post(`/api/databases/${snapshot.database.id}/views`,{data:{baseRevision:snapshot.database.revision,name:'Calendar',type:'calendar',propertyIds:[source.properties[0].id,'status','date'],layout:{datePropertyId:'date',calendarWeekStart:1,showPageIcon:false}}})).json();
 return {snapshot,source,records,view:snapshot.views.at(-1)};
}
test('calendar ranges span weeks, show ordered properties and persist visibility and week start',async({page,request},info)=>{
 test.setTimeout(60000); const data=await fixture(request); await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z'));
 await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
 await expect(page.locator('.database-calendar-weekday').first()).toHaveText('Mon');
 const first=page.locator('.database-calendar-week').first(); await expect(first).toHaveAttribute('data-week','2026-10-26');
 const cards=page.locator('.database-calendar-event'); await expect(cards).toHaveCount(6);
 const card4=first.locator(`[data-page-id='${data.records[3].id}']`), card1=first.locator(`[data-page-id='${data.records[0].id}']`), card3=first.locator(`[data-page-id='${data.records[2].id}']`);
 await expect(card4.locator('[data-property-id=date]')).toHaveText('October 27, 2026 → October 31, 2026');
 const dimensions=await card4.evaluate(el=>({width:el.getBoundingClientRect().width,cell:el.parentElement!.getBoundingClientRect().width})); expect(dimensions.width/dimensions.cell).toBeGreaterThan(4.8);
 await expect.poll(async()=> (await card1.boundingBox())!.y-(await card4.boundingBox())!.y-(await card4.boundingBox())!.height).toBeGreaterThanOrEqual(4);
 expect((await card3.boundingBox())!.y).toBeGreaterThan((await card1.boundingBox())!.y);
 await expect(page.locator('.database-calendar-day.is-today > header > span')).toHaveText('3');
 await page.getByRole('button',{name:'View settings',exact:true}).click(); await page.getByRole('button',{name:'Property visibility',exact:false}).click();
 const menu=page.getByRole('dialog',{name:'Property visibility',exact:true}); await expect(menu.getByText('Shown in calendar',{exact:true})).toBeVisible();
 await expect(menu.getByText('Hidden in calendar',{exact:true})).toBeVisible(); await expect(menu.getByRole('switch',{name:'Name',exact:true})).toBeDisabled();
 await menu.getByRole('textbox',{name:'Search for a property...',exact:true}).hover();
 await page.screenshot({path:info.outputPath('calendar-properties.png'),fullPage:true});
 const date=menu.locator('.database-visibility-row[data-property-id=date]'), status=menu.locator('.database-visibility-row[data-property-id=status]');
 await date.dragTo(status); await menu.getByRole('button',{name:'Close',exact:true}).click();
 await expect.poll(()=>card4.locator('.database-card-property').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-property-id')))).toEqual(['date','status']);
 await page.getByRole('button',{name:'View settings',exact:true}).click(); await page.getByRole('button',{name:'Property visibility',exact:false}).click();
 await menu.getByRole('button',{name:'Hide all',exact:true}).click(); await menu.getByRole('button',{name:'Close',exact:true}).click();
 await expect(card4.locator('.database-card-property')).toHaveCount(0); await expect(card4.getByRole('button',{name:'Open Card 4',exact:true})).toBeVisible();
 await page.reload(); await expect(card4.locator('.database-card-property')).toHaveCount(0);
 await page.getByRole('button',{name:'View settings',exact:true}).click(); await page.getByRole('button',{name:'Layout',exact:false}).click(); await page.getByRole('button',{name:'Start week on',exact:false}).click();
 await page.getByRole('button',{name:'Sunday',exact:true}).click(); await page.getByRole('dialog',{name:'Layout',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.database-calendar-weekday').first()).toHaveText('Sun');
});
test('dragging a continuation segment moves the entire range by the grabbed day offset',async({page,request})=>{
 const data=await fixture(request); await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z')); await page.goto(`/#database/${data.snapshot.database.id}?view=${data.view.id}`);
 const continuation=page.locator(`.database-calendar-week[data-week='2026-11-02'] [data-page-id='${data.records[0].id}']`), target=page.locator('.database-calendar-day[data-date="2026-11-05"]');
 await continuation.dragTo(target,{targetPosition:{x:35,y:15}});
 await expect.poll(async()=> (await (await request.get(`/api/pages/${data.records[0].id}`)).json()).properties.date).toEqual({start:'2026-11-01',end:'2026-11-05'});
 await page.reload(); await expect(page.locator(`[data-page-id='${data.records[0].id}'].database-calendar-event`).first()).toHaveAttribute('data-segment-start','2026-11-01');
});
