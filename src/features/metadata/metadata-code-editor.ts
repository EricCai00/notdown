import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab, undo, redo } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";
import { tags } from "@lezer/highlight";

const titleLanguage = (form: string) => StreamLanguage.define({
  name: form === "pandoc" ? "Pandoc title block" : "MultiMarkdown metadata",
  token(stream) {
    if (stream.sol() && stream.match(/^(?:---|\.\.\.)\s*$/)) return "meta";
    if (stream.sol() && form === "pandoc" && stream.match(/^%/)) return "keyword";
    if (stream.sol() && form === "mmd" && stream.match(/^[A-Za-z0-9][A-Za-z0-9 _-]*(?=:)/)) return "propertyName";
    if (stream.match(/^:/)) return "punctuation";
    stream.skipToEnd();
    return "string";
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, class: "metadata-code-key", color: "#8b3e9f" },
  { tag: tags.string, class: "metadata-code-string", color: "#287344" },
  { tag: [tags.number, tags.bool, tags.null], class: "metadata-code-value", color: "#185abc" },
  { tag: tags.comment, class: "metadata-code-comment", color: "#85837c", fontStyle: "italic" },
  { tag: [tags.meta, tags.keyword], class: "metadata-code-marker", color: "#a35a12" },
  { tag: [tags.punctuation, tags.operator], color: "#686661" },
]);

export function createMetadataCodeEditor(parent: HTMLElement, source: string, form: string, save: () => void, change: () => void) {
  const newline = source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        keymap.of([
          { key: "Mod-z", run: undo, preventDefault: true, stopPropagation: true },
          { key: "Mod-Shift-z", run: redo, preventDefault: true, stopPropagation: true },
          { key: "Mod-y", run: redo, preventDefault: true, stopPropagation: true },
          { key: "Mod-Enter", run: () => { save(); return true; }, preventDefault: true, stopPropagation: true },
          { key: "Mod-s", run: () => { save(); return true; }, preventDefault: true, stopPropagation: true },
          indentWithTab,
        ]),
        basicSetup,
        form === "yaml" ? yaml() : titleLanguage(form),
        syntaxHighlighting(highlight),
        EditorState.lineSeparator.of(newline),
        EditorView.clipboardInputFilter.of((text, state) => text.replace(/\r\n|\r|\n/g, state.lineBreak)),
        EditorView.contentAttributes.of({ "aria-label": "Metadata source", spellcheck: "false" }),
        EditorView.updateListener.of(update => { if (update.docChanged) change(); }),
      ],
    }),
  });
}
