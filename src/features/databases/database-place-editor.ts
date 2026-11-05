import { t } from "../../shared/i18n";
import { googleMapsUrl, photonPlaces, placeText, readPlace, validCoordinates, type DatabasePlace } from "./database-place";
import "./database-map.css";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") { const node = document.createElement(tag); node.textContent = text; return node; }
export function mapsLink(place: DatabasePlace) {
  const link = element("a", t("Open in Google Maps")); link.href = googleMapsUrl(place); link.target = "_blank"; link.rel = "noopener noreferrer"; return link;
}
export function openPlaceEditor(value: unknown, commit: (place: DatabasePlace | null) => void, anchor: HTMLElement, host: HTMLElement = document.body) {
  if (document.querySelector(".database-place-dialog")) return;
  const original = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const place = readPlace(value), dialog = element("dialog"), form = element("form");
  dialog.className = "database-place-dialog"; dialog.setAttribute("aria-label", t("Edit place"));
  const input = (label: string, value: string, type = "text") => {
    const wrapper = element("label", t(label)), control = element("input"); control.type = type; control.value = value; control.setAttribute("aria-label", t(label));
    if (type === "number") control.step = "any"; else control.maxLength = 1000;
    wrapper.append(control); form.append(wrapper); return control;
  };
  form.append(element("h2", t("Edit place")));
  const name = input("Place name", typeof original.name === "string" ? original.name : ""), address = input("Address", typeof original.address === "string" ? original.address : "");
  const latitude = input("Latitude", place ? String(place.latitude) : "", "number"), longitude = input("Longitude", place ? String(place.longitude) : "", "number");
  latitude.min = "-90"; latitude.max = "90"; longitude.min = "-180"; longitude.max = "180"; latitude.required = longitude.required = true;
  const query = input("Search for a place", ""), search = element("button", t("Search places")); search.type = "button";
  form.append(search, element("small", t("Search sends this query to Photon (OpenStreetMap). You can also enter coordinates offline.")));
  const credit = element("a", "© OpenStreetMap contributors · Photon"); credit.href = "https://www.openstreetmap.org/copyright"; credit.target = "_blank"; credit.rel = "noopener noreferrer"; form.append(credit);
  const results = element("div"), status = element("p"); results.className = "database-place-results"; status.setAttribute("role", "status"); form.append(results, status);
  let request: AbortController | undefined, version = 0;
  const cancelSearch = () => { version++; request?.abort(); search.disabled = false; results.replaceChildren(); status.textContent = ""; };
  query.oninput = cancelSearch;
  search.onclick = async () => {
    const q = query.value.trim(); if (q.length < 2) { status.textContent = t("Enter at least two characters to search."); return; }
    cancelSearch(); const current = version, controller = new AbortController(); request = controller; search.disabled = true; status.textContent = t("Searching places…");
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("Search unavailable");
      const places = photonPlaces(await response.json()); if (!dialog.open || current !== version) return;
      status.textContent = places.length ? t("Select a result, then save the place.") : t("No places found. Try a fuller address or enter coordinates.");
      for (const result of places) {
        const button = element("button", placeText(result)); button.type = "button";
        button.onclick = () => { name.value = result.name ?? ""; address.value = result.address ?? ""; latitude.value = String(result.latitude); longitude.value = String(result.longitude); results.replaceChildren(); status.textContent = t("Place selected. Save to apply."); };
        results.append(button);
      }
    } catch { if (dialog.open && current === version) status.textContent = t("Place search is unavailable. Try again or enter coordinates manually."); }
    finally { clearTimeout(timeout); if (current === version) search.disabled = false; }
  };
  query.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); if (!search.disabled) search.click(); } };
  const footer = element("footer"), cancel = element("button", t("Cancel")), clear = element("button", t("Clear place")), save = element("button", t("Save place"));
  cancel.type = clear.type = "button"; save.type = "submit"; cancel.onclick = () => dialog.close(); clear.onclick = () => { commit(null); dialog.close(); }; footer.append(clear, cancel, save); form.append(footer);
  form.onsubmit = event => {
    event.preventDefault(); const a = Number(latitude.value), b = Number(longitude.value);
    if (!form.reportValidity() || !validCoordinates(a, b)) return;
    commit({ ...original, name: name.value.trim(), address: address.value.trim(), latitude: a, longitude: b }); dialog.close();
  };
  // A bulk-property popover can own this modal. Consume Escape before its
  // document-level handler so cancelling the modal keeps the bulk editor open.
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.close(); } };
  dialog.onclose = () => { window.removeEventListener("keydown", escape, true); cancelSearch(); dialog.remove(); if (anchor.isConnected) anchor.focus(); };
  dialog.append(form); host.append(dialog); dialog.showModal(); window.addEventListener("keydown", escape, true); name.focus();
}
export function placeInput(value: unknown, label: string, commit: (place: DatabasePlace | null) => void, host?: HTMLElement) {
  const wrapper = element("div"), edit = element("button", placeText(value) || t("Add place")); wrapper.className = "database-cell database-place-cell";
  edit.type = "button"; edit.setAttribute("aria-label", label); edit.setAttribute("aria-haspopup", "dialog");
  edit.onclick = () => openPlaceEditor(value, next => { value = next; edit.textContent = placeText(next) || t("Add place"); wrapper.querySelector("a")?.remove(); if (next) wrapper.append(mapsLink(next)); commit(next); }, edit, host);
  wrapper.append(edit); const place = readPlace(value); if (place) wrapper.append(mapsLink(place)); return wrapper;
}
