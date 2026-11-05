import type { Page } from "../../shared/types";
import type { DatabaseProperty } from "./database-model";
import { calendarDate, fieldValue, shiftDay } from "./database-query";

const daysBetween = (a: string, b: string) => Math.round((Date.parse(a)-Date.parse(b))/86400000);
export function calendarWindow(anchor: string, weekly: boolean, weekStart: 0 | 1) {
  const first = weekly ? anchor : anchor.slice(0,7)+"-01";
  const offset = (new Date(first+"T12:00:00Z").getUTCDay()-weekStart+7)%7;
  const start = shiftDay(first,-offset);
  const next = new Date(first+"T12:00:00Z"); next.setUTCMonth(next.getUTCMonth()+1,1);
  return {start, weeks: weekly ? 1 : Math.ceil((offset+daysBetween(next.toISOString().slice(0,10),first))/7)};
}

/** One range segment per week; overlapping segments occupy distinct lanes. */
export function calendarSegments(rows: Page[], field: DatabaseProperty, weekStart: string) {
  const weekEnd=shiftDay(weekStart,6), ends: number[]=[];
  const segments=rows.flatMap((page,rank)=>{
    const range=calendarDate(fieldValue(page,field));
    if(!range || range.end<weekStart || range.start>weekEnd) return [];
    return [{page,range,rank,start:Math.max(0,daysBetween(range.start,weekStart)),end:Math.min(6,daysBetween(range.end,weekStart))}];
  }).sort((a,b)=>a.range.start.localeCompare(b.range.start)||b.end-a.end||a.rank-b.rank);
  return segments.map(segment=>{
    let lane=ends.findIndex(end=>end<segment.start); if(lane<0) lane=ends.length; ends[lane]=segment.end;
    return {...segment,lane,continuesBefore:segment.range.start<weekStart,continuesAfter:segment.range.end>weekEnd};
  });
}
