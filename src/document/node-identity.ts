import {
  DOMSerializer,
  type Attrs,
  type Fragment,
  type Mark,
  type Node,
  type NodeSpec,
  type NodeType,
  type Schema,
} from "prosemirror-model";
import type { NodeViewConstructor } from "prosemirror-view";

/** Content nodes use the public object ID. Non-content carriers have their own namespace. */
export const nodeNames: Record<string, string> = {
  doc: "doc",
  text: "text",
  paragraph: "block.paragraph",
  heading: "block.heading",
  toggle_heading: "block.toggle_heading",
  blockquote: "block.quote",
  horizontal_rule: "block.divider",
  code_block: "block.code_block",
  executable_chunk: "block.executable_chunk",
  executable_inline: "inline.executable_expression",
  bullet_list_item: "block.bullet_list_item",
  numbered_list_item: "block.numbered_list_item",
  task_list_item: "block.task_list_item",
  columns: "block.columns",
  child_page: "block.link_to_page",
  owned_page: "block.child_page",
  html_block: "block.html_block",
  html_inline: "inline.inline_html",
  definition_list_item: "block.definition_list_item",
  definition_list: "structure.definition_list",
  footnote_reference: "inline.footnote",
  line_block: "block.line_block",
  fenced_div: "block.native_div",
  callout: "block.callout",
  toggle_block: "block.toggle",
  synced_block: "block.synced_block",
  table_of_contents: "block.table_of_contents",
  unknown_block: "block.unsupported",
  media_block: "block.file",
  audio: "block.audio",
  video: "block.video",
  pdf: "block.pdf",
  equation: "block.math_block",
  table: "block.table",
  image: "inline.image",
  hard_break: "character.line_break",
  mention: "inline.mention_page_or_data_source",
  mention_person: "inline.mention_person",
  mention_agent: "inline.mention_agent",
  date_or_reminder: "inline.date_or_reminder",
  inline_math: "inline.inline_math",
  citation: "inline.citation",
  page_link: "inline.internal_link",
  tabs: "block.tabs",
  web_bookmark: "block.web_bookmark",
  link_preview: "block.link_preview",
  link_mention: "inline.link",
  breadcrumb: "block.breadcrumb",
  button: "block.button",
  meeting_notes: "block.meeting_notes",
  ai_block: "block.ai_block",
  web_embed: "block.web_embed",
  notion_embed: "block.web_embed",
  folder: "block.folder",
  database: "block.database",
  meeting_section: "structure.meeting_section",
  image_block: "block.image_block",
  example_list_item: "block.example_list_item",
  nested_block: "structure.nested_block",
  bullet_list: "structure.bullet_list",
  ordered_list: "structure.ordered_list",
  column: "structure.column",
  tab: "structure.tab",
  table_row: "structure.table_row",
  table_cell: "structure.table_cell",
  table_caption: "structure.table_caption",
  definition_term: "structure.definition_term",
  definition_description: "structure.definition_description",
  footnote: "structure.footnote",
  footnote_section: "structure.footnote_section",
  footnote_anchor: "structure.footnote_anchor",
  line: "structure.line",
  example_list: "structure.example_list",
  inline_note: "structure.inline_note",
  syntax_block: "block.unsupported",
  syntax_inline: "structure.preserved_inline",
  opaque_block: "block.unsupported",
};

/** Codec representation names are not schema node names or persisted object IDs. */
const sourceBlockNames: Record<string, string> = {
  diagram: "block.diagram",
  embed: "block.web_embed",
  figure: "block.image_block",
  comment: "block.block_comment",
  transclusion: "block.file_transclusion",
  "html-markdown": "block.html_block",
  definition: "structure.reference_definition",
};
const sourceInlineNames: Record<string, string> = {
  comment: "inline.inline_comment",
  variable: "inline.metadata_variable",
  glossary: "inline.glossary",
  abbreviation: "inline.abbreviation",
  citation: "inline.citation",
  unresolved_reference: "inline.link",
  "block-anchor": "inline.internal_link",
  "example-reference": "inline.internal_link",
};
export function nodeName(kind: string): string {
  return nodeNames[kind] || kind;
}
export function editorKind(value: Node | Mark): string;
export function editorKind(
  value: Node | Mark | null | undefined,
): string | undefined;
export function editorKind(
  value: Node | Mark | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const representation = value.attrs.editorRepresentation;
  return value.type.spec.editorRepresentations?.includes(representation)
    ? representation
    : value.type.spec.editorKind || value.type.name;
}
export function isEditorKind<
  T extends Node | Mark | null | undefined,
  K extends string,
