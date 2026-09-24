import type { EditorView } from "prosemirror-view";
import DOMPurify from "dompurify";
import { readMmdCitation } from "../document/mmd-citations";
const requests = new WeakMap<EditorView, { key: string; time: number; citations?: Record<string, string>; bibliography?: string; error?: string }>();
export function refreshCitations(view: EditorView, metadata: Record<string, unknown>): boolean {
  const bibliography = String(metadata.bibliography || metadata.bibtex || ""), style = String(metadata.csl || "");
  const nodes: { pos: number; source: string }[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "syntax_inline" && node.attrs.kind === "citation" && !readMmdCitation(node.attrs.raw)) nodes.push({ pos, source: node.attrs.raw });
  });
  if (!bibliography || !nodes.length) { requests.delete(view); view.dom.parentElement?.querySelector(".md-csl-bibliography")?.remove(); return false; }
  const key = JSON.stringify([bibliography, style, nodes.map(n => n.source)]);
  let state = requests.get(view);
  if (state?.key !== key) {
    state = { key, time: Date.now() }; requests.set(view, state);
    void fetch("/api/syntax/citations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: bibliography, style, citations: nodes.map(n => n.source) }) })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Citation processing failed"); return result; })
      .then(result => { if (view.dom.isConnected && requests.get(view)?.key === key) { requests.set(view, { key, time: Date.now(), ...result }); refreshCitations(view, metadata); } })
      .catch(error => { if (view.dom.isConnected && requests.get(view)?.key === key) { requests.set(view, { key, time: Date.now(), error: error.message }); refreshCitations(view, metadata); } });
  }
  let panel = view.dom.parentElement?.querySelector<HTMLElement>(".md-csl-bibliography");
  if (!panel) { panel = document.createElement("aside"); panel.className = "md-csl-bibliography"; view.dom.parentElement?.append(panel); }
  if (state?.error) panel.textContent = "Bibliography: " + state.error;
  else panel.innerHTML = DOMPurify.sanitize(state?.bibliography || "");
  for (const node of nodes) {
    const dom = view.nodeDOM(node.pos);
    if (dom instanceof HTMLElement && state?.citations?.[node.source]) { dom.innerHTML = DOMPurify.sanitize(state.citations[node.source]); dom.title = node.source; }
  }
  return true;
}
