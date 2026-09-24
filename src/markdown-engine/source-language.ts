import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascriptLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { htmlLanguage } from "@codemirror/lang-html";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Display-only syntax shared by the workspace and Lab; the native codec owns dialect semantics. */
export function markdownSourceLanguage() {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: (name) => {
        switch (name.toLowerCase()) {
          case "js": case "javascript": return javascriptLanguage;
          case "ts": case "typescript": return typescriptLanguage;
          case "json": return jsonLanguage;
          case "html": return htmlLanguage;
          case "yaml": case "yml": return yamlLanguage;
          default: return null;
        }
      },
    }),
    syntaxHighlighting(HighlightStyle.define([
      ...defaultHighlightStyle.specs,
      { tag: tags.heading, color: "#7952a5", fontWeight: "600" },
      { tag: tags.strong, color: "#3e5662", fontWeight: "700" },
      { tag: tags.emphasis, color: "#ad7344", fontStyle: "italic" },
      { tag: tags.link, color: "#367fa0" },
      { tag: tags.url, color: "#70897b" },
      { tag: tags.monospace, color: "#ae674a" },
      { tag: tags.processingInstruction, color: "#b7a0bd" },
    ])),
  ];
}
