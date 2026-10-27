import { api, escape as e, type Page } from "../../shared/types";
import type { Person } from "../people/person";
import { externalLibrary, refreshExternalEntities, setExternalLibrary } from "./external-client";
import { unknownEntityLabel, type ExternalLibrary } from "./external-entity";
import "./external-references.css";

export async function openExternalLibrary() {
  if (document.querySelector(".external-library-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "external-library-dialog";
  dialog.setAttribute("aria-label", "External references");
  dialog.innerHTML = '<header><h2>External references</h2><button type="button" aria-label="Close external references">×</button></header><p>Later imports automatically connect matching objects. Names alone do not establish a match. Choose a local target for unknown references or multiple copies.</p><input type="search" aria-label="Search external references" placeholder="Search names, types or source IDs"><output role="status">Loading…</output><div class="external-library-list"></div>';
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector("button")!.onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  const status = dialog.querySelector("output")!, list = dialog.querySelector(".external-library-list")!, search = dialog.querySelector("input")!;
  try {
    const [, pages, people] = await Promise.all([refreshExternalEntities(), api<Page[]>("/pages"), api<Person[]>("/people")]);
    let snapshot = externalLibrary();
    const render = () => {
      list.replaceChildren();
      for (const entity of snapshot.entities.filter(entity => `${entity.label ?? ""} ${entity.id} ${entity.kind} ${unknownEntityLabel(entity.kind)}`.toLowerCase().includes(search.value.toLowerCase()))) {
        const row = document.createElement("div"); row.className = "external-library-row";
        row.innerHTML = `<strong>${e(entity.status === "resolved" ? entity.label || unknownEntityLabel(entity.kind) : unknownEntityLabel(entity.kind))} · ${entity.status === "resolved" ? "Linked" : entity.status === "ambiguous" ? "Multiple matches" : "Unresolved"}</strong><small>${e(entity.label || "")} · Notion ${e(entity.kind)} · ${e(entity.id)}<br>${entity.references.length} reference areas · ${entity.importIds.length} import batches</small>`;
        if (["page", "database", "user"].includes(entity.kind)) {
          const label = document.createElement("label"); label.textContent = "Local target ";
          const select = document.createElement("select"); select.setAttribute("aria-label", `Local target for ${entity.id}`);
          select.innerHTML = '<option value="">Match source ID automatically</option>';
          const candidates = entity.kind === "user" ? people.map(person => ({ id: person.id, title: person.name })) : pages.filter(page => entity.kind !== "database" || page.databaseId);
          for (const candidate of candidates) { const option = document.createElement("option"); option.value = candidate.id; option.textContent = `${candidate.title} · ${candidate.id.slice(0, 8)}`; select.append(option); }
          select.value = entity.localId || "";
          const save = document.createElement("button"); save.type = "button"; save.textContent = "Save link";
          save.onclick = async () => {
            dialog.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button,select").forEach(element => { element.disabled = true; });
            try {
              snapshot = await api<ExternalLibrary>("/external-entities/binding", { method: "PUT", body: JSON.stringify({ key: entity.key, localId: select.value || null, baseRevision: snapshot.revision }) });
              setExternalLibrary(snapshot); status.textContent = "Link saved. Original note content was preserved."; render();
            } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
            finally { dialog.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button,select").forEach(element => { element.disabled = false; }); }
          };
          label.append(select, save); row.append(label);
        }
        list.append(row);
      }
      if (!list.childElementCount) list.textContent = "No matching external references.";
    };
    search.oninput = render;
    status.textContent = `${snapshot.entities.length} external entities${snapshot.warnings.length ? ` · ${snapshot.warnings.join(" ")}` : ""}`;
    render();
  } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
}
