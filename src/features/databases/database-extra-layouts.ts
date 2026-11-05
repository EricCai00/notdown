import "./database-extra-layouts.css";
import { t } from "../../shared/i18n";
import type { Page } from "../../shared/types";
import { databasePropertyReadOnly, type DatabaseDataSource, type DatabaseProperty, type DatabaseView } from "./database-model";
import { type LayoutActions } from "./database-layouts";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") { const node = document.createElement(tag); node.textContent = text; return node; }
const formTypes = new Set(["title", "text", "number", "checkbox", "date", "select", "multi_select", "status", "url", "email", "phone"]);
export function renderForm(host: HTMLElement, source: DatabaseDataSource, fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  const form = el("form"); form.className = "database-response-form"; form.append(el("h2", view.name), el("p", t("Responses are saved in this local database.")));
  const title = source.properties.find(field => field.type === "title");
  const questions = [...(title ? [title] : []), ...fields.filter(field => field.type !== "title" && !databasePropertyReadOnly(field) && formTypes.has(field.type))];
  const controls = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
  for (const field of questions) {
    const label = el("label", field.name); let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (["select", "multi_select", "status"].includes(field.type)) {
      const select = el("select"); select.multiple = field.type === "multi_select"; if (!select.multiple) select.append(new Option("", ""));
      for (const option of field.options ?? []) select.append(new Option(option.name, option.id)); input = select;
    } else if (field.type === "text") input = el("textarea");
    else { const control = el("input"); control.type = ({ number: "number", checkbox: "checkbox", date: "date", url: "url", email: "email", phone: "tel" } as Record<string,string>)[field.type] ?? "text"; if (field.type === "number") control.step = "any"; input = control; }
    input.name = field.id; input.required = field.type === "title" || !!view.layout?.formRequiredIds?.includes(field.id); input.setAttribute("aria-label", field.name); label.append(input); controls.set(field.id, input); form.append(label);
  }
  const draftKey = "notdown-form:" + source.id + ":" + view.id;
  try { const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "{}"); for (const [id, input] of controls) if (id in draft) { if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = draft[id] === true; else if (input instanceof HTMLSelectElement && input.multiple && Array.isArray(draft[id])) Array.from(input.options).forEach(option => option.selected = draft[id].includes(option.value)); else if (typeof draft[id] === "string") input.value = draft[id]; } } catch { /* Storage is optional. */ }
  form.oninput = () => { const draft: Record<string, unknown> = {}; for (const [id, input] of controls) draft[id] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input instanceof HTMLSelectElement && input.multiple ? Array.from(input.selectedOptions, option => option.value) : input.value; try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Keep live inputs. */ } };
  const submit = el("button", t("Submit response")); submit.type = "submit"; submit.disabled = !actions.submit || !!source.unavailable || !!source.trashed;
  const status = el("p"); status.setAttribute("role", "status"); form.append(submit, status);
  form.onsubmit = async event => {
    event.preventDefault(); if (submit.disabled || !form.reportValidity()) return;
    const titleValue = title ? controls.get(title.id)!.value.trim() : ""; if (!titleValue) return;
    const properties: Record<string, unknown> = {};
    for (const field of questions.filter(field => field.type !== "title")) {
      const input = controls.get(field.id)!;
      if (field.type === "checkbox") properties[field.key] = (input as HTMLInputElement).checked;
      else if (field.type === "multi_select") properties[field.key] = Array.from((input as HTMLSelectElement).selectedOptions, option => option.value);
      else if (input.value !== "") properties[field.key] = field.type === "number" ? Number(input.value) : field.type === "date" ? { start: input.value } : input.value;
    }
    submit.disabled = true; status.textContent = "";
    try { await actions.submit!(titleValue, properties); form.reset(); try { sessionStorage.removeItem(draftKey); } catch {} status.textContent = t("Response saved."); }
    catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { submit.disabled = false; }
  };
  host.append(form);
}
