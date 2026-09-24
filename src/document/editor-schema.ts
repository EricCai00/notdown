import { Schema, type DOMOutputSpec, type NodeSpec } from "prosemirror-model";
import { objectNodeSpecs, objectMarkSpecs } from "./object-model";
import { colorStyle, inlineColorStyle, pageUrl, safeReference } from "./notion-syntax.js";
import { domAttributes } from "../markdown-engine/attributes.js";
import { columnTracks, columnWidths } from "../blocks/column-widths.js";
import { alertDOM } from "./alert-presentation";

/** Source bookkeeping is carried by document transactions, never rendered. */
const sourceAttrs = {
  source: { default: null },
  sourceFingerprint: { default: null },
  sourceStart: { default: null },
  sourceEnd: { default: null },
  sourceKey: { default: null },
};

function block(spec: NodeSpec): NodeSpec {
  return {
    ...spec,
    attrs: {
      ...sourceAttrs,
      color: { default: "" },
      nfmAttrs: { default: {} },
      markdownAttrs: { default: {} },
      ...spec.attrs,
    },
    toDOM: spec.toDOM
      ? (node) => {
          const dom = spec.toDOM!(node);
          if (
            !Array.isArray(dom) ||
            (!node.attrs.color &&
              !Object.keys(node.attrs.markdownAttrs || {}).length)
          )
            return dom;
          const [tag, first, ...rest] = dom;
          const attrs =
            typeof first === "object" && first !== null && !Array.isArray(first)
              ? first
              : {};
          return [
            tag,
            {
              ...attrs,
              ...domAttributes(node.attrs.markdownAttrs),
              class:
                [attrs.class, domAttributes(node.attrs.markdownAttrs).class]
                  .filter(Boolean)
                  .join(" ") || undefined,
              "data-block-color": node.attrs.color,
              style: [
                attrs.style,
                domAttributes(node.attrs.markdownAttrs).style,
                colorStyle(node.attrs.color),
              ]
                .filter(Boolean)
                .join(";"),
            },
            ...(attrs === first ? rest : [first, ...rest]),
          ] as DOMOutputSpec;
        }
      : undefined,
  };
}

function safeUrl(value: string): string {
  return /^(?:javascript|vbscript|data):/i.test(value.trim()) ? "" : value;
}

