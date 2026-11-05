import test from "node:test";
import assert from "node:assert/strict";
import { calendarWindow, calendarSegments } from "../../src/features/databases/database-calendar-model.js";
import type { Page } from "../../src/shared/types.js";
import type { DatabaseProperty } from "../../src/features/databases/database-model.js";
const field:DatabaseProperty={id:"date",key:"date",name:"Date",type:"date"};
const record=(id:string,start:string,end:string|null):Page=>({id,title:id,parent:null,icon:"",body:"",revision:"r",updated:"2026-11-03",properties:{date:{start,end}}});

test("calendar windows honor week start, leap years and month boundaries",()=>{
  assert.deepEqual(calendarWindow("2026-11-03",false,1),{start:"2026-10-26",weeks:6});
  assert.deepEqual(calendarWindow("2026-11-03",false,0),{start:"2026-11-01",weeks:5});
  assert.deepEqual(calendarWindow("2027-02-10",false,1),{start:"2027-02-01",weeks:4});
  assert.deepEqual(calendarWindow("2028-02-29",false,1),{start:"2028-01-31",weeks:5});
  assert.deepEqual(calendarWindow("2027-01-01",true,1),{start:"2026-12-28",weeks:1});
});
test("calendar ranges span columns once per week and overlapping cards use separate lanes",()=>{
  const rows=[record("Card 1","2026-10-29","2026-11-02"),record("Card 2","2026-11-02","2026-11-04"),record("Card 3","2026-10-31","2026-11-04"),record("Card 4","2026-10-27","2026-10-31")];
  const first=calendarSegments(rows,field,"2026-10-26");
  assert.deepEqual(first.map(item=>[item.page.id,item.start,item.end,item.lane,item.continuesAfter]),[["Card 4",1,5,0,false],["Card 1",3,6,1,true],["Card 3",5,6,2,true]]);
  const next=calendarSegments(rows,field,"2026-11-02");
  assert.deepEqual(next.map(item=>[item.page.id,item.start,item.end,item.lane,item.continuesBefore]),[["Card 1",0,0,0,true],["Card 3",0,2,1,true],["Card 2",0,2,2,false]]);
});
test("nonoverlapping single-day events share a lane and timed ranges are displayed without mutations",()=>{
  const rows=[record("one","2026-11-02",null),record("two","2026-11-04",null),record("meeting","2026-11-02T09:00:00","2026-11-03T10:00:00")], before=structuredClone(rows);
  const segments=calendarSegments(rows,field,"2026-11-02");
  assert.equal(segments.find(item=>item.page.id==="two")?.lane,0);
  assert.equal(segments.find(item=>item.page.id==="meeting")?.range.movable,false);
  assert.deepEqual(rows,before);
});
