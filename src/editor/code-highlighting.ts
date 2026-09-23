import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import powershell from "highlight.js/lib/languages/powershell";
import prolog from "highlight.js/lib/languages/prolog";
import protobuf from "highlight.js/lib/languages/protobuf";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("prolog", prolog);
hljs.registerLanguage("protobuf", protobuf);
const codeHighlightingKey = new PluginKey<DecorationSet>("codeHighlighting");

const aliases: Record<string, string> = {
  "c#": "csharp", "c++": "cpp", "f#": "fsharp", "html": "xml",
  "markup": "xml", "plain text": "plaintext", "shell": "bash",
  "docker": "dockerfile", "objective-c": "objectivec",
  "visual basic": "vbnet", "vb.net": "vbnet", "webassembly": "wasm",
};

function grammar(params: string): string | undefined {
  const name = params.trim().toLowerCase();
  if (!name || name === "plain text") return undefined;
  const candidate = aliases[name] || name;
  return hljs.getLanguage(candidate) ? candidate : undefined;
}

function highlightedRanges(code: string, language: string): { from: number; to: number; className: string }[] {
  const markup = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  const template = document.createElement("template");
  template.innerHTML = markup;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const ranges: { from: number; to: number; className: string }[] = [];
  let offset = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent || "";
    const classes: string[] = [];
    let parent = walker.currentNode.parentElement;
    while (parent) {
      classes.push(...[...parent.classList].filter(name => /^hljs-[a-z_-]+$/.test(name)));
      parent = parent.parentElement;
    }
    if (text.length && classes.length)
      ranges.push({ from: offset, to: offset + text.length, className: [...new Set(classes)].join(" ") });
    offset += text.length;
  }
  return offset === code.length ? ranges : [];
}

function decorations(doc: PMNode): DecorationSet {
  const spans: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block" || !node.textContent || node.textContent.length > 32_000) return;
    const language = grammar(String(node.attrs.params || ""));
    if (!language) return;
    try {
      for (const range of highlightedRanges(node.textContent, language))
        spans.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.className }));
    } catch {
      // An unsupported or malformed grammar should leave editable code as plain text.
    }
  });
  return DecorationSet.create(doc, spans);
}

/** ProseMirror owns code text; decorations add colors without rewriting its DOM. */
export function codeHighlighting() {
  return new Plugin<DecorationSet>({
    key: codeHighlightingKey,
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (tr, previous) => tr.docChanged ? decorations(tr.doc) : previous,
    },
    props: { decorations: state => codeHighlightingKey.getState(state) },
  });
}
