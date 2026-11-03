import { languageChanged, setUIAttribute, setUILanguage, setUIText, uiLanguage, type UILanguage } from "../shared/i18n";

export function mountLanguageSettings(container: HTMLElement) {
  const section = document.createElement("section");
  section.className = "settings-section language-settings";
  const heading = document.createElement("h3"); setUIText(heading, "Language");
  const row = document.createElement("label"); row.className = "switch-row";
  const label = document.createElement("span"); setUIText(label, "Interface language");
  const select = document.createElement("select"); select.name = "ui-language";
  setUIAttribute(select, "aria-label", "Interface language");
  select.append(new Option("English", "en"), new Option("简体中文", "zh-CN"));
  select.value = uiLanguage();
  select.addEventListener("change", () => setUILanguage(select.value as UILanguage));
  const sync = () => { select.value = uiLanguage(); };
  window.addEventListener(languageChanged, sync);
  const dialog = container.closest("dialog");
  dialog?.addEventListener("close", () => window.removeEventListener(languageChanged, sync), { once: true });
  row.append(label, select);
  const hint = document.createElement("p"); setUIText(hint, "Choose the interface language. Saved on this device; your notes stay unchanged.");
  section.append(heading, row, hint);
  container.querySelector(".settings-category-heading")?.after(section);
}
