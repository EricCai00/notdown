import { api, escape as e, type Page } from "../../shared/types";
import type { Person } from "../people/person";
import { externalLibrary, refreshExternalEntities, setExternalLibrary } from "./external-client";
import { unknownEntityLabel, type ExternalLibrary } from "./external-entity";
import { internalLibrary } from "./internal-library";
import type { ReferenceOccurrenceTarget } from "./reference-occurrences";
import "./external-references.css";

export interface ReferenceOrigin extends Partial<ReferenceOccurrenceTarget> { pageId: string; location: string }

export async function openExternalLibrary(options: { onOpenReference: (origin: ReferenceOrigin) => Promise<void>; onError: (error: unknown) => void }) {
  if (document.querySelector(".external-library-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "external-library-dialog";
  dialog.setAttribute("aria-label", "External references");
  dialog.innerHTML = '<header><h2>External references</h2><button type="button" aria-label="Close external references">×</button></header><p>Unresolved internal references are shown by default. Ordinary web URLs do not need resolving. Later imports can connect matching source IDs; names alone do not establish a match.</p><input type="search" aria-label="Search external references" placeholder="Search names, types or source IDs"><label class="external-library-filter"><input type="checkbox" aria-label="Include resolved references"> Include resolved references</label><output role="status">Loading…</output><div class="external-library-list"></div>';
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector("button")!.onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  const status = dialog.querySelector("output")!, list = dialog.querySelector(".external-library-list")!, search = dialog.querySelector<HTMLInputElement>('input[type="search"]')!, includeResolved = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  try {
    const [, pages, people] = await Promise.all([refreshExternalEntities(), api<Page[]>("/pages"), api<Person[]>("/people")]);
    let snapshot = externalLibrary();
    const local = internalLibrary(pages), pageTitles = new Map(pages.map(page => [page.id, page.title]));
    const origins = (row: HTMLElement, references: ReferenceOrigin[]) => {
      const group = document.createElement("div"); group.className = "external-library-origins";
      for (const reference of references) {
        const button = document.createElement("button"); button.type = "button";
        const title = pageTitles.get(reference.pageId) || reference.pageId;
        button.textContent = `Go to reference · ${title} · ${reference.location}${reference.occurrence !== undefined ? ` ${reference.occurrence + 1}` : ""}`;
        button.onclick = () => { dialog.close(); void options.onOpenReference(reference).catch(options.onError); };
        group.append(button);
      }
      row.append(group);
    };
    const render = () => {
      list.replaceChildren();
      const matches = (text: string) => text.toLowerCase().includes(search.value.toLowerCase());
      for (const entity of snapshot.entities.filter(entity => entity.references.length && (includeResolved.checked || entity.status !== "resolved") && matches(`${entity.label ?? ""} ${entity.id} ${entity.kind} ${unknownEntityLabel(entity.kind)}`))) {
        const row = document.createElement("div"); row.className = "external-library-row";
        row.innerHTML = `<strong>${e(entity.status === "resolved" ? entity.label || unknownEntityLabel(entity.kind) : unknownEntityLabel(entity.kind))} · ${entity.status === "resolved" ? "Linked" : entity.status === "ambiguous" ? "Multiple matches" : "Unresolved"}</strong><small>${e(entity.label || "")} · Notion ${e(entity.kind)} · ${e(entity.id)}<br>${entity.references.length} reference locations · ${entity.importIds.length} import batches</small>`;
        origins(row, entity.references.map(ref => ({ ...ref, key: entity.key })));
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
      for (const entry of local.entries.filter(entry => (includeResolved.checked || entry.status !== "resolved") && matches(`${entry.label} ${entry.target} Internal link`))) {
        const row = document.createElement("div"); row.className = "external-library-row";
        row.innerHTML = `<strong>${e(entry.label)} · ${entry.status === "resolved" ? "Linked" : "Unresolved"}</strong><small>Internal link · ${e(entry.target)}<br>${entry.references.length} reference locations</small>`;
        origins(row, entry.references); list.append(row);
      }
      if (!list.childElementCount) list.textContent = "No matching external references.";
    };
    search.oninput = render;
    includeResolved.onchange = render;
    const warnings = [...new Set([...snapshot.warnings, ...local.warnings])];
    status.textContent = `${snapshot.entities.filter(entity => entity.references.length).length + local.entries.length} internal references${warnings.length ? ` · ${warnings.join(" ")}` : ""}`;
    render();
  } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
}
