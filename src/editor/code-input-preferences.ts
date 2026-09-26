export type CodeInputMode = "notion" | "markdown";
const modeKey = "notdown-code-input-mode";
const languageKey = "notdown-code-input-language";
export const codeInputPreferenceEvent = "notdown-code-input-preference";

export function codeInputMode(): CodeInputMode {
  try { return localStorage.getItem(modeKey) === "markdown" ? "markdown" : "notion"; }
  catch { return "notion"; }
}

export function setCodeInputMode(mode: CodeInputMode) {
  try { localStorage.setItem(modeKey, mode); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event(codeInputPreferenceEvent));
}

export function lastCodeLanguage(): string {
  try {
    const value = localStorage.getItem(languageKey) || "";
    return /^[\p{L}\p{N}_+#. -]{0,80}$/u.test(value) ? value : "";
  }
  catch { return ""; }
}

export function rememberCodeLanguage(language: string) {
  if (!/^[\p{L}\p{N}_+#. -]{0,80}$/u.test(language)) return;
  try { localStorage.setItem(languageKey, language); } catch { /* Keep editing without storage. */ }
}