>(
  value: T,
  kind: K,
): value is NonNullable<T> & { type: { spec: { editorKind: K } } } {
  return editorKind(value) === kind;
}

export function editorNodeType(
  schema: Schema,
  kind: string,
  attrs?: Attrs | null,
): NodeType {
  let id: string | undefined;
  if (kind === "syntax_block") {
    id = sourceBlockNames[attrs?.kind] || "block.unsupported";
    if (attrs?.kind === "metadata")
      id =
        attrs.metadataForm === "pandoc" || String(attrs.raw).startsWith("%")
          ? "metadata.pandoc_title_block"
          : "metadata.yaml_front_matter";
    if (attrs?.kind === "raw" && attrs.data?.format === "html")
      id = "block.html_block";
  } else if (kind === "syntax_inline") {
    id = sourceInlineNames[attrs?.kind] || "structure.preserved_inline";
    if (attrs?.kind === "raw" && attrs.title === "html")
      id = "inline.inline_html";
  } else if (kind === "opaque_block" && attrs?.metadataForm)
    id =
      attrs.metadataForm === "pandoc"
        ? "metadata.pandoc_title_block"
        : "metadata.yaml_front_matter";
  if (kind === "mention")
    kind =
      attrs?.kind === "user"
        ? "mention_person"
        : attrs?.kind === "agent"
          ? "mention_agent"
        : attrs?.kind === "date"
          ? "date_or_reminder"
          : "mention";
  else if (
    kind === "media_block" &&
    ["audio", "video", "pdf"].includes(attrs?.type)
  )
    kind = attrs!.type;
  else if (kind === "heading" && attrs?.toggle) kind = "toggle_heading";
  const type = schema.nodes[id || nodeName(kind)];
  if (!type) throw new RangeError("Unknown editor node: " + kind);
  return type;
}

export function createEditorNode(
  schema: Schema,
  kind: string,
  attrs?: Attrs | null,
  content?: Fragment | Node | readonly Node[] | null,
  marks?: readonly Mark[],
) {
  const type = editorNodeType(schema, kind, attrs);
  return type.create(
    {
      ...attrs,
      editorRepresentation: nodeNames[kind] ? kind : type.spec.editorKind,
    },
    content,
    marks,
  );
}

const representationNodes = new Map<string, Set<string>>();

