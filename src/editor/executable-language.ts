import type { Node as PMNode } from "prosemirror-model";
import { executionLanguage, languageLabel, quartoLanguages, type QuartoLanguage } from "../markdown-engine/quarto";

const languageKey = "notdown-executable-language";
export function lastExecutableLanguage(multiple = true): QuartoLanguage {
  if (!multiple) return "r";
  try {
    const value = localStorage.getItem(languageKey) as QuartoLanguage;
    if (quartoLanguages.includes(value)) return value;
  } catch { /* Storage may be disabled. */ }
  return "r";
}
export function rememberExecutableLanguage(language: QuartoLanguage) {
  try { localStorage.setItem(languageKey, language); } catch { /* Keep editing without storage. */ }
}

/** Both insertion and existing cells use the same language choices. */
export function executableLanguageChoices(multiple: boolean, current: QuartoLanguage | undefined, select: (language: QuartoLanguage) => void) {
  const group = document.createElement("div");
  group.className = "pm-executable-languages";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Execution language");
  for (const language of multiple ? quartoLanguages : ["r"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = languageLabel(language);
    button.setAttribute("aria-pressed", String(language === current));
    button.onclick = () => select(language);
    group.append(button);
  }
  group.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!buttons.length) return;
    event.preventDefault(); event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  return group;
}

/** A language change updates syntax attributes only. Program text is immutable here. */
export function withExecutionLanguage(node: PMNode, language: QuartoLanguage): PMNode {
  if (executionLanguage(node) === language) return node;
  if (node.isInline) {
    const raw = "`" + (language === "r" ? "r" : `{${language}}`) + " " + node.textContent + "`";
    return node.type.create({ ...node.attrs, language, raw, expression: node.textContent }, node.content, node.marks);
  }
  return node.type.create({ ...node.attrs, language, header: `{${language}}` }, node.content, node.marks);
}
