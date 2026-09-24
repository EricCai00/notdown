import { createHighlighterCoreSync, type LanguageRegistration } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import lean from "@shikijs/langs/lean4";
import wenyan from "@shikijs/langs/wenyan";
import sed from "./grammars/sed.tmLanguage.json";
import type { CodeHighlightRange } from "./code-highlighting";

// Use the existing TextMate grammars; initialize once, only when one is displayed.
// A small local theme maps tokens into the same CSS palette as Prism decorations.
const styles = [
  { scope: ["comment", "punctuation"], color: "#8b8a86", token: "comment" },
  { scope: ["keyword", "storage", "constant", "support.constant"], color: "#9b4b8f", token: "keyword" },
  { scope: ["string"], color: "#a5523d", token: "string" },
  { scope: ["entity.name", "support.function", "support.type"], color: "#206a9a", token: "function" },
  { scope: ["variable"], color: "#4f5e77", token: "variable" },
];

let highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;
// JSON inference introduces optional capture-map keys; the vendored file follows TextMate's schema.
const grammars = { lean4: lean, wenyan, sed: sed as unknown as LanguageRegistration };

export function hasTextmateGrammar(language: string): boolean {
  return Object.hasOwn(grammars, language);
}

export function textmateCodeRanges(code: string, language: string): CodeHighlightRange[] {
  if (!hasTextmateGrammar(language)) return [];
  highlighter ??= createHighlighterCoreSync({
    langs: [],
    engine: createJavaScriptRegexEngine(),
    themes: [{
      name: "notdown-code", type: "light",
      colors: { "editor.foreground": "#37352f", "editor.background": "#f7f7f5" },
      settings: styles.map(style => ({ scope: style.scope, settings: { foreground: style.color } })),
    }],
  });
  if (!highlighter.getLoadedLanguages().includes(language))
    highlighter.loadLanguageSync(grammars[language as keyof typeof grammars]);
  const ranges: CodeHighlightRange[] = [];
  let end = 0;
  for (const line of highlighter.codeToTokensBase(code, { lang: language, theme: "notdown-code" })) {
    for (const token of line) {
      const to = token.offset + token.content.length;
      // Offsets must continue to address the unmodified ProseMirror source, including CRLF/emoji.
      if (token.offset < end || code.slice(token.offset, to) !== token.content) return [];
      end = to;
      const style = styles.find(style => style.color === token.color?.toLowerCase());
      if (style && token.content.length)
        ranges.push({ from: token.offset, to, className: `pm-code-token pm-code-${style.token}` });
    }
  }
  return ranges;
}
