import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseLayout, DatabaseProperty } from "./database-model";
import { calendarDate, fieldValue, shiftDay, valueText } from "./database-query";

export const chartGroupable = (field: DatabaseProperty) => ["title", "text", "number", "checkbox", "date", "select", "status", "multi_select"].includes(field.type);
export type ChartGroup = { key: string; label: string; value: number; pages: Page[] };
export type ChartSeries = { key: string; label: string; points: ChartGroup[] };
export function chartAggregate(pages: Page[], field: DatabaseProperty | undefined, aggregation: DatabaseLayout["chartAggregation"] = "count"): number {
  if (aggregation === "count") return pages.length;
  const numbers = field ? pages.map(page => fieldValue(page, field)).filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : [];
  if (!numbers.length) return 0;
  if (aggregation === "min") return numbers.reduce((a,b) => Math.min(a,b));
  if (aggregation === "max") return numbers.reduce((a,b) => Math.max(a,b));
  const sum = numbers.reduce((a,b) => a+b, 0);
  return aggregation === "average" ? sum / numbers.length : sum;
}
/** Aggregate every filtered record, never the paginated presentation slice. */
export function databaseChart(rows: Page[], source: DatabaseDataSource, layout: DatabaseLayout): ChartGroup[] {
  const field = source.properties.find(field => field.id === layout.chartGroupBy);
  const measure = source.properties.find(field => field.id === layout.chartValueId && field.type === "number");
  const groups = new Map<string, ChartGroup>();
  const add = (key: string, label: string) => { if (!groups.has(key)) groups.set(key, { key, label, value: 0, pages: [] }); return groups.get(key)!; };
  for (const option of field?.options ?? []) add(option.id, option.name);
  for (const page of rows) {
    const value = field ? fieldValue(page, field) : undefined;
    let keys = !field ? ["__all"] : value == null || value === "" || Array.isArray(value) && !value.length ? [""] : field.type === "multi_select" && Array.isArray(value) ? [...new Set(value.map(String))] : [String(value)];
    if (field?.type === "date") {
      let day = calendarDate(value)?.start ?? "";
      if (day && layout.chartDateBucket === "week") day = shiftDay(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
      keys = [layout.chartDateBucket === "month" ? day.slice(0,7) : layout.chartDateBucket === "year" ? day.slice(0,4) : day];
    }
    for (const key of keys) add(key, !field ? "All pages" : key === "" ? `No ${field.name}` : field.type === "date" ? key : valueText(field.type === "multi_select" ? { ...field, type: "select" } : field, key)).pages.push(page);
  }
  const result = [...groups.values()].map(group => ({ ...group, value: chartAggregate(group.pages, measure, layout.chartAggregation) })).filter(group => !layout.chartOmitZero || group.value !== 0);
  if (layout.chartSort === "ascending" || layout.chartSort === "descending") result.sort((a,b) => (a.value - b.value) * (layout.chartSort === "descending" ? -1 : 1));
  else if (layout.chartSort === "label" || field?.type === "date") result.sort((a,b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return result;
}

/** Series are calculated independently; an average must never be averaged again. */
export function databaseChartSeries(rows: Page[], source: DatabaseDataSource, layout: DatabaseLayout): { groups: ChartGroup[]; series: ChartSeries[] } {
  const cumulative = layout.chartCumulative && !["donut", "number"].includes(layout.chartType ?? "bar") && ["count", "sum"].includes(layout.chartAggregation ?? "count") &&
    source.properties.some(field => field.id === layout.chartGroupBy && field.type === "date") &&
    !["ascending", "descending"].includes(layout.chartSort ?? "natural");
  const groups = databaseChart(rows, source, layout);
  const split = layout.chartSeriesBy && !["donut", "number"].includes(layout.chartType ?? "bar");
  const buckets = split ? databaseChart(rows, source, { ...layout, chartGroupBy: layout.chartSeriesBy, chartOmitZero: true, chartAggregation: "count", chartSort: "natural" }) : [{ key: "__all", label: "All pages", pages: rows, value: rows.length }];
  const measure = source.properties.find(field => field.id === layout.chartValueId && field.type === "number");
  const series = buckets.map(bucket => {
    const ids = new Set(bucket.pages.map(page => page.id));
    let total = 0;
    const previous = new Map<string, Page>();
    return { key: bucket.key, label: bucket.label, points: groups.map(group => {
      let pages = group.pages.filter(page => ids.has(page.id));
      let value = chartAggregate(pages, measure, layout.chartAggregation);
      if (cumulative && group.key !== "") {
        total += value;
        for (const page of pages) previous.set(page.id, page);
        pages = [...previous.values()]; value = total;
      }
      return { ...group, label: split ? `${group.label} · ${bucket.label}` : group.label, pages, value };
    }) };
  });
  return { groups, series };
}
