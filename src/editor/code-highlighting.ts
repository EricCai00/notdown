import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { Grammar, Token, TokenStream } from "prismjs";
import { Prism } from "./code-grammars";
import { codeLanguage } from "./code-languages";
import { hasTextmateGrammar, textmateCodeRanges } from "./code-textmate";

const codeHighlightingKey = new PluginKey<DecorationSet>("codeHighlighting");
export const codeHighlightLimit = 32_000;

// Retain highlighting for old common-bundle fences outside the visible menu.
const legacyGrammars: Record<string, string> = {
  ini: "ini", properties: "ini", "php-template": "php",
  "python-repl": "python", pycon: "python", shellsession: "bash", console: "bash",
  jsx: "jsx", tsx: "tsx",
};

function codeGrammarId(params: string): string | undefined {
  const name = params.trim().toLowerCase();
  if (name === "mermaid") return undefined;
  const language = codeLanguage(name);
  if (language?.engine === "shiki") return undefined;
  const id = legacyGrammars[name] ?? (language ? language.grammar : name);
  return id || undefined;
}

export function codeGrammar(params: string): Grammar | undefined {
  const id = codeGrammarId(params);
  if (!id) return undefined;
  const grammar = Prism.languages[id];
  return grammar && typeof grammar === "object" ? grammar : undefined;
}

export function hasCodeHighlighter(params: string): boolean {
  const language = codeLanguage(params);
  return language?.engine === "shiki"
    ? hasTextmateGrammar(language.grammar || "") : !!codeGrammar(params);
}

export interface CodeHighlightRange { from: number; to: number; className: string }

/** Token offsets refer to original UTF-16 text; no HTML conversion or DOM mutation. */
export function highlightedCodeRanges(code: string, params: string): CodeHighlightRange[] {
  if (!code || code.length > codeHighlightLimit) return [];
  try {
    const language = codeLanguage(params);
    if (language?.engine === "shiki") return textmateCodeRanges(code, language.grammar!);
    const grammar = codeGrammar(params);
    if (!grammar) return [];
    const ranges: CodeHighlightRange[] = [];
    let offset = 0;
    const visit = (value: TokenStream, parents: string[]) => {
      if (typeof value === "string") {
        if (code.slice(offset, offset + value.length) !== value) throw new Error("Highlighting changed source text");
        if (value.length && parents.length)
          ranges.push({ from: offset, to: offset + value.length, className: `pm-code-token ${[...new Set(parents)].join(" ")}` });
        offset += value.length;
      } else if (Array.isArray(value)) {
        for (const child of value) visit(child, parents);
      } else {
        const token = value as Token;
        const names = [token.type, ...[token.alias ?? []].flat()];
        const classes = names.filter(name => /^[a-z][a-z0-9-]*$/.test(name)).map(name => `pm-code-${name}`);
        visit(token.content, [...parents, ...classes]);
      }
    };
    // Templating grammars use these hooks to preserve HTML and embedded expressions.
    const env = { code, grammar, language: codeGrammarId(params)!, tokens: [] as TokenStream };
    Prism.hooks.run("before-tokenize", env);
    env.tokens = Prism.tokenize(env.code, env.grammar);
    Prism.hooks.run("after-tokenize", env);
    visit(env.tokens, []);
    return offset === code.length ? ranges : [];
  } catch {
    // Failed grammars leave the original code editable as plain text.
    return [];
  }
}

function decorations(doc: PMNode): DecorationSet {
  const spans: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    for (const range of highlightedCodeRanges(node.textContent, String(node.attrs.params || "")))
      spans.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.className }));
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
