import type { Node as PMNode } from "prosemirror-model";
import { metadataValues } from "./products.js";
import { escapeXml } from "../document/notion-syntax.js";
import { renderRawHtml } from "./html.js";

export function syntaxHtml(node: PMNode) {
  if (node.attrs.kind === "comment") return "";
  if (node.attrs.kind === "metadata")
    return (
      '<dl class="md-metadata">' +
      Object.entries(metadataValues(node.attrs.raw, node.attrs.metadataForm))
        .map(
          ([key, value]) =>
            `<dt>${escapeXml(key)}</dt><dd>${escapeXml(typeof value === "object" ? JSON.stringify(value) : String(value))}</dd>`,
        )
        .join("") +
      "</dl>"
    );
  if (node.attrs.kind === "diagram")
    return (
      '<pre class="md-diagram-source"><code>' +
      escapeXml(node.attrs.data?.code || node.attrs.raw) +
      "</code></pre>"
    );
  if (node.attrs.kind === "embed")
    return (
      '<p>Embedded page: <a href="' +
      escapeXml(
        /^https?:\/\//i.test(node.attrs.data?.src || "")
          ? node.attrs.data.src
          : "",
      ) +
      '">' +
      escapeXml(
        node.attrs.data?.title || node.attrs.data?.src || node.attrs.raw,
      ) +
      "</a></p>"
    );
  if (node.attrs.kind === "definition")
    return (
      '<div id="md-def-' +
      escapeXml(
        String(node.attrs.data.key || "")
          .replace(/^[>#?]/, "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_\s-]/gu, "")
          .replace(/\s+/g, "-"),
      ) +
      '">' +
      renderRawHtml(node.attrs.html) +
      "</div>"
    );
  if (node.attrs.kind === "transclusion")
    return (
      '<span class="md-transclusion">' +
      escapeXml(node.attrs.data?.path || node.attrs.label) +
      "</span>"
    );
  return renderRawHtml(node.attrs.html || "");
}

/** Legacy Typora sequence/flow languages are translated into equivalent Mermaid diagrams. */
export function diagramSource(language: string, code: string) {
  if (language === "mermaid")
    return code.trim() || 'flowchart TD\nempty["Empty diagram"]';
  if (language === "sequence")
    return (
      "sequenceDiagram\n" +
      (code.trim()
        ? code
            .split("\n")
            .map((line) =>
              line
                .replace(/^(\s*[^:>\-]+)\s*-->\s*([^:]+):/, "$1-->>$2:")
                .replace(/^(\s*[^:>\-]+)\s*->\s*([^:]+):/, "$1->>$2:"),
            )
            .join("\n")
        : "participant A\nparticipant B")
    );
  const result = ["flowchart TD"];
  for (const line of code.split("\n")) {
    const m =
      /^\s*([\w]+)=>(start|end|operation|condition|inputoutput|subroutine):\s*(.*)$/.exec(
        line,
      );
    if (m) {
      const text = m[3].replace(/\|[^|]+$/, "").replace(/"/g, "#quot;");
      result.push(
        m[2] === "condition"
          ? `${m[1]}{"${text}"}`
          : ["start", "end"].includes(m[2])
            ? `${m[1]}(["${text}"])`
            : `${m[1]}["${text}"]`,
      );
    } else if (line.includes("->"))
      result.push(
        line
          .trim()
          .replace(/\((yes|no|true|false)(?:,[^)]+)?\)\s*->/g, " -->|$1| ")
          .replace(/\((?:left|right|top|bottom)\)/g, "")
          .replace(/(?<!-)->/g, " --> "),
      );
  }
  if (result.length === 1) {
    if (code.trim())
      throw new Error("Unrecognized flow diagram syntax. Check the nodes and connections.");
    result.push('empty["Empty diagram"]');
  }
  return result.join("\n");
}
