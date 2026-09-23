import type { NodeSpec, MarkSpec, DOMOutputSpec, Node as PMNode } from "prosemirror-model";
import { domAttributes } from "./markdown-engine/attributes";

const attrs = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { default: value }]));
export const objectTags: Record<string, string> = {
  tabs: "tabs", tab: "tab", bookmark: "web_bookmark", "link-preview": "link_preview",
  breadcrumb: "breadcrumb", button: "button", "meeting-notes": "meeting_notes", "ai-block": "ai_block",
  "html-embed": "html_embed", "web-embed": "embed_web_contents", figure: "image_block",
};
export const objectFields: Record<string, Record<string, string>> = {
  tabs: { active: "Active tab" }, tab: { title: "Tab title" },
  web_bookmark: { url: "URL", title: "Title", description: "Description", icon: "Icon URL", image: "Image URL", caption: "Caption" },
  link_preview: { url: "URL", title: "Title", description: "Description", image: "Image URL" },
  link_mention: { url: "URL", label: "Label" },
  breadcrumb: {}, // Legacy path remains in the codec; navigation uses the current hierarchy.
  button: { label: "Label" }, // Uses the dedicated step editor, not generic string fields.
  meeting_notes: { title: "Meeting title", audio: "Audio attachment", language: "Language" },
  ai_block: { prompt: "Prompt", model: "Model (blank uses settings)" },
  html_embed: { html: "HTML document" },
  embed_web_contents: { url: "Embed URL", title: "Title" },
  image_block: { src: "Image URL", alt: "Alternative text", caption: "Caption", title: "Title" },
  media_block: { src: "Attachment URL", caption: "Caption" },
  unknown_block: { url: "Source reference", alt: "Description" },
  fenced_div: { attributes: "Div attributes" },
  synced_block: { "@id": "Block ID", url: "Source reference" },
};
const safeUrl = (s: unknown) => /^(?:https?:|\/|\.\.?\/|[^:/\\]+(?:\/|\.)|#)/i.test(String(s)) && !/^\/\//.test(String(s)) ? String(s) : "";
export function objectNodeSpecs(block: (spec: NodeSpec) => NodeSpec): Record<string, NodeSpec> {
  const card = (name: string): NodeSpec => block({
    group: "block", atom: true, selectable: true, draggable: true,
    attrs: attrs({ url: "", title: "", description: "", image: "", caption: "", ...(name === "web_bookmark" ? { icon: "" } : {}) }),
    toDOM: n => ["figure", { class: "pm-object-card", "data-object": name },
      ["a", { href: safeUrl(n.attrs.url), rel: "noopener noreferrer" }, n.attrs.title || n.attrs.url || "Link"],
      ...(safeUrl(n.attrs.image) ? [["img", { src: safeUrl(n.attrs.image), alt: "", loading: "lazy" }] as DOMOutputSpec] : []),
      ["p", n.attrs.description], ["figcaption", n.attrs.caption]],
  });
  return {
    tabs: block({ group: "block", content: "tab+", defining: true, isolating: true, attrs: attrs({ active: 0 }), toDOM: () => ["div", { class: "pm-tabs" }, 0] }),
    tab: block({ content: "block+", defining: true, isolating: true, attrs: attrs({ title: "Tab" }), toDOM: n => ["section", { class: "pm-tab", "data-title": n.attrs.title }, 0] }),
    web_bookmark: card("web_bookmark"), link_preview: card("link_preview"),
    link_mention: { inline: true, group: "inline", atom: true, selectable: true,
      attrs: attrs({ url: "", label: "", nfmAttrs: {} }),
      toDOM: n => ["a", { class: "pm-link-mention", href: safeUrl(n.attrs.url), "data-link-mention": "true", "data-label": n.attrs.label, rel: "noopener noreferrer" }, n.attrs.label || n.attrs.url],
      parseDOM: [{ tag: "a[data-link-mention]", getAttrs: el => ({ url: el.getAttribute("href"), label: el.getAttribute("data-label") || "" }) }],
    },
    breadcrumb: block({ group: "block", atom: true, attrs: attrs({ path: "" }), toDOM: n => ["nav", { class: "pm-breadcrumb", "aria-label": "Breadcrumb" }, ...String(n.attrs.path).split("\n").filter(Boolean).map(id => ["a", { href: "#page/" + encodeURIComponent(id) }, id] as DOMOutputSpec)] }),
    button: block({ group: "block", atom: true, attrs: attrs({ label: "Button", icon: "", variant: "default", actions: "", action: "insert-text", target: "" }), toDOM: n => ["button", { type: "button", class: "pm-action-button", "data-variant": n.attrs.variant }, ["span", { "aria-hidden": "true" }, n.attrs.icon], ["span", n.attrs.label]] }),
    meeting_notes: block({ group: "block", content: "block+", defining: true, isolating: true, attrs: attrs({ title: "Meeting notes", audio: "", language: "", transcript: "" }), toDOM: n => ["section", { class: "pm-meeting-notes" }, ["h3", n.attrs.title], ["div", 0]] }),
    ai_block: block({ group: "block", content: "block+", defining: true, isolating: true, attrs: attrs({ prompt: "", model: "" }), toDOM: () => ["section", { class: "pm-ai-block" }, 0] }),
    html_embed: block({ group: "block", atom: true, attrs: attrs({ html: "" }), toDOM: n => ["iframe", { class: "pm-html-embed", sandbox: "", referrerpolicy: "no-referrer", srcdoc: n.attrs.html, title: "HTML document" }] }),
    embed_web_contents: block({ group: "block", atom: true, attrs: attrs({ url: "", title: "" }), toDOM: n => ["iframe", { src: /^https?:\/\//i.test(n.attrs.url) ? n.attrs.url : "", title: n.attrs.title || "Web embed", sandbox: "allow-scripts allow-forms allow-presentation", referrerpolicy: "no-referrer" }] }),
    image_block: block({ group: "block", atom: true, draggable: true, attrs: attrs({ src: "", alt: "", caption: "", title: "" }), toDOM: n => ["figure", { class: "pm-image-block" }, ["img", { src: safeUrl(n.attrs.src), alt: n.attrs.alt, title: n.attrs.title }], ["figcaption", n.attrs.caption]] }),
    example_list: block({ group: "block", content: "example_list_item+", attrs: attrs({ start: 1 }), toDOM: n => ["ol", { start: n.attrs.start, class: "pm-example-list" }, 0] }),
    example_list_item: block({ content: "paragraph block*", defining: true, attrs: attrs({ label: "", number: 1 }), toDOM: n => ["li", { "data-example-label": n.attrs.label, id: n.attrs.label ? "md-example-" + n.attrs.label : undefined, value: n.attrs.number }, 0] }),
    inline_note: { inline: true, group: "inline", content: "inline*", isolating: true, toDOM: () => ["span", { class: "pm-inline-note" }, 0] },
  };
}
export const objectMarkSpecs: Record<string, MarkSpec> = {
  native_span: { attrs: attrs({ attributes: {}, syntaxForm: "bracketed" }), inclusive: false, parseDOM: [{ tag: "span[data-native-span]", getAttrs: dom => {
    try { const attributes = JSON.parse(dom.getAttribute("data-native-span") || "{}"); return attributes && !Array.isArray(attributes) && typeof attributes === "object" && Object.values(attributes).every(v => typeof v === "string") ? { attributes } : false; } catch { return false; }
  } }], toDOM: m => ["span", { ...domAttributes(m.attrs.attributes), "data-native-span": JSON.stringify(m.attrs.attributes) }, 0] },
  small_caps: { attrs: attrs({ attributes: { class: "smallcaps" }, syntaxForm: "bracketed" }), parseDOM: [{ tag: "span.smallcaps", getAttrs: dom => ({ attributes: Object.fromEntries([...dom.attributes].map(a => [a.name, a.value])), syntaxForm: "html" }) }, { style: "font-variant=small-caps" }], toDOM: m => ["span", { ...domAttributes(m.attrs.attributes), class: "smallcaps " + (domAttributes(m.attrs.attributes).class || ""), style: "font-variant:small-caps" }, 0] },
};
export const objectSamples: Record<string, string> = {
  embed_web_contents: '<web-embed url="https://example.com"/>',
  tabs: '<tabs active="0">\n<tab title="First">\nFirst tab content\n</tab>\n<tab title="Second">\nSecond tab content\n</tab>\n</tabs>',
  web_bookmark: '<bookmark url="https://example.com" title="Example" description="Bookmark description" caption=""/>',
  link_preview: '<link-preview url="https://example.com" title="Example" description="Link description"/>',
  breadcrumb: '<breadcrumb path=""/>', button: '<button label="New task" icon="＋" actions="[{&quot;type&quot;:&quot;insert-blocks&quot;,&quot;position&quot;:&quot;below&quot;,&quot;content&quot;:&quot;- [ ] New task&quot;}]"/>',
  meeting_notes: '<meeting-notes title="Meeting notes" audio="">\nWrite meeting notes here.\n</meeting-notes>',
  ai_block: '<ai-block prompt="Summarize the following text" model="">\nWrite text to summarize here.\n</ai-block>',
  html_embed: '<html-embed>\n&lt;!doctype html&gt;&lt;html&gt;&lt;body&gt;&lt;h1&gt;Embedded document&lt;/h1&gt;&lt;/body&gt;&lt;/html&gt;\n</html-embed>',
};
export function objectId(node: PMNode): string | undefined {
  if (Object.values(objectTags).includes(node.type.name)) return "block." + node.type.name;
  if (node.type.name === "example_list_item") return "block.example_list_item";
  if (node.type.name === "inline_note") return "inline.footnote";
}