/** Dotted IDs cannot appear in ProseMirror content expressions; groups carry those constraints. */
export function namedNodeSpecs(
  specs: Record<string, NodeSpec>,
): Record<string, NodeSpec> {
  const variants: Record<string, [string, Record<string, unknown>]> = {
    mention_person: ["mention", { kind: "user" }],
    mention_agent: ["mention", { kind: "agent" }],
    date_or_reminder: ["mention", { kind: "date" }],
    audio: ["media_block", { type: "audio" }],
    video: ["media_block", { type: "video" }],
    pdf: ["media_block", { type: "pdf" }],
    toggle_heading: ["heading", { toggle: true }],
    owned_page: ["child_page", {}],
  };
  const result: Record<string, NodeSpec> = {};
  const add = (id: string, kind: string, spec: NodeSpec) => {
    if (!representationNodes.has(kind))
      representationNodes.set(kind, new Set());
    representationNodes.get(kind)!.add(id);
    const previous = result[id];
    const parseDOM = spec.parseDOM?.map((rule) => ({
      ...rule,
      getAttrs: (dom: HTMLElement | string) => {
        const attrs = rule.getAttrs
          ? (
              rule.getAttrs as (
                dom: HTMLElement | string,
              ) => Attrs | false | null
            )(dom)
          : rule.attrs;
        return attrs === false
          ? false
          : { ...attrs, editorRepresentation: kind };
      },
    }));
    result[id] = {
      ...spec,
      ...previous,
      editorRepresentations: [
        ...new Set([...(previous?.editorRepresentations || []), kind]),
      ],
      attrs: {
        ...spec.attrs,
        ...previous?.attrs,
        ...(previous
          ? { editorRepresentation: { default: previous.editorKind || kind } }
          : {}),
      },
      parseDOM: [...(previous?.parseDOM || []), ...(parseDOM || [])],
      toDOM: (node) => specs[editorKind(node)!].toDOM!(node),
    };
  };
  for (const [kind, spec] of Object.entries(specs)) {
    if (!nodeNames[kind]) throw new Error("Missing node object ID: " + kind);
    if (kind === "doc" || kind === "text") {
      result[kind] = spec;
      continue;
    }
    add(nodeName(kind), kind, {
      ...spec,
      editorKind: kind,
      group: [spec.group, kind].filter(Boolean).join(" "),
    });
  }
  for (const [kind, id] of Object.entries(sourceBlockNames))
    add(id, "syntax_block", {
      ...specs.syntax_block,
      editorKind: "syntax_block",
      attrs: {
        ...specs.syntax_block.attrs,
        kind: result[id] ? specs.syntax_block.attrs!.kind : { default: kind },
      },
    });
  for (const [kind, id] of Object.entries(sourceInlineNames))
    add(id, "syntax_inline", {
      ...specs.syntax_inline,
      editorKind: "syntax_inline",
      attrs: {
        ...specs.syntax_inline.attrs,
        kind: result[id] ? specs.syntax_inline.attrs!.kind : { default: kind },
      },
    });
  add("inline.inline_html", "syntax_inline", {
    ...specs.syntax_inline,
    editorKind: "syntax_inline",
    attrs: {
      ...specs.syntax_inline.attrs,
      kind: { default: "raw" },
      title: { default: "html" },
    },
  });
  for (const [id, metadataForm] of [
    ["metadata.yaml_front_matter", "yaml"],
    ["metadata.pandoc_title_block", "pandoc"],
  ])
    add(id, "syntax_block", {
      ...specs.syntax_block,
      editorKind: "syntax_block",
      attrs: {
        ...specs.syntax_block.attrs,
        kind: { default: "metadata" },
        metadataForm: { default: metadataForm },
      },
    });
  for (const id of [
    "metadata.yaml_front_matter",
    "metadata.pandoc_title_block",
  ])
    add(id, "opaque_block", {
      ...specs.opaque_block,
      editorKind: "opaque_block",
    });
  result["block.unsupported"].editorKind = "unknown_block";
  result["block.unsupported"].attrs!.editorRepresentation = {
    default: "unknown_block",
  };
  for (const [kind, [base, defaults]] of Object.entries(variants)) {
    const spec = result[nodeName(base)];
    result[nodeName(kind)] = {
      ...spec,
      parseDOM: undefined,
      attrs: {
        ...spec.attrs,
        ...Object.fromEntries(
          Object.entries(defaults).map(([key, value]) => [
            key,
            { default: value },
          ]),
        ),
      },
    };
    representationNodes.get(base)!.add(nodeName(kind));
  }
  return result;
}

export function namedNodeViews(
  views: Record<string, NodeViewConstructor>,
): Record<string, NodeViewConstructor> {
  const result: Record<string, NodeViewConstructor> = {};
  for (const kind of Object.keys(views))
    for (const id of representationNodes.get(kind) || [nodeName(kind)]) {
      result[id] = (node, view, getPos, decorations, innerDecorations) => {
        const create = views[editorKind(node)!];
        const result = create
          ? create(node, view, getPos, decorations, innerDecorations)
          : DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
        if ("update" in result && result.update) {
          const update = result.update;
          result.update = (next, ...args) =>
            editorKind(next) === editorKind(node) &&
            update.call(result, next, ...args);
        }
        return result;
      };
    }
  return result;
}
