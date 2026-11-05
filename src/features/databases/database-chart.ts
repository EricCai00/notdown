import { t, setUIText } from "../../shared/i18n";
import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseView } from "./database-model";
import type { LayoutActions } from "./database-layouts";
import { chartAggregate, databaseChartSeries, type ChartGroup } from "./database-chart-model";
import { downloadChart } from "./database-chart-export";
import { DatabasePopover, menuButton, menuToggle } from "./database-popover";
import { fieldValue, valueText } from "./database-query";
import "./database-advanced-layouts.css";
import "./database-chart.css";

const palette = ["#5b97bd", "#ce9e57", "#78a58c", "#a583c7", "#cc8580", "#7f9fba", "#bba378", "#c683ab"];
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
const shortened = (text: string, length: number) => text.length > length ? text.slice(0, length - 1) + "…" : text;

export function renderChart(host: HTMLElement, source: DatabaseDataSource, rows: Page[], view: DatabaseView, actions: LayoutActions): () => void {
  const layout = view.layout ?? {}, type = layout.chartType ?? "bar";
  const { groups, series } = databaseChartSeries(rows, source, layout);
  const split = !!layout.chartSeriesBy && !["donut", "number"].includes(type);
  const measure = source.properties.find(field => field.id === layout.chartValueId && field.type === "number");
  const category = source.properties.find(field => field.id === layout.chartGroupBy);
  const metric = `${t((layout.chartAggregation ?? "count").replace(/^./, v => v.toUpperCase()))}${measure && layout.chartAggregation !== "count" ? ` · ${measure.name}` : ""}`;
  const title = document.createElement("div"); title.className = "database-chart-heading";
  const heading = document.createElement("h2"); heading.textContent = category ? `${metric} ${t("by")} ${category.name}` : metric;
  const tools = document.createElement("div"); tools.className = "database-chart-tools";
  const configure = document.createElement("button"); configure.type = "button"; setUIText(configure, "Configure chart"); configure.onclick = actions.settings;
  const exportButton = document.createElement("button"); exportButton.type = "button"; setUIText(exportButton, "Save chart as…");
  tools.append(exportButton, configure); title.append(heading, tools); host.append(title);
  const summary = document.createElement("p"); summary.className = "database-layout-hint"; summary.textContent = t("{count} matching pages", { count: rows.length }); host.append(summary);
  const stage = document.createElement("div"); stage.className = "database-chart-stage"; host.append(stage);
  const scroll = document.createElement("div"); scroll.className = "database-chart-scroll"; stage.append(scroll);
  const tooltip = document.createElement("div"); tooltip.className = "database-chart-tooltip"; tooltip.setAttribute("role", "tooltip"); tooltip.hidden = true; stage.append(tooltip);
  const legend = document.createElement("div"); legend.className = "database-chart-legend"; host.append(legend);
  const detail = document.createElement("section"); detail.className = "database-chart-detail"; detail.hidden = true; detail.tabIndex = -1; detail.setAttribute("aria-label", t("Chart records")); host.append(detail);
  let popup: DatabasePopover | undefined, plot: SVGSVGElement | undefined;
  const hidden = new Set<string>();
  let exportLegend: { label: string; color: string }[] = [];
  const color = (i: number) => {
    const base = layout.chartColor && layout.chartColor !== "colorful" ? ({ blue: palette[0], green: palette[2], purple: palette[3] })[layout.chartColor] : undefined;
    if (!base) return palette[i % palette.length];
    if (!split) return base;
    // Distinct tints retain series identity with a monochrome palette.
    const mix = Math.min(.65, (i % 6) * .13);
    return "#" + [1, 3, 5].map(start => Math.round(parseInt(base.slice(start, start + 2), 16) * (1 - mix) + 255 * mix).toString(16).padStart(2, "0")).join("");
  };
  const groupLabel = (group: ChartGroup) => split ? group.label : !category && group.key === "__all" ? t("All pages") : group.key === "" && category ? t("No {property}", { property: category.name }) : group.label;
  function drilldown(group: ChartGroup, trigger: Element) {
    tooltip.hidden = true; detail.replaceChildren(); detail.hidden = false;
    const header = document.createElement("header"), h = document.createElement("h3"); h.textContent = `${groupLabel(group)} · ${group.pages.length}`;
    const close = document.createElement("button"); close.type = "button"; setUIText(close, "Close");
    const dismiss = () => { detail.hidden = true; if (trigger instanceof HTMLElement || trigger instanceof SVGElement) trigger.focus(); };
    close.onclick = dismiss; detail.onkeydown = event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }; header.append(h, close); detail.append(header);
    const table = document.createElement("table"); table.className = "database-chart-records";
    const fields = source.properties.filter(field => field.type === "title" || [layout.chartGroupBy, layout.chartValueId, layout.chartSeriesBy].includes(field.id));
    const thead = table.createTHead().insertRow();
    for (const field of fields) { const th = document.createElement("th"); th.textContent = field.name; thead.append(th); }
    const body = table.createTBody();
    for (const page of group.pages) {
      const row = body.insertRow();
      for (const field of fields) {
        const cell = row.insertCell();
        if (field.type === "title") { const open = document.createElement("button"); open.textContent = page.title; open.type = "button"; open.onclick = () => actions.open(page); cell.append(open); }
        else cell.textContent = valueText(field, fieldValue(page, field));
      }
    }
    detail.append(table); detail.focus();
  }
  function interactive(node: SVGElement, group: ChartGroup) {
    const label = `${groupLabel(group)}: ${format(group.value)}`;
    node.classList.add("database-chart-mark"); node.setAttribute("role", "button"); node.setAttribute("tabindex", "0"); node.setAttribute("aria-label", label);
    const show = () => {
      tooltip.textContent = `${label} · ${t("{count} matching pages", { count: group.pages.length })}`; tooltip.hidden = false;
      const box = node.getBoundingClientRect(), parent = stage.getBoundingClientRect();
      tooltip.style.left = `${Math.max(4, Math.min(box.x - parent.x + box.width / 2 - tooltip.offsetWidth / 2, parent.width - tooltip.offsetWidth - 4))}px`;
      tooltip.style.top = `${Math.max(4, box.y - parent.y - tooltip.offsetHeight - 8)}px`;
    };
    node.onpointerenter = show; node.onfocus = show;
    node.onpointerleave = node.onblur = () => { tooltip.hidden = true; };
    node.onclick = () => drilldown(group, node);
    node.onkeydown = event => {
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); drilldown(group, node); }
      if (event.key === "Escape") tooltip.hidden = true;
    };
  }
  function draw() {
    tooltip.hidden = true; scroll.replaceChildren(); legend.replaceChildren(); plot = undefined; exportLegend = [];
    exportButton.disabled = true;
    summary.textContent = t("{count} matching pages", { count: rows.length });
    const fail = (message: string) => { setUIText(summary, message); };
    if (!rows.length) { fail("No pages match this view."); return; }
    if (groups.length > 200 && type !== "number") { fail("More than 200 groups. Filter records or use broader date grouping to display the chart."); return; }
    if (series.length > 50 && type !== "number") { fail("More than 50 series. Filter records or choose another series property."); return; }
    if (series.some(s => s.points.some(point => !Number.isFinite(point.value)))) { fail("Chart values exceed the supported numeric range."); return; }
    if (!groups.length && type !== "number") { fail("No values to display. Change the chart settings."); return; }
    const dashboardCard = host.closest<HTMLElement>(".dashboard-widget-card");
    const chartHeight = dashboardCard ? Math.max(140, dashboardCard.clientHeight - 64) : ({ small: 260, medium: 360, large: 460, "extra-large": 560 })[layout.chartHeight ?? "medium"];
    const horizontal = type === "horizontal";
    const style = getComputedStyle(host);
    const available = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const width = Math.max(200, available, !["donut", "number", "horizontal"].includes(type) ? groups.length * 48 + 90 : 0);
    const height = horizontal ? Math.max(chartHeight, groups.length * 40 + 80) : chartHeight;
    plot = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, "aria-label": t("Chart"), role: "group" });
    // Global SVG rules size icons; the plot must keep its own measured dimensions.
    plot.style.width = `${width}px`; plot.style.height = `${height}px`;
    scroll.append(plot); exportButton.disabled = false;
    if (type === "number") {
      const value = chartAggregate(rows, measure, layout.chartAggregation);
      if (!Number.isFinite(value)) { plot.remove(); plot = undefined; exportButton.disabled = true; fail("Chart values exceed the supported numeric range."); return; }
      const mark = svg("text", { x: width / 2, y: height / 2, "text-anchor": "middle", "dominant-baseline": "middle", class: "database-chart-number" }, format(value));
      interactive(mark, { key: "__all", label: t("All pages"), value, pages: rows }); plot.append(mark); return;
    }
    const items = split ? series.map((s, i) => ({ key: s.key, label: s.label, color: color(i) })) : groups.map((g, i) => ({ key: g.key, label: groupLabel(g), color: color(type === "line" ? 0 : i) }));
    if (layout.chartLegend !== false) for (const item of items) {
      const button = document.createElement("button"); button.type = "button"; button.style.setProperty("--chart-color", item.color);
      button.setAttribute("aria-pressed", String(!hidden.has(item.key))); button.setAttribute("aria-label", item.label);
      const swatch = document.createElement("i"); button.append(swatch, document.createTextNode(item.label));
      button.onclick = () => { hidden.has(item.key) ? hidden.delete(item.key) : hidden.add(item.key); detail.hidden = true; draw(); [...legend.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === item.label)?.focus(); };
      legend.append(button);
    }
    exportLegend = layout.chartLegend === false ? [] : items.filter(item => !hidden.has(item.key));
    const active = series.map((s, index) => ({ ...s, index })).filter(s => !split || !hidden.has(s.key));
    const visible = groups.map((g, index) => ({ ...g, index })).filter(g => split || !hidden.has(g.key));
    if (!active.length || !visible.length) { plot.append(svg("text", { x: width / 2, y: height / 2, "text-anchor": "middle" }, t("All groups hidden. Use the legend to show them."))); return; }
    if (type === "donut") {
      const total = visible.reduce((sum, group) => sum + group.value, 0);
      if (!Number.isFinite(total)) { plot.remove(); plot = undefined; exportButton.disabled = true; fail("Chart values exceed the supported numeric range."); return; }
      if (visible.some(group => group.value < 0) || total <= 0) { plot.remove(); plot = undefined; exportButton.disabled = true; fail("Donut charts require non-negative values and a positive total. Choose a bar or line chart for signed values."); return; }
      const radius = Math.min(width * .32, height * .34), stroke = radius * .35, cx = width / 2, cy = height / 2;
      const circumference = 2 * Math.PI * radius; let offset = 0;
      for (const group of visible) {
        if (!group.value) continue;
        const length = group.value / total * circumference;
        const mark = svg("circle", { cx, cy, r: radius, fill: "none", stroke: color(group.index), "stroke-width": stroke, "stroke-dasharray": `${Math.max(.1, length - (visible.length > 1 ? 2 : 0))} ${circumference - Math.max(.1, length - (visible.length > 1 ? 2 : 0))}`, "stroke-dashoffset": -offset, transform: `rotate(-90 ${cx} ${cy})` });
        interactive(mark, group); plot.append(mark);
        if (layout.chartLabels !== false && group.value / total >= .045) {
          const angle = (offset + length / 2) / circumference * Math.PI * 2 - Math.PI / 2;
          plot.append(svg("text", { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius + 4, "text-anchor": "middle", class: "database-chart-slice-label" }, `${format(group.value / total * 100)}%`));
        }
        offset += length;
      }
      if (layout.chartCenter !== false) plot.append(svg("text", { x: cx, y: cy + 4, "text-anchor": "middle", class: "database-chart-total" }, format(total)), svg("text", { x: cx, y: cy + 28, "text-anchor": "middle" }, t("Total")));
      return;
    }
    const stacked = split && layout.chartStacked !== false && type !== "line";
    const extents = visible.flatMap(g => {
      const values = active.map(s => s.points[g.index].value);
      return stacked ? [values.reduce((a, b) => a + Math.min(0, b), 0), values.reduce((a, b) => a + Math.max(0, b), 0)] : values;
    });
    let min = Math.min(0, ...extents), max = Math.max(0, ...extents);
    const span = max - min || 1;
    if (!Number.isFinite(span)) { plot.remove(); plot = undefined; exportButton.disabled = true; fail("Chart values exceed the supported numeric range."); return; }
    // Rounded ticks and headroom keep labels clear of the top edge.
    const rawStep = span / 4, power = 10 ** Math.floor(Math.log10(rawStep));
    const unit = [1, 2, 5, 10].find(n => n * power >= rawStep) ?? 10;
    const tick = unit * power;
    if (Number.isFinite(tick) && tick > 0) { min = Math.floor(min / tick) * tick; max = Math.ceil(max / tick) * tick; }
    if (!Number.isFinite(max - min)) { min = Math.min(0, ...extents); max = Math.max(0, ...extents); }
    if (max === min) max = min + 1;
    const left = horizontal ? Math.min(150, width * .3) : layout.chartAxisNames ? 80 : 62, right = width - 44, top = 30, bottom = height - (layout.chartAxisNames ? 70 : 48);
    const valuePosition = (value: number) => horizontal ? left + (value - min) / (max - min) * (right - left) : bottom - (value - min) / (max - min) * (bottom - top);
    const axisTicks = Number.isFinite(tick) && tick > 0 && (max - min) / tick <= 10 ? Array.from({ length: Math.round((max - min) / tick) + 1 }, (_, i) => min + i * tick) : [min, max];
    for (const value of axisTicks) {
      const at = valuePosition(value);
      if (layout.chartGrid !== false) plot.append(svg("line", horizontal ? { x1: at, x2: at, y1: top, y2: bottom, class: "database-chart-grid" } : { x1: left, x2: right, y1: at, y2: at, class: "database-chart-grid" }));
      plot.append(svg("text", horizontal ? { x: at, y: bottom + 22, "text-anchor": "middle" } : { x: left - 12, y: at + 4, "text-anchor": "end" }, format(value)));
    }
    plot.append(svg("line", horizontal ? { x1: valuePosition(0), x2: valuePosition(0), y1: top, y2: bottom, class: "database-chart-baseline" } : { x1: left, x2: right, y1: valuePosition(0), y2: valuePosition(0), class: "database-chart-baseline" }));
    const step = (horizontal ? bottom - top : right - left) / visible.length;
    const position = (i: number) => (horizontal ? top : left) + step * (i + .5);
    visible.forEach((group, i) => {
      const label = svg("text", horizontal ? { x: left - 12, y: position(i) + 4, "text-anchor": "end" } : { x: position(i), y: bottom + 24, "text-anchor": "middle" }, shortened(groupLabel(group), horizontal ? Math.floor(left / 7) : Math.max(5, Math.floor(step / 7))));
      label.append(svg("title", {}, groupLabel(group))); plot!.append(label);
    });
    if (layout.chartAxisNames) {
      plot.append(svg("text", { x: (left + right) / 2, y: height - 9, "text-anchor": "middle", class: "database-chart-axis-name" }, horizontal ? metric : category?.name ?? t("All pages")));
      if (!horizontal) plot.append(svg("text", { transform: `translate(15 ${(top + bottom) / 2}) rotate(-90)`, "text-anchor": "middle", class: "database-chart-axis-name" }, metric));
    }
    const positive = new Map<number, number>(), negative = new Map<number, number>();
    active.forEach((s, seriesIndex) => {
      if (type === "line") {
        // Absent numeric observations break the line instead of inventing a zero.
        const runs: { x: number; y: number }[][] = [[]];
        visible.forEach((g, i) => {
          const point = s.points[g.index];
          if (layout.chartAggregation !== undefined && layout.chartAggregation !== "count" && !point.pages.some(page => typeof fieldValue(page, measure!) === "number" && Number.isFinite(fieldValue(page, measure!)))) { if (runs.at(-1)!.length) runs.push([]); return; }
          runs.at(-1)!.push({ x: position(i), y: valuePosition(point.value) });
        });
        for (const points of runs.filter(run => run.length)) {
          let d = `M ${points[0].x} ${points[0].y}`;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            d += layout.chartSmooth ? ` C ${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}` : ` L ${b.x} ${b.y}`;
          }
          if (layout.chartArea) {
            const id = `chart-${crypto.randomUUID()}`, gradient = svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
            gradient.append(svg("stop", { offset: "0%", "stop-color": color(s.index), "stop-opacity": .25 }), svg("stop", { offset: "100%", "stop-color": color(s.index), "stop-opacity": .02 }));
            const defs = svg("defs"); defs.append(gradient); plot!.append(defs, svg("path", { d: `${d} L ${points.at(-1)!.x} ${valuePosition(0)} L ${points[0].x} ${valuePosition(0)} Z`, fill: `url(#${id})`, class: "database-chart-area" }));
          }
          plot!.append(svg("path", { d, fill: "none", stroke: color(s.index), "stroke-width": 2.5, class: "database-chart-line" }));
        }
      }
      visible.forEach((group, i) => {
        const point = s.points[group.index];
        if (type === "line" && layout.chartAggregation && layout.chartAggregation !== "count" && !point.pages.some(page => typeof fieldValue(page, measure!) === "number" && Number.isFinite(fieldValue(page, measure!)))) return;
        const fill = color(split ? s.index : type === "line" ? 0 : group.index);
        let mark: SVGElement, start = 0;
        if (stacked) { const offsets = point.value < 0 ? negative : positive; start = offsets.get(i) ?? 0; offsets.set(i, start + point.value); }
        const end = start + point.value, from = valuePosition(start), to = valuePosition(end);
        const size = Math.min(horizontal ? 24 : 44, step * .6) / (split && !stacked && type !== "line" ? active.length : 1);
        const center = position(i) + (split && !stacked && type !== "line" ? (seriesIndex - (active.length - 1) / 2) * size : 0);
        if (type === "line") mark = svg("circle", { cx: center, cy: to, r: 4.5, fill });
        else if (horizontal) mark = svg("rect", { x: Math.min(from, to), y: center - size / 2, width: Math.max(1, Math.abs(to - from)), height: size, rx: stacked ? 0 : 2, fill });
        else mark = svg("rect", { x: center - size / 2, y: Math.min(from, to), width: size, height: Math.max(1, Math.abs(to - from)), rx: stacked ? 0 : 2, fill });
        if (stacked && point.value === 0) return;
        interactive(mark, point); plot!.append(mark);
        if (layout.chartLabels !== false && !stacked) plot!.append(svg("text", horizontal ? { x: to + (point.value < 0 ? -6 : 6), y: center + 4, "text-anchor": point.value < 0 ? "end" : "start" } : { x: center, y: to + (point.value < 0 ? 17 : -10), "text-anchor": "middle" }, format(point.value)));
      });
    });
    if (stacked && layout.chartLabels !== false) for (let i = 0; i < visible.length; i++) for (const value of [positive.get(i), negative.get(i)]) {
      if (!value) continue;
      plot.append(svg("text", horizontal ? { x: valuePosition(value) + (value < 0 ? -6 : 6), y: position(i) + 4, "text-anchor": value < 0 ? "end" : "start" } : { x: position(i), y: valuePosition(value) + (value < 0 ? 17 : -10), "text-anchor": "middle" }, format(value)));
    }
  }
  exportButton.onclick = () => {
    popup?.destroy(); popup = new DatabasePopover(exportButton, "Save chart as…");
    const panel = popup.panel("Save chart as…"); let transparent = false;
    panel.append(menuToggle("Transparent background", false, value => transparent = value));
    for (const kind of ["png", "svg"] as const) panel.append(menuButton(`Download ${kind.toUpperCase()}`, undefined, () => {
      if (!plot) return;
      const background = transparent ? "none" : getComputedStyle(host).getPropertyValue("--bg").trim() || "#ffffff";
      void popup!.perform(() => downloadChart(plot!, view.name, exportLegend, kind, background));
    }));
  };
  draw();
  let lastWidth = host.clientWidth, lastHeight = host.clientHeight;
  const observer = new ResizeObserver(() => {
    if (!host.isConnected) { observer.disconnect(); popup?.destroy(); return; }
    if (host.clientWidth !== lastWidth || host.closest(".dashboard-widget-card") && host.clientHeight !== lastHeight) { lastWidth = host.clientWidth; lastHeight = host.clientHeight; draw(); }
  }); observer.observe(host);
  return () => { observer.disconnect(); popup?.destroy(); };
}