function referenceDomAttributes(dom: HTMLElement) {
  let nfmAttrs: Record<string, string> = {};
  try {
    const parsed = JSON.parse(dom.getAttribute("data-reference-attrs") || "{}");
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object")
      nfmAttrs = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { /* Pasted HTML without valid source attributes remains a basic reference. */ }
  return {
    url: dom.getAttribute("data-reference-url") || "",
    syntaxForm: dom.getAttribute("data-reference-syntax") || "",
    labelMode: dom.getAttribute("data-label-mode") || "",
    nfmAttrs,
  };
}

/** Media players only request local relative assets, never an external origin. */
export function localMediaSource(value: string): string {
  if (
    !value ||
    /^(?:[a-z][a-z\d+.-]*:|[\/\\])/i.test(value) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    return "";
  return value.split(/[?#]/)[0] ? value : "";
}

const pageIcon: DOMOutputSpec = [
  "span",
  { class: "page-link-icon", "aria-hidden": "true", contenteditable: "false" },
  "▤",
];

function listItemSpec(kind: "bullet" | "numbered" | "task"): NodeSpec {
  return block({
    content: "paragraph block*", defining: true,
    attrs: { checked: { default: kind === "task" ? false : null } },
    parseDOM: [{ tag: "li", getAttrs: (dom) => {
      const task = dom.hasAttribute("data-checked");
      const actual = task ? "task" : dom.parentElement?.tagName === "OL" ? "numbered" : "bullet";
      return actual === kind ? { checked: task ? dom.getAttribute("data-checked") === "true" : null } : false;
    } }],
    toDOM: (node) => ["li", { "data-list-item": kind, ...(kind === "task" ? { "data-checked": String(node.attrs.checked), class: "task-list-item" } : {}) }, 0],
  });
}

export const editorSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      attrs: {
        source: { default: null },
        sourceFingerprint: { default: null },
        sourceGaps: { default: [] },
        sourceEditableBlanks: { default: false },
        sourceHidden: { default: [] },
        sourceSuffix: { default: "" },
        sourceNewline: { default: "\n" },
        sourceFormat: { default: "markdown" },
        sourceSyntax: { default: null },
      },
    },
    paragraph: block({
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    }),
    syntax_block: block({
      atom: true,
      group: "block",
      attrs: {
        metadataForm: { default: "" },
        kind: { default: "" },
        raw: { default: "" },
        html: { default: "" },
        data: { default: {} },
        config: { default: null },
      },
      toDOM: (node) => [
        "div",
        { class: "pm-syntax-block", "data-syntax-kind": node.attrs.kind },
        ["pre", node.attrs.raw],
      ],
    }),
    syntax_inline: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
        kind: { default: "" },
        raw: { default: "" },
        label: { default: "" },
        title: { default: "" },
        target: { default: "" },
        html: { default: "" },
        config: { default: null },
      },
      toDOM: (node) =>
        node.attrs.kind === "raw" && node.attrs.title !== "html"
          ? ["span", { class: "pm-syntax-inline pm-unsupported-inline", title: "Unsupported: " + node.attrs.title }, node.attrs.raw]
          : node.attrs.kind === "unresolved_reference"
          ? ["a", { class: "pm-unresolved-reference", role: "link", "aria-disabled": "true", title: node.attrs.title }, node.attrs.label]
          : node.attrs.kind === "block-anchor"
          ? ["span", { class: "pm-block-anchor", "data-block-id": node.attrs.target, "aria-hidden": "true" }]
          : node.attrs.kind === "comment"
          ? ["span", { class: "pm-comment", hidden: "", "aria-hidden": "true" }]
          : node.attrs.target
            ? [
                "a",
                {
                  class: "pm-syntax-inline",
                  href: "#" + node.attrs.target,
                  title: node.attrs.title,
                },
                node.attrs.label,
              ]
            : [
                "span",
                { class: "pm-syntax-inline", title: node.attrs.title },
                node.attrs.label,
              ],
    },
    nested_block: block({
      content: "(paragraph | heading) block*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "div.pm-nested-block" }],
      toDOM: () => ["div", { class: "pm-nested-block" }, 0],
    }),
    heading: block({
      content: "inline*",
      group: "block",
      defining: true,
      attrs: { level: { default: 1 }, toggle: { default: false } },
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        attrs: { level },
      })),
      toDOM: (node) => [`h${Math.max(1, Math.min(6, node.attrs.level))}`, 0],
    }),
    blockquote: block({
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    }),
    horizontal_rule: block({
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"],
    }),
    code_block: block({
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      attrs: { params: { default: "" }, rChunk: { default: false } },
      parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
      toDOM: (node) => [
        "pre",
        { "data-language": node.attrs.params },
        ["code", 0],
      ],
    }),
    bullet_list: block({
      attrs: { tight: { default: true } },
      content: "(bullet_list_item | task_list_item)+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    }),
    ordered_list: block({
      content: "(numbered_list_item | task_list_item)+",
      group: "block",
      attrs: { order: { default: 1 }, tight: { default: true }, markerStyle: { default: "decimal" }, markerDelimiter: { default: "." } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom) => ({
              order: dom.getAttribute("start") === "0" ? 0 : Number(dom.getAttribute("start")) || 1,
          }),
        },
      ],
      toDOM: (node) => ["ol", { start: node.attrs.order, type: ({ alpha: "a", Alpha: "A", roman: "i", Roman: "I" } as Record<string,string>)[node.attrs.markerStyle] }, 0],
    }),
    bullet_list_item: listItemSpec("bullet"),
    numbered_list_item: listItemSpec("numbered"),
    task_list_item: listItemSpec("task"),
    columns: block({
      content: "column{2,}",
      group: "block",
      defining: true,
      isolating: true,
      parseDOM: [{ tag: "div.note-columns" }],
      toDOM: (node) => [
        "div",
        { class: "note-columns", style: `--column-count:${node.childCount};--column-widths:${columnTracks(columnWidths(node))}` },
        0,
      ],
    }),
    column: block({
      content: "block+",
      defining: true,
      isolating: true,
      parseDOM: [{ tag: "section.note-column", getAttrs: dom => ({ nfmAttrs: dom.hasAttribute("data-width-ratio") ? { "width-ratio": dom.getAttribute("data-width-ratio") } : {} }) }],
      toDOM: node => ["section", { class: "note-column", "data-width-ratio": node.attrs.nfmAttrs["width-ratio"] ?? null }, 0],
    }),
    child_page: block({
      group: "block",
      atom: true,
      draggable: true,
      attrs: {
        target: { default: "" },
        label: { default: "" },
        url: { default: "" },
      },
      parseDOM: [
        {
          tag: "a.child-page-node[data-page-target]",
          getAttrs: (dom) => ({
            target: dom.getAttribute("data-page-target") ?? "",
          }),
        },
      ],
      toDOM: (node) => [
        "a",
        {
          class: "child-page-node",
          href: safeReference(node.attrs.url || pageUrl(node.attrs.target)),
          "data-page-target": node.attrs.target,
          contenteditable: "false",
        },
        pageIcon,
        ["span", { class: "page-link-label" }, node.attrs.target],
      ],
    }),
    opaque_block: block({
      group: "block",
      atom: true,
      isolating: true,
      draggable: true,
      attrs: { raw: { default: "" }, metadataForm: { default: "" } },
      parseDOM: [
        {
          tag: "pre.opaque-block",
          getAttrs: (dom) => ({ raw: dom.textContent ?? "" }),
        },
      ],
      toDOM: (node) => [
        "pre",
        { class: "opaque-block", contenteditable: "false" },
        ["code", node.attrs.raw],
      ],
    }),
    html_block: block({
      group: "block",
      atom: true,
      isolating: true,
      draggable: true,
      attrs: { raw: { default: "" }, tagfilter: { default: false }, gfmConfig: { default: null } },
      toDOM: (node) => [
        "div",
        { class: "pm-html-block", contenteditable: "false" },
        node.attrs.raw,
      ],
    }),
    html_inline: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { raw: { default: "" }, html: { default: "" } },
      toDOM: (node) => [
        "span",
        { class: "pm-html-inline", contenteditable: "false" },
        node.attrs.raw,
      ],
    },
    definition_list: block({
      group: "block",
      content: "(definition_term definition_description+)+",
      defining: true,
      isolating: true,
      toDOM: () => ["dl", { class: "pm-definition-list" }, 0],
    }),
    definition_term: block({
      content: "inline*",
      defining: true,
      toDOM: () => ["dt", 0],
    }),
    definition_description: block({
      content: "block+",
      defining: true,
      toDOM: () => ["dd", 0],
    }),
    footnote_anchor: {
      group: "block", atom: true, selectable: false,
      attrs: { key: { default: "" } },
      toDOM: () => ["span", { hidden: "", class: "pm-footnote-anchor", contenteditable: "false" }],
    },
    footnote_section: {
      group: "block", content: "footnote+", isolating: true, selectable: false,
      toDOM: () => ["section", { class: "pm-footnotes", "aria-label": "Footnotes" }, 0],
    },
    footnote: block({
      group: "block",
      content: "block+",
      selectable: false,
      draggable: false,
      defining: true,
      isolating: true,
      attrs: { label: { default: "note" }, footnoteKey: { default: null } },
      toDOM: (node) => [
        "aside",
        {
          class: "pm-footnote",
          id: "md-note-" + encodeURIComponent(node.attrs.label),
          "data-footnote-label": node.attrs.label,
        },
        0,
      ],
    }),
    footnote_reference: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { label: { default: "note" } },
      toDOM: (node) => [
        "sup",
        { class: "pm-footnote-ref" },
        [
          "a",
          { href: "#md-note-" + encodeURIComponent(node.attrs.label) },
          "[" + node.attrs.label + "]",
        ],
      ],
    },
    line_block: block({
      group: "block",
      content: "line+",
      defining: true,
      isolating: true,
      toDOM: () => ["div", { class: "pm-line-block" }, 0],
    }),
    line: block({
      content: "inline*",
      toDOM: () => ["div", { class: "pm-verse-line" }, 0],
    }),
    fenced_div: block({
      group: "block",
      content: "block+",
      defining: true,
      isolating: true,
      attrs: { attributes: { default: "{.container}" }, syntaxForm: { default: "fenced" } },
      toDOM: (node) => [
        "section",
        {
          class: "pm-fenced-div",
          "data-div-attributes": node.attrs.attributes,
        },
        0,
      ],
    }),
    callout: block({
      content: "block+",
      group: "block",
      defining: true,
      attrs: {
        icon: { default: "💡" },
        kind: { default: "" },
        title: { default: "" },
        fold: { default: "" },
        alertStyle: { default: "github" },
        syntaxForm: { default: "notion" },
      },
      parseDOM: [
        ...["aside.pm-alert", "details.pm-alert"].map(tag => ({ tag, contentElement: "div",
          getAttrs: (dom: HTMLElement) => ({
            syntaxForm: "alert", icon: dom.dataset.icon || "", kind: dom.dataset.calloutKind || "NOTE",
            title: dom.dataset.calloutTitle || "", fold: dom.dataset.calloutFold || "", color: dom.dataset.blockColor || "",
            alertStyle: dom.dataset.alertStyle === "obsidian" ? "obsidian" : "github",
          }),
        })),
        { tag: "aside.pm-callout", contentElement: (dom) => dom.querySelector(".pm-callout-content") || dom,
          getAttrs: (dom) => ({ icon: dom.dataset.icon ?? "💡", color: dom.dataset.blockColor || "" }) },
      ],
      toDOM: (node) => node.attrs.syntaxForm === "alert" ? alertDOM(node) : [
        "aside",
        { class: "pm-callout", "data-icon": node.attrs.icon },
        0,
      ],
    }),
    toggle_block: block({
      content: "paragraph block*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "div.pm-toggle" }],
      toDOM: () => ["div", { class: "pm-toggle" }, 0],
    }),
    synced_block: block({
      content: "block+",
      group: "block",
      defining: true,
      attrs: { url: { default: "" }, reference: { default: false } },
      parseDOM: [{ tag: "div.pm-synced" }],
      toDOM: () => [
        "div",
        { class: "pm-synced", title: "Local snapshot of synced block content" },
        0,
      ],
    }),
    table_of_contents: block({
      group: "block",
      atom: true,
      attrs: {
        minLevel: { default: 1 },
        maxLevel: { default: 6 },
        syntaxForm: { default: "notion" },
      },
      parseDOM: [{ tag: "nav.pm-toc", getAttrs: (dom) => ({
        minLevel: Number(dom.dataset.minLevel) || 1, maxLevel: Number(dom.dataset.maxLevel) || 6,
        syntaxForm: dom.dataset.tocForm || "notion",
      }) }],
      toDOM: (node) => [
        "nav",
        { class: "pm-toc", "data-min-level": node.attrs.minLevel,
          "data-max-level": node.attrs.maxLevel,
          "data-toc-form": node.attrs.syntaxForm,
          "aria-label": "Table of contents", contenteditable: "false" },
        "Table of contents",
      ],
    }),
    unknown_block: block({
      group: "block",
      atom: true,
      draggable: true,
      attrs: { url: { default: "" }, alt: { default: "" } },
      toDOM: (node) => [
        "a",
        {
          class: "pm-unknown",
          href: safeReference(node.attrs.url),
          contenteditable: "false",
        },
        node.attrs.alt || "Unsupported block",
      ],
    }),
    media_block: block({
      group: "block",
      atom: true,
      draggable: true,
      attrs: {
        type: { default: "file" },
        src: { default: "" },
        caption: { default: "" },
      },
      toDOM: (node) => {
        const src = safeReference(node.attrs.src);
        const label = node.attrs.caption || node.attrs.src || "Attachment";
        const link: DOMOutputSpec = [
          "a",
          { href: src, class: "media-download" },
          label,
        ];
        return [
          "figure",
          { class: "pm-media-block", contenteditable: "false" },
          ...(["audio", "video"].includes(node.attrs.type) && src
            ? [
                [
                  node.attrs.type,
                  { src, controls: "", preload: "none", "aria-label": label },
                ] as DOMOutputSpec,
              ]
            : []),
          ...(node.attrs.type === "pdf" && localMediaSource(src) ? [["object", { data: src, type: "application/pdf", width: "100%", height: "480", "aria-label": label }, ["a", { href: src }, "Open PDF"]] as DOMOutputSpec] : []),
          link,
        ];
      },
    }),
    equation: block({
      attrs: { latexPrefix: { default: "" } },
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      toDOM: () => [
        "div",
        { class: "pm-equation", "aria-label": "LaTeX equation" },
        0,
      ],
    }),
    table: block({
      content: "table_caption? table_row+",
      group: "block",
      isolating: true,
      attrs: { widths: { default: [] }, columnAttrs: { default: [] }, syntaxForm: { default: "notion" }, captionId: { default: "" }, captionSide: { default: "top" } },
      parseDOM: [{ tag: "table" }],
      toDOM: (node) => [
        "table",
        {
          class: "pm-table",
          "data-table-encoding": node.attrs.syntaxForm,
          style: node.attrs.captionSide === "bottom" ? "caption-side:bottom" : "",
          "data-header-row": String(
            node.attrs.nfmAttrs["header-row"] === "true",
          ),
          "data-header-column": String(
            node.attrs.nfmAttrs["header-column"] === "true",
          ),
        },
        0,
      ],
    }),
    table_caption: {
      content: "inline*", isolating: true,
      parseDOM: [{ tag: "caption" }], toDOM: () => ["caption", 0],
    },
    table_row: {
      content: "table_cell*",
      attrs: { nfmAttrs: { default: {} }, header: { default: false }, section: { default: 0 } },
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },
    table_cell: {
      // Preserve existing multiline MMD cell blocks; new Enter/paste editing
      // uses inline content and hard breaks rather than page block insertion.
      content: "block+",
      isolating: true,
      attrs: { nfmAttrs: { default: {} }, colspan: { default: 1 }, rowspan: { default: 1 }, header: { default: false } },
      parseDOM: ["td", "th"].map(tag => ({ tag, getAttrs: (dom: HTMLElement) => ({ colspan: Math.max(1, Number(dom.getAttribute("colspan")) || 1), rowspan: Math.max(1, Number(dom.getAttribute("rowspan")) || 1), header: tag === "th" }) })),
      toDOM: (node) => [
        node.attrs.header ? "th" : "td",
        {
          colspan: node.attrs.colspan,
          rowspan: node.attrs.rowspan,
          style: [
            colorStyle(node.attrs.nfmAttrs.color || ""),
            ["left", "center", "right"].includes(node.attrs.nfmAttrs.align)
              ? `text-align:${node.attrs.nfmAttrs.align}` : "",
          ].filter(Boolean).join(";"),
        },
        0,
      ],
    },
    text: { group: "inline" },
    image: {
      inline: true,
      group: "inline",
      draggable: true,
      attrs: {
        src: {},
        alt: { default: "" },
        title: { default: null },
        markdownAttrs: { default: {} },
      },
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (dom) => ({
            src: safeUrl(dom.getAttribute("src") ?? ""),
            alt: dom.getAttribute("alt") ?? "",
            title: dom.getAttribute("title"),
          }),
        },
      ],
      toDOM: (node) => [
        "img",
        {
          src: safeUrl(node.attrs.src),
          alt: node.attrs.alt,
          title: node.attrs.title,
          ...domAttributes(node.attrs.markdownAttrs),
        },
      ],
    },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
    mention: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
        kind: { default: "user" },
        label: { default: "" },
        nfmAttrs: { default: {} },
      },
      toDOM: (node) => [
        "span",
        {
          class: "pm-mention",
          contenteditable: "false",
          "data-mention-kind": node.attrs.kind,
        },
        node.attrs.label ||
          (node.attrs.nfmAttrs.start ? [node.attrs.nfmAttrs.start, node.attrs.nfmAttrs.startTime, node.attrs.nfmAttrs.timeZone, node.attrs.nfmAttrs.end && "→ " + node.attrs.nfmAttrs.end].filter(Boolean).join(" ") : "") ||
          node.attrs.nfmAttrs.url ||
          "Mention",
      ],
    },
    inline_math: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { value: { default: "" }, delimiter: { default: "dollars" }, latexPrefix: { default: "" } },
      toDOM: (node) => [
        "span",
        { class: "pm-inline-math", contenteditable: "false" },
        node.attrs.value,
      ],
    },
    citation: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { url: { default: "" } },
      toDOM: (node) => [
        "a",
        {
          class: "pm-citation",
          href: safeReference(node.attrs.url),
          contenteditable: "false",
        },
        "↗",
      ],
    },
    page_link: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      attrs: {
        target: { default: "" },
        label: { default: "" },
        url: { default: "" },
        syntaxForm: { default: "" },
        labelMode: { default: "" },
        nfmAttrs: { default: {} },
      },
      parseDOM: [
        {
          tag: "a.page-mention[data-page-target]",
          getAttrs: (dom) => ({
            ...referenceDomAttributes(dom),
            target: dom.getAttribute("data-page-target") ?? "",
            label:
              dom.querySelector(".page-link-label")?.textContent ??
              dom.textContent ??
              "",
          }),
        },
      ],
      toDOM: (node) => [
        "a",
        {
          class: "page-mention",
          href: safeReference(node.attrs.url || pageUrl(node.attrs.target)),
          "data-page-target": node.attrs.target,
          "data-reference-url": node.attrs.url,
          "data-reference-syntax": node.attrs.syntaxForm,
          "data-reference-attrs": JSON.stringify(node.attrs.nfmAttrs),
          "data-label-mode": node.attrs.labelMode,
          contenteditable: "false",
        },
        pageIcon,
        [
          "span",
          { class: "page-link-label" },
          node.attrs.label || node.attrs.target,
        ],
      ],
    },
    ...objectNodeSpecs(block),
  },
  marks: {
    ...objectMarkSpecs,
    highlight: { toDOM: () => ["mark", 0], parseDOM: [{ tag: "mark" }] },
    critic: {
      attrs: { kind: { default: "addition" }, old: { default: "" } },
      toDOM: (mark) => [
        mark.attrs.kind === "deletion"
          ? "del"
          : mark.attrs.kind === "addition"
            ? "ins"
            : "mark",
        {
          class: mark.attrs.kind === "comment" ? "pm-critic pm-comment" : "pm-critic",
          title:
            mark.attrs.kind === "substitution"
              ? "Original: " + mark.attrs.old
              : mark.attrs.kind,
        },
        0,
      ],
    },
    subscript: { parseDOM: [{ tag: "sub" }], toDOM: () => ["sub", 0] },
    superscript: {
      parseDOM: [{ tag: "sup:not(.pm-footnote-ref)" }],
      toDOM: () => ["sup", 0],
    },
    abbreviation: {
      attrs: { title: { default: "" } },
      parseDOM: [
        {
          tag: "abbr",
          getAttrs: (dom) => ({ title: dom.getAttribute("title") || "" }),
        },
      ],
      toDOM: (mark) => ["abbr", { title: mark.attrs.title }, 0],
    },
    underline: {
      parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
      toDOM: () => ["u", 0],
    },
    color: {
      attrs: { color: { default: "" }, bg_color: { default: "" }, nfmAttrs: { default: {} } },
      parseDOM: [
        {
          tag: "span[data-text-color]",
          getAttrs: (dom) => ({ color: dom.getAttribute("data-text-color") || "", bg_color: dom.getAttribute("data-bg-color") || "" }),
        },
      ],
      toDOM: (mark) => [
        "span",
        {
          "data-text-color": mark.attrs.color,
          "data-bg-color": mark.attrs.bg_color || null,
          style: inlineColorStyle(mark.attrs),
        },
        0,
      ],
    },
    link: {
      attrs: {
        href: {},
        title: { default: null },
        markdownAttrs: { default: {} },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]:not([data-page-target])",
          getAttrs: (dom) => ({
            href: safeUrl(dom.getAttribute("href") ?? ""),
            title: dom.getAttribute("title"),
          }),
        },
      ],
      toDOM: (mark) => [
        "a",
        {
          href: safeUrl(mark.attrs.href),
          title: mark.attrs.title || `${mark.attrs.href} · Ctrl/⌘ + click to open link`,
          rel: "noopener noreferrer",
          ...domAttributes(mark.attrs.markdownAttrs),
        },
        0,
      ],
    },
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      toDOM: () => ["em", 0],
    },
    strong: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
      ],
      toDOM: () => ["strong", 0],
    },
    strike: {
      parseDOM: [
        { tag: "s" },
        { tag: "del" },
        { style: "text-decoration=line-through" },
      ],
      toDOM: () => ["s", 0],
    },
    code: {
      code: true,
      attrs: { markdownAttrs: { default: {} } },
      parseDOM: [{ tag: "code" }],
      toDOM: mark => ["code", domAttributes(mark.attrs.markdownAttrs), 0],
    },
  },
});
