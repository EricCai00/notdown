import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./database-map.css";
import { t } from "../../shared/i18n";
import { pageIconElement } from "../../shared/page-icons";
import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseLayout, DatabaseView } from "./database-model";
import type { LayoutActions } from "./database-layouts";
import { fieldValue } from "./database-query";
import { mapColors, mapHeights, mapPinLimit, mapRecords } from "./database-map-model";
import { mapsLink, openPlaceEditor } from "./database-place-editor";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") { const node = document.createElement(tag); node.textContent = text; return node; }
function button(text: string, action: () => void) { const node = el("button", text); node.type = "button"; node.onclick = action; return node; }
export function renderMap(host: HTMLElement, source: DatabaseDataSource, rows: Page[], view: DatabaseView, actions: LayoutActions) {
  const controls = el("div"), status = el("p"), model = mapRecords(source, rows, view); controls.className = "database-map-controls"; status.setAttribute("role", "status");
  let saving = false, dead = false;
  async function save(patch: Partial<DatabaseLayout>, select: HTMLSelectElement) {
    if (!actions.configure || saving) return;
    saving = true; controls.querySelectorAll("select").forEach(control => control.disabled = true);
    try { await actions.configure(patch); }
    catch (error) { if (!dead) { select.value = select.dataset.saved ?? ""; status.textContent = error instanceof Error ? error.message : String(error); } }
    finally { saving = false; if (!dead) controls.querySelectorAll("select").forEach(control => control.disabled = !actions.configure); }
  }
  function select(label: string, choices: [string, string][], value: string, patch: (id: string) => Partial<DatabaseLayout>) {
    const wrapper = el("label", t(label)), control = el("select"); control.setAttribute("aria-label", t(label));
    for (const [id, name] of choices) control.append(new Option(name, id)); control.value = value; control.dataset.saved = value; control.disabled = !actions.configure;
    control.onchange = () => { void save(patch(control.value), control); }; wrapper.append(control); controls.append(wrapper);
  }
  select("Map by", [["", t("Coordinates")], ...source.properties.filter(field => field.type === "place").map(field => [field.id, field.name] as [string, string])], model.placeField?.id ?? "", id => ({ mapPlaceId: id }));
  const numbers = source.properties.filter(field => field.type === "number");
  // Keep coordinate selectors reachable for legacy views and switching sources.
  if (!model.placeField || numbers.length) {
    const choices: [string, string][] = [["", t("Choose a property")], ...numbers.map(field => [field.id, field.name] as [string, string])];
    select("Latitude", choices, view.layout?.mapLatitudeId ?? "", id => ({ mapPlaceId: "", mapLatitudeId: id }));
    select("Longitude", choices, view.layout?.mapLongitudeId ?? "", id => ({ mapPlaceId: "", mapLongitudeId: id }));
  }
  select("Height", Object.keys(mapHeights).map(id => [id, t(({ small: "Small", medium: "Medium", large: "Large", "extra-large": "Extra large" } as Record<string, string>)[id])]), view.layout?.mapHeight ?? "medium", id => ({ mapHeight: id as DatabaseLayout["mapHeight"] }));
  select("Color by", [["", t("None")], ...source.properties.filter(field => ["select", "status", "multi_select"].includes(field.type)).map(field => [field.id, field.name] as [string, string])], view.layout?.mapColorBy ?? "", id => ({ mapColorBy: id }));
  host.append(controls, status);
  if (!model.configured) { host.append(el("p", t("Choose a Place property or numeric latitude and longitude properties to place records on the map."))); return () => { dead = true; }; }
  const summary = el("p", t("{shown} of {total} places on map · {missing} without coordinates", { shown: model.pinned, total: rows.length, missing: rows.length - model.located })); summary.className = "database-map-summary"; host.append(summary);
  if (model.located > mapPinLimit) host.append(el("p", t("Only the first 100 located records are pinned. Use filters or search to narrow the map.")));
  const canvas = el("div"); canvas.className = "database-map-canvas"; canvas.style.height = `${mapHeights[view.layout?.mapHeight ?? "medium"] ?? mapHeights.medium}px`; canvas.setAttribute("aria-label", t("Record map")); canvas.setAttribute("role", "region"); host.append(canvas);
  const map = L.map(canvas, { scrollWheelZoom: false }).setView([20, 0], 2), tileStatus = el("p"); tileStatus.className = "database-map-tile-status"; tileStatus.setAttribute("role", "status"); host.append(tileStatus);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  let failedTiles = false;
  tiles.on("tileerror", () => { failedTiles = true; tileStatus.textContent = t("Map tiles could not load. You can still use the markers and record list."); });
  tiles.on("loading", () => { failedTiles = false; }); tiles.on("load", () => { if (!failedTiles) tileStatus.textContent = ""; });
  const list = el("div"), points: L.LatLngTuple[] = [], legend = el("div"), categories = new Set<string>(); list.className = "database-map-records"; list.setAttribute("aria-label", t("Places")); legend.className = "database-map-legend";
  for (const record of model.records) {
    const { page, place, color, category, categoryId, pinned } = record;
    const row = el("article"), title = button(page.title, () => actions.open(page)); row.dataset.pageId = page.id; row.className = "database-map-record"; title.className = "database-map-title";
    if (view.layout?.showPageIcon !== false) title.prepend(pageIconElement(page.icon || "file-text"));
    const details = el("div"), tools = el("div"); details.className = "database-map-details"; tools.className = "database-map-actions"; details.append(title);
    if (model.colorField) { const tag = el("span", category || t("No category")); tag.className = "database-tag"; tag.dataset.color = color; details.append(tag); }
    if (place) {
      const description = [place.name, place.address].filter(item => typeof item === "string" && item).join(" · ");
      details.append(el("span", description || `${place.latitude}, ${place.longitude}`)); tools.append(mapsLink(place));
      if (pinned) {
        const point: L.LatLngTuple = [place.latitude, place.longitude]; points.push(point);
        const icon = el("span"); icon.className = "database-map-marker"; icon.style.setProperty("--pin-color", mapColors[color]); icon.append(el("i"));
        const popup = el("div"); popup.className = "database-map-popup"; popup.append(button(page.title, () => actions.open(page)));
        if (description) popup.append(el("p", description)); popup.append(mapsLink(place));
        const marker = L.marker(point, { title: page.title, alt: page.title, keyboard: true, icon: L.divIcon({ className: "database-map-pin", html: icon, iconSize: [30, 38], iconAnchor: [15, 38], popupAnchor: [0, -36] }) }).addTo(map).bindPopup(popup);
        marker.on("popupopen", () => { list.querySelectorAll(".is-selected").forEach(item => item.classList.remove("is-selected")); row.classList.add("is-selected"); });
        tools.prepend(button(t("Show on map"), () => { map.setView(point, Math.max(map.getZoom(), 12)); marker.openPopup(); }));
        if (model.colorField && !categories.has(categoryId)) { categories.add(categoryId); const key = el("span", category || t("No category")), dot = el("i"); dot.style.backgroundColor = mapColors[color]; key.prepend(dot); legend.append(key); }
      } else details.append(el("small", t("Outside the first 100 pins")));
    } else details.append(el("span", t("Missing or invalid coordinates")));
    if (model.placeField && actions.reference && actions.writable(page, model.placeField)) {
      const field = model.placeField;
      const edit = button(t(place ? "Edit place" : "Add place"), () => openPlaceEditor(fieldValue(page, field), next => actions.reference!(page, field, next), edit)); tools.append(edit);
    }
    row.append(details, tools); list.append(row);
  }
  const fit = () => { if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 }); };
  const fitButton = button(t("Fit all places"), fit); fitButton.disabled = !points.length; controls.append(fitButton); fit();
  if (!model.located) host.append(el("p", t("No places to show yet. Add a place to a record or adjust your filters.")));
  if (legend.childElementCount) host.append(legend);
  host.append(el("p", t("Map tiles require internet access. Coordinates and records remain in your vault.")), list);
  const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(canvas);
  return () => { dead = true; observer.disconnect(); map.remove(); };
}
