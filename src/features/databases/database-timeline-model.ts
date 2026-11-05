import { calendarDate, shiftDay } from "./database-query";
import type { DatabaseLayout } from "./database-model";

export const timelineScales = [["hours", "Hours"], ["day", "Day"], ["week", "Week"], ["bi-week", "Bi-week"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["5-years", "5 Years"]] as const;

export function timelineWindow(anchor: string, scale: DatabaseLayout["timelineScale"] = "month") {
  const date = new Date(anchor + "T12:00:00Z");
  if (scale === "hours" || scale === "day") return { start: anchor, days: 1, dayWidth: scale === "hours" ? 1152 : 240 };
  if (scale === "bi-week") return { start: shiftDay(anchor, -((date.getUTCDay() + 6) % 7)), days: 14, dayWidth: 64 };
  if (scale === "5-years") {
    const year = Math.floor(date.getUTCFullYear() / 5) * 5;
    const start = `${year}-01-01`, end = `${year + 5}-01-01`;
    return { start, days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000), dayWidth: 1.2 };
  }
  if (scale === "week") return { start: shiftDay(anchor, -((date.getUTCDay() + 6) % 7)), days: 7, dayWidth: 110 };
  const month = scale === "year" ? 0 : scale === "quarter" ? Math.floor(date.getUTCMonth() / 3) * 3 : date.getUTCMonth();
  const start = `${date.getUTCFullYear()}-${String(month + 1).padStart(2,"0")}-01`;
  const end = new Date(start + "T12:00:00Z"); end.setUTCMonth(month + (scale === "year" ? 12 : scale === "quarter" ? 3 : 1));
  return { start, days: Math.round((end.getTime() - Date.parse(start + "T12:00:00Z")) / 86400000), dayWidth: scale === "year" ? 6 : scale === "quarter" ? 16 : 36 };
}

/** A padded window allows seamless cross-month scrolling; the UI rebases near its ends. */
export function timelineViewport(anchor: string, scale: DatabaseLayout["timelineScale"] = "month") {
  const period = timelineWindow(anchor, scale), padding = Math.max(period.days, scale === "hours" ? 3 : scale === "day" ? 7 : 60);
  return { ...period, start: shiftDay(period.start, -padding), days: period.days + 2 * padding };
}
export function timelineEdit(value: unknown, days: number, mode: "move" | "start" | "end"): Record<string, unknown> | undefined {
  const range = calendarDate(value); if (!range?.movable || !Number.isInteger(days)) return;
  const original = value as Record<string, unknown>;
  const start = mode === "end" ? range.start : shiftDay(range.start, days);
  const end = mode === "start" ? range.end : shiftDay(range.end, days);
  if (end < start) return;
  return { ...original, start, ...(mode === "move" && !original.end ? {} : { end }) };
}
