import { createVault } from '../server/vault';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import type { DatabaseView } from '../src/features/databases/database-model';
const root=process.argv[2]; if(!root) throw new Error('Pass the example vault path explicitly');
const vault=createVault(root); await vault.init();
const original=new Map<string,string>(); for(const name of await fs.readdir(root+'/pages')) if(name.endsWith('.md')) original.set(name,createHash('sha256').update(await fs.readFile(root+'/pages/'+name)).digest('hex'));
const titles=['09 · 地图与实地调研','10 · 调研报名表单','11 · 调研工作仪表盘']; const existing=await vault.databases.list(); assert(!existing.some(d=>titles.includes(d.title)),'Examples already exist; refusing to duplicate');
const manifest:any={vault:root,databases:[]};
async function recordManifest(){await fs.mkdir('.run/logs',{recursive:true}); await fs.writeFile('.run/logs/database-extra-examples.json',JSON.stringify(manifest,null,2));}
let map=await vault.databases.create({title:titles[0]}); manifest.databases.push({id:map.database.id,title:titles[0]}); await recordManifest();
const initial=map.dataSources[0];
const source=await vault.databases.updateSource(initial.id,{properties:[...initial.properties,{id:'lat',key:'lat',name:'纬度',type:'number'},{id:'lng',key:'lng',name:'经度',type:'number'},{id:'city',key:'city',name:'城市',type:'select',options:[{id:'sh',name:'上海',color:'blue'},{id:'hz',name:'杭州',color:'green'},{id:'nj',name:'南京',color:'purple'}]},{id:'budget',key:'budget',name:'预算',type:'number'},{id:'date',key:'date',name:'计划日期',type:'date'},{id:'email',key:'email',name:'联系邮箱',type:'email'},{id:'notes',key:'notes',name:'备注',type:'text'},{id:'confirmed',key:'confirmed',name:'已确认',type:'checkbox'}]},initial.revision);
for(const [title,lat,lng,city,budget] of [['上海 · 城市样点',31.2304,121.4737,'sh',1200],['杭州 · 湖区样点',30.2489,120.1295,'hz',900],['南京 · 河岸样点',32.0603,118.7969,'nj',1100],['待定 · 补充坐标',null,null,'sh',0]] as const){ const page=await vault.databases.createRecord(source.id,{title,properties:{...(lat!==null?{lat,lng}:{}),city,budget,date:{start:'2026-11-06'},confirmed:budget>0,notes:'演示数据，可自由编辑。'}},source.revision); await vault.update(page.id,{body:'这是虚构的调研任务，用于展示地图、表单和仪表盘。\n\n可在表格修改坐标、预算或计划日期，然后切换视图观察变化。'},page.revision); }
async function add(id:string,view:Partial<DatabaseView>){const current=await vault.databases.get(id); return vault.databases.createView(id,view,current.database.revision);}
await vault.databases.updateView(map.views[0].id,{name:'地点地图',type:'map',layout:{mapLatitudeId:'lat',mapLongitudeId:'lng'}},map.views[0].revision); await add(map.database.id,{name:'地点总表',type:'table'});
const form=await vault.databases.create({title:titles[1],dataSourceId:source.id,sourceRevision:source.revision}); manifest.databases.push({id:form.database.id,title:titles[1]}); await recordManifest();
await vault.databases.updateView(form.views[0].id,{name:'填写调研报名',type:'form',propertyIds:source.properties.map(p=>p.id),layout:{formRequiredIds:['email','city']}},form.views[0].revision); await add(form.database.id,{name:'所有提交',type:'table'});
const dash=await vault.databases.create({title:titles[2],dataSourceId:source.id,sourceRevision:source.revision}); manifest.databases.push({id:dash.database.id,title:titles[2]}); await recordManifest();
await add(dash.database.id,{name:'按城市统计预算',type:'chart',layout:{chartType:'bar',chartGroupBy:'city',chartValueId:'budget',chartAggregation:'sum'}});
await add(dash.database.id,{name:'调研日历',type:'calendar',layout:{datePropertyId:'date'}});
await add(dash.database.id,{name:'样点分布',type:'map',layout:{mapLatitudeId:'lat',mapLongitudeId:'lng'}});
await add(dash.database.id,{name:'项目清单',type:'list',propertyIds:[source.properties[0].id,'city','budget','date']});
const current=await vault.databases.get(dash.database.id);
const chartView=current.views.find(view=>view.type==='chart')!;
const dashboardWidget=(view:DatabaseView,settings:import('../src/features/databases/database-model').DashboardWidget['settings'],width=1)=>({id:randomUUID(),viewId:view.id,databaseId:dash.database.id,width,settings});
const dashboardRows=[
 {id:randomUUID(),height:200,widgets:[dashboardWidget(chartView,{name:'调研样点',layout:{chartType:'number',chartAggregation:'count'}}),dashboardWidget(chartView,{name:'计划总预算',layout:{chartType:'number',chartValueId:'budget',chartAggregation:'sum'}}),dashboardWidget(chartView,{name:'已确认行程',filters:[{propertyId:'confirmed',operator:'equals',value:'true'}],layout:{chartType:'number',chartAggregation:'count'}})]},
 {id:randomUUID(),height:320,widgets:[dashboardWidget(chartView,{name:'城市预算分布',layout:{...chartView.layout,chartLegend:false}},1.6),dashboardWidget(chartView,{name:'城市样点占比',layout:{chartType:'donut',chartGroupBy:'city',chartAggregation:'count',chartLabels:false}})]},
 {id:randomUUID(),height:360,widgets:[dashboardWidget(current.views.find(view=>view.type==='list')!,{name:'调研清单'},1.6),dashboardWidget(current.views.find(view=>view.type==='calendar')!,{name:'活动日历'})]},
 {id:randomUUID(),height:440,widgets:[dashboardWidget(current.views.find(view=>view.type==='map')!,{name:'调研地点地图'})]}
];
await vault.databases.updateView(current.views[0].id,{name:'调研总览',type:'dashboard',layout:{dashboardRows}},current.views[0].revision);
const guide=await vault.create({title:'新增视图演示 · 仪表盘、表单与地图',icon:'🗺️',body:'# 仪表盘、表单与地图\n\n'+manifest.databases.map((d:any)=>`- [${d.title}](#database/${d.id})`).join('\n')+'\n\n## 建议操作\n\n1. 地图：缩放、点击地点或列表中的定位按钮；最后一条记录没有坐标，可在总表补填。\n2. 表单：填写标题、邮箱和城市，提交后切换到所有提交。\n3. 仪表盘：查看预算、日历、地图和清单；点击“编辑仪表盘”后添加、复制、移动组件，拖动分隔线调整尺寸，再保存布局。\n\n三组示例共享新建的调研数据，互相联动；不会修改之前的产品或画廊示例。日期在 2026 年 11 月。\n\n地图底图需要联网。表单仅限当前本地应用，不提供公开收集链接。仪表盘可组合不同本地数据库的视图。旧演示导航中所述的三种视图缺失状态已由本次示例补齐。'}); manifest.guidePageId=guide.id;
for(const [name,hash] of original) assert.equal(createHash('sha256').update(await fs.readFile(root+'/pages/'+name)).digest('hex'),hash,'Existing page changed: '+name);
manifest.preservedPages=original.size; await recordManifest(); console.log(JSON.stringify(manifest,null,2));
