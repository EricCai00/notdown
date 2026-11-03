import { escape as e } from "../../shared/types";
import { t, setUIAttribute } from "../../shared/i18n";
import { type DatabaseDataSource, type DatabaseView } from "./database-model";
import { filterOperators, type ViewFilter } from "./database-query";

export const viewLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);
const options = (values: { id: string; name: string }[], selected?: string, localize = false) => values.map(value => `<option value="${e(value.id)}" ${value.id === selected ? "selected" : ""}>${e(localize ? t(value.name) : value.name)}</option>`).join("");
export function wireQuerySettings(dialog: HTMLElement, source: DatabaseDataSource, view: DatabaseView) {
  const filtersHost = dialog.querySelector<HTMLElement>("[data-view-filters]")!, sortsHost = dialog.querySelector<HTMLElement>("[data-view-sorts]")!;
  const fields = [{ id: "", name: t("None") }, ...source.properties];
  function addFilter(filter?: ViewFilter) {
    const row = document.createElement("div"); row.className = "database-filter-row"; row.dataset.queryFilter = "";
    row.innerHTML = `<select aria-label="Filter property" data-i18n-aria-label="Filter property">${options(fields, filter?.propertyId)}</select><select aria-label="Filter operator" data-i18n-aria-label="Filter operator"></select><span data-value></span><button type="button" aria-label="Remove filter" data-i18n-aria-label="Remove filter">×</button>`;
    const property = row.querySelector("select")!, operator = row.querySelectorAll("select")[1], valueHost = row.querySelector<HTMLElement>("[data-value]")!;
    const values = (value = "") => {
      const field = source.properties.find(field => field.id === property.value); valueHost.replaceChildren();
      if (["is_empty", "is_not_empty"].includes(operator.value)) return;
      const select = !["contains", "does_not_contain"].includes(operator.value) && field && ["select", "status", "multi_select", "checkbox"].includes(field.type);
      const input = document.createElement(select ? "select" : "input"); setUIAttribute(input, "aria-label", operator.value === "contains" ? "Contains" : "Filter value"); input.dataset.filterValue = "";
      if (input instanceof HTMLSelectElement) input.innerHTML = options(field?.type === "checkbox" ? [{ id: "true", name: "Checked" }, { id: "false", name: "Unchecked" }] : field?.options ?? [], value, field?.type === "checkbox");
      else { input.type = !["contains", "does_not_contain"].includes(operator.value) && field?.type === "date" ? "date" : field?.type === "number" && !["contains", "does_not_contain"].includes(operator.value) ? "number" : "text"; input.value = value; input.step = "any"; }
      valueHost.append(input);
    };
    const update = (op = "contains", value = "") => { const field = source.properties.find(field => field.id === property.value); operator.innerHTML = options((field ? filterOperators(field) : ["contains"]).map(id => ({ id, name: id.replaceAll("_", " ") })), op, true); values(value); };
    property.onchange = () => update(); operator.onchange = () => values(); row.querySelector("button")!.onclick = () => row.remove(); update(filter?.operator, filter?.value); filtersHost.append(row);
  }
  function addSort(sort?: { propertyId: string; direction: string }) { const row = document.createElement("div"); row.className = "database-filter-row"; row.dataset.querySort = ""; row.innerHTML = `<select aria-label="Sort by" data-i18n-aria-label="Sort by">${options(fields, sort?.propertyId)}</select><select aria-label="Direction" data-i18n-aria-label="Direction">${options([{ id: "ascending", name: "Ascending" }, { id: "descending", name: "Descending" }], sort?.direction)}</select><button type="button" aria-label="Remove sort" data-i18n-aria-label="Remove sort">×</button>`; row.querySelector("button")!.onclick = () => row.remove(); sortsHost.append(row); }
  ((view.filters?.length ? view.filters : [undefined]) as (ViewFilter | undefined)[]).forEach(addFilter);
  ((view.sorts?.length ? view.sorts : [undefined]) as ({ propertyId: string; direction: string } | undefined)[]).forEach(addSort);
  dialog.querySelector<HTMLButtonElement>("[data-add-filter]")!.onclick = () => addFilter(); dialog.querySelector<HTMLButtonElement>("[data-add-sort]")!.onclick = () => addSort();
}
export function readQuerySettings(dialog: HTMLElement) {
  const filters = [...dialog.querySelectorAll<HTMLElement>("[data-query-filter]")].map(row => ({ propertyId: row.querySelector("select")!.value, operator: row.querySelectorAll("select")[1].value, value: row.querySelector<HTMLInputElement>("[data-filter-value]")?.value ?? "" })).filter(filter => filter.propertyId);
  const sorts = [...dialog.querySelectorAll<HTMLElement>("[data-query-sort]")].map(row => ({ propertyId: row.querySelector("select")!.value, direction: row.querySelectorAll("select")[1].value })).filter(sort => sort.propertyId);
  return { filters, sorts };
}
