import { ChartColumn, ChartBar, ChartLine, Layers, Hash, Calendar } from "lucide";
import { t, setUIAttribute } from "../../shared/i18n";
import type { DatabaseDataSource, DatabaseLayout } from "./database-model";
import { chartGroupable } from "./database-chart-model";
import { DatabasePopover, menuButton, menuChoice, menuSection, menuToggle } from "./database-popover";
import type { IconNode } from "lucide";

// A chart preview with separate ring sectors, rather than the food-shaped Donut icon.
const donutChartIcon: IconNode = [
  ["path", { d: "M12.8 3.04A9 9 0 0 1 20.96 11.2H17.44A5.5 5.5 0 0 0 12.8 6.56Z", class: "database-chart-type-accent", "stroke-width": 1.3 }],
  ["path", { d: "M20.96 12.8A9 9 0 1 1 11.2 3.04V6.56A5.5 5.5 0 1 0 17.44 12.8Z", "stroke-width": 1.3 }],
];

/** Chart-specific controls redraw after choices so irrelevant options stay out of the way. */
export function chartControls(parent: HTMLElement, pop: DatabasePopover, source: DatabaseDataSource, layout: DatabaseLayout, level: number) {
  const host = document.createElement("div"); parent.append(host);
  function draw() {
    const scrollTop = parent.scrollTop;
    host.replaceChildren();
    const type = layout.chartType ?? "bar", cartesian = ["bar", "horizontal", "line"].includes(type);
    const date = source.properties.some(field => field.id === layout.chartGroupBy && field.type === "date");
    function choice<T extends string>(section: HTMLElement, title: string, values: [T, string][], current: T, change: (value: T) => void, icon?: IconNode, localize = true) {
      const text = values.find(([id]) => id === current)?.[1] ?? current;
      section.append(menuButton(title, icon, button => {
        const panel = pop.panel(title, button, level + 1);
        for (const [id, label] of values) panel.append(menuChoice(label, id === current, () => {
          change(id); pop.dirty = true; pop.trim(level + 1); draw();
          host.querySelector<HTMLButtonElement>(`[data-i18n-aria-label="${title}"]`)?.focus({ preventScroll: true });
        }, undefined, localize || id === ""));
      }, localize || current === "" ? t(text) : text, true));
    }
    function toggle(section: HTMLElement, key: keyof DatabaseLayout, title: string, fallback: boolean) {
      section.append(menuToggle(title, (layout[key] as boolean | undefined) ?? fallback, value => { layout[key] = value; pop.dirty = true; }));
    }
    const types = menuSection(host, "Chart type");
    const picker = document.createElement("div"); picker.className = "database-chart-type-picker";
    picker.setAttribute("role", "group"); setUIAttribute(picker, "aria-label", "Chart type"); types.append(picker);
    const options: [NonNullable<DatabaseLayout["chartType"]>, string, IconNode][] = [
      ["bar", "Vertical bar", ChartColumn], ["horizontal", "Horizontal bar", ChartBar],
      ["line", "Line chart", ChartLine], ["donut", "Donut", donutChartIcon], ["number", "Number", Hash],
    ];
    for (const [value, label, icon] of options) {
      const button = menuButton(label, icon, () => {
        if (value === type) return;
        layout.chartType = value; pop.dirty = true; draw();
        host.querySelector<HTMLButtonElement>(`[data-chart-type="${value}"]`)?.focus({ preventScroll: true });
      }, "", false, "database-chart-type-option");
      button.dataset.chartType = value; button.setAttribute("aria-pressed", String(value === type));
      setUIAttribute(button, "title", label); picker.append(button);
    }
    const data = menuSection(host, "Data");
    if (type !== "number") choice(data, "What to show", [["", "All pages"], ...source.properties.filter(chartGroupable).map(field => [field.id, field.name] as [string, string])], layout.chartGroupBy ?? "", value => layout.chartGroupBy = value, undefined, false);
    choice(data, "Measure", [["", "Count"], ...source.properties.filter(field => field.type === "number").map(field => [field.id, field.name] as [string, string])], layout.chartValueId ?? "", value => { layout.chartValueId = value; layout.chartAggregation = value ? "sum" : "count"; }, Hash, false);
    if (layout.chartValueId) choice(data, "Calculation", [["count", "Count"], ["sum", "Sum"], ["average", "Average"], ["min", "Min"], ["max", "Max"]], layout.chartAggregation ?? "count", value => layout.chartAggregation = value);
    if (cartesian) {
      choice(data, "Series by", [["", "None"], ...source.properties.filter(chartGroupable).map(field => [field.id, field.name] as [string, string])], layout.chartSeriesBy ?? "", value => layout.chartSeriesBy = value, Layers, false);
      if (layout.chartSeriesBy && type !== "line") toggle(data, "chartStacked", "Stacked bars", true);
    }
    if (type !== "number") {
      choice(data, "Chart sort", [["natural", "Property order"], ["label", "Label"], ["ascending", "Ascending"], ["descending", "Descending"]], layout.chartSort ?? "natural", value => { layout.chartSort = value; if (["ascending", "descending"].includes(value)) layout.chartCumulative = false; });
      if (date) choice(data, "Date grouping", [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]], layout.chartDateBucket ?? "day", value => layout.chartDateBucket = value, Calendar);
      toggle(data, "chartOmitZero", "Omit zero values", false);
    }
    if (cartesian && date && ["count", "sum"].includes(layout.chartAggregation ?? "count")) data.append(menuToggle("Cumulative", layout.chartCumulative === true, value => { layout.chartCumulative = value; if (value) layout.chartSort = "label"; pop.dirty = true; draw(); }));
    const style = menuSection(host, "Style");
    if (type !== "number") choice(style, "Color", [["colorful", "Colorful"], ["blue", "Blue"], ["green", "Green"], ["purple", "Purple"]], layout.chartColor ?? "colorful", value => layout.chartColor = value);
    choice(style, "Chart height", [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["extra-large", "Extra large"]], layout.chartHeight ?? "medium", value => layout.chartHeight = value);
    if (type !== "number") { toggle(style, "chartLabels", "Data labels", true); toggle(style, "chartLegend", "Legend", true); }
    if (cartesian) { toggle(style, "chartGrid", "Grid lines", true); toggle(style, "chartAxisNames", "Axis names", false); }
    if (type === "donut") toggle(style, "chartCenter", "Show value in center", true);
    if (type === "line") { toggle(style, "chartSmooth", "Smooth line", false); toggle(style, "chartArea", "Gradient area", false); }
    parent.scrollTop = scrollTop;
  }
  draw();
}
