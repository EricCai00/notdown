import { Schema, type DOMOutputSpec, type NodeSpec } from "prosemirror-model";
import { colorStyle, pageUrl, safeReference } from "./notion-syntax.js";

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
      ...spec.attrs,
    },
    toDOM: spec.toDOM
      ? (node) => {
          const dom = spec.toDOM!(node);
          if (!Array.isArray(dom) || !node.attrs.color) return dom;
          const [tag, first, ...rest] = dom;
          const attrs =
            typeof first === "object" && first !== null && !Array.isArray(first)
              ? first
              : {};
          return [
            tag,
            {
              ...attrs,
              "data-block-color": node.attrs.color,
              style: [attrs.style, colorStyle(node.attrs.color)]
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

export const editorSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      attrs: {
        source: { default: null },
        sourceFingerprint: { default: null },
        sourceGaps: { default: [] },
        sourceHidden: { default: [] },
        sourceSuffix: { default: "" },
        sourceNewline: { default: "\n" },
        sourceFormat: { default: "markdown" },
      },
    },
    paragraph: block({
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    }),
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
      attrs: { params: { default: "" } },
      parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
      toDOM: (node) => [
        "pre",
        { "data-language": node.attrs.params },
        ["code", 0],
      ],
    }),
    bullet_list: block({
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    }),
    ordered_list: block({
      content: "list_item+",
      group: "block",
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom) => ({
            order: Number(dom.getAttribute("start")) || 1,
          }),
        },
      ],
      toDOM: (node) => ["ol", { start: node.attrs.order }, 0],
    }),
    list_item: block({
      content: "paragraph block*",
      defining: true,
      attrs: { checked: { default: null } },
      parseDOM: [
        {
          tag: "li",
          getAttrs: (dom) => ({
            checked: dom.hasAttribute("data-checked")
              ? dom.getAttribute("data-checked") === "true"
              : null,
          }),
        },
      ],
      toDOM: (node) => [
        "li",
        node.attrs.checked === null
          ? {}
          : {
              "data-checked": String(node.attrs.checked),
              class: "task-list-item",
            },
        0,
      ],
    }),
    columns: block({
      content: "column{2,}",
      group: "block",
      defining: true,
      isolating: true,
      parseDOM: [{ tag: "div.note-columns" }],
      toDOM: (node) => [
        "div",
        { class: "note-columns", style: `--column-count:${node.childCount}` },
        0,
      ],
    }),
    column: block({
      content: "block+",
      defining: true,
      isolating: true,
      parseDOM: [{ tag: "section.note-column" }],
      toDOM: () => ["section", { class: "note-column" }, 0],
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
      attrs: { raw: { default: "" } },
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
    callout: block({
      content: "block+",
      group: "block",
      defining: true,
      attrs: { icon: { default: "💡" } },
      parseDOM: [{ tag: "aside.pm-callout" }],
      toDOM: (node) => [
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
        { class: "pm-synced", title: "同步块的本地内容快照" },
        0,
      ],
    }),
    database: block({
      group: "block",
      atom: true,
      draggable: true,
      attrs: {
        url: { default: "" },
        label: { default: "" },
        inline: { default: false },
        icon: { default: "▦" },
      },
      toDOM: (node) => [
        "a",
        {
          class: "pm-database",
          href: safeReference(node.attrs.url),
          contenteditable: "false",
        },
        `${node.attrs.icon || "▦"} ${node.attrs.label || "数据库"}`,
      ],
    }),
    table_of_contents: block({
      group: "block",
      atom: true,
      toDOM: () => [
        "nav",
        { class: "pm-toc", "aria-label": "目录", contenteditable: "false" },
        "目录",
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
        node.attrs.alt || "未支持的块",
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
        const label = node.attrs.caption || node.attrs.src || "附件";
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
          link,
        ];
      },
    }),
    equation: block({
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      toDOM: () => [
        "div",
        { class: "pm-equation", "aria-label": "LaTeX 公式" },
        0,
      ],
    }),
    table: block({
      content: "table_row+",
      group: "block",
      isolating: true,
      attrs: { widths: { default: [] }, columnAttrs: { default: [] } },
      parseDOM: [{ tag: "table" }],
      toDOM: (node) => [
        "table",
        {
          class: "pm-table",
          "data-header-row": String(
            node.attrs.nfmAttrs["header-row"] === "true",
          ),
          "data-header-column": String(
            node.attrs.nfmAttrs["header-column"] === "true",
          ),
        },
        ...(node.attrs.widths?.length
          ? [
              [
                "colgroup",
                ...node.attrs.widths.map((width: string) => [
                  "col",
                  {
                    style: /^\d+(?:\.\d+)?(?:px|%)?$/.test(width)
                      ? `width:${/^\d+$/.test(width) ? width + "px" : width}`
                      : "",
                  },
                ]),
              ] as DOMOutputSpec,
            ]
          : []),
        ["tbody", 0],
      ],
    }),
    table_row: {
      content: "table_cell+",
      attrs: { nfmAttrs: { default: {} } },
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },
    table_cell: {
      content: "paragraph+",
      isolating: true,
      attrs: { nfmAttrs: { default: {} } },
      parseDOM: [{ tag: "td" }, { tag: "th" }],
      toDOM: (node) => [
        "td",
        { style: colorStyle(node.attrs.nfmAttrs.color || "") },
        0,
      ],
    },
    text: { group: "inline" },
    image: {
      inline: true,
      group: "inline",
      draggable: true,
      attrs: { src: {}, alt: { default: "" }, title: { default: null } },
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
      toDOM: (node) => ["img", { ...node.attrs, src: safeUrl(node.attrs.src) }],
    },
    media: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      draggable: true,
      attrs: {
        type: { default: "audio" },
        src: { default: "" },
        label: { default: "" },
      },
      parseDOM: [
        {
          tag: "span.pm-media[data-media-src]",
          getAttrs: (dom) => {
            const src = localMediaSource(
              dom.getAttribute("data-media-src") ?? "",
            );
            const type = dom.getAttribute("data-media-type");
            if (!src || (type !== "audio" && type !== "video")) return false;
            return {
              type,
              src,
              label: dom.getAttribute("data-media-label") ?? "",
            };
          },
        },
      ],
      toDOM: (node) => {
        const src = localMediaSource(node.attrs.src);
        const type = node.attrs.type === "video" ? "video" : "audio";
        const label = node.attrs.label || node.attrs.src;
        if (!src)
          return [
            "span",
            { class: "pm-media pm-media-invalid", contenteditable: "false" },
            label,
          ];
        return [
          "span",
          {
            class: "pm-media",
            contenteditable: "false",
            "data-media-type": type,
            "data-media-src": src,
            "data-media-label": node.attrs.label,
          },
          [
            type,
            { src, controls: "", preload: "metadata", "aria-label": label },
          ],
          ["a", { href: src, download: "", class: "media-download" }, label],
        ];
      },
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
          node.attrs.nfmAttrs.start ||
          node.attrs.nfmAttrs.url ||
          "提及",
      ],
    },
    inline_math: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { value: { default: "" } },
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
        nfmAttrs: { default: {} },
      },
      parseDOM: [
        {
          tag: "a.page-mention[data-page-target]",
          getAttrs: (dom) => ({
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
  },
  marks: {
    underline: {
      parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
      toDOM: () => ["u", 0],
    },
    color: {
      attrs: { color: { default: "" }, nfmAttrs: { default: {} } },
      parseDOM: [
        {
          tag: "span[data-text-color]",
          getAttrs: (dom) => ({ color: dom.getAttribute("data-text-color") }),
        },
      ],
      toDOM: (mark) => [
        "span",
        {
          "data-text-color": mark.attrs.color,
          style: colorStyle(mark.attrs.color),
        },
        0,
      ],
    },
    link: {
      attrs: { href: {}, title: { default: null } },
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
          title: mark.attrs.title,
          rel: "noopener noreferrer",
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
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },
  },
});
