import type { DOMOutputSpec, Node as PMNode } from "prosemirror-model";
import { domAttributes } from "../markdown-engine/attributes";
import { isEditorKind } from "./node-identity";
import { safeReference as safeUrl, escapeXml } from "./notion-syntax";
import { imageCaptionRange } from "./image-caption";

export type ImageCrop = [number, number, number, number, number];
export interface ImageModel { src: string; alt: string; title: string; caption: string; attributes: Record<string, string> }
export function imageModel(node: PMNode): ImageModel | null {
  if (isEditorKind(node, "syntax_block")) return node.attrs.kind === "figure" ? node.attrs.data?.image || null : null;
  if (isEditorKind(node, "image") || isEditorKind(node, "image_block")) return {
    src: node.attrs.src, alt: node.attrs.markdownAttrs?.alt ?? (node.attrs.syntaxForm === "notion" ? node.attrs.caption : node.attrs.alt) ?? "", title: node.attrs.title || "",
    caption: isEditorKind(node, "image") ? node.attrs.alt || "" : node.attrs.caption || "",
    attributes: node.attrs.markdownAttrs || {},
  };
  return null;
}
export function readImageCrop(value: unknown): ImageCrop | null {
  if (typeof value !== "string") return null;
  const values = value.split(",").map(Number);
  if (values.length !== 5 || values.some(n => !Number.isFinite(n))) return null;
  const [x, y, w, h, ratio] = values;
  return x >= 0 && y >= 0 && w >= .02 && h >= .02 && x + w <= 1.00001 && y + h <= 1.00001 && ratio > 0 && ratio <= 100
    ? values as ImageCrop : null;
}
export function imageLayout(attributes: Record<string, string>, supplemental: boolean) {
  const width = /^(?:[1-9]\d{0,4})(?:px|%)?$/.test(attributes.width || "") ? attributes.width.replace(/^(\d+)$/, "$1px") : "";
  const align = supplemental && ["left", "center", "right"].includes(attributes.align) ? attributes.align : "center";
  return { width, align, crop: supplemental ? readImageCrop(attributes.crop) : null };
}

/** Locate one leading image and its trailing attribute list; never rewrite arbitrary source. */
function imageTail(raw: string) {
  const label = imageCaptionRange(raw);
  if (!label) throw new Error("Edit this image in Source view.");
  let end = label.to + 1;
  const opening = raw[end], closing = opening === "(" ? ")" : opening === "[" ? "]" : "";
  if (closing) {
    let depth = 1, quote = "";
    for (end++; end < raw.length; end++) {
      const char = raw[end];
      if (char === "\\") { end++; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if ((char === '"' || char === "'") && /\s/.test(raw[end - 1])) { quote = char; continue; }
      if (char === opening) depth++;
      if (char === closing && --depth === 0) { end++; break; }
    }
    if (depth) throw new Error("The image destination is incomplete.");
  }
  const tail = raw.slice(end), start = /^\s*\{/.exec(tail);
  if (!start) {
    if (tail.trim()) throw new Error("Edit this image's complex source in Source view.");
    return { start: end, end, attributes: "", hasAttributes: false };
  }
  let quote = "", stop = end + start[0].length;
  for (; stop < raw.length; stop++) {
    const char = raw[stop];
    if (char === "\\") { stop++; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === "}") break;
    else if (char === "{") throw new Error("Edit nested attributes in Source view.");
  }
  if (stop === raw.length || raw.slice(stop + 1).trim()) throw new Error("The image attributes are incomplete.");
  const from = end + start[0].length - 1;
  return { start: from, end: stop + 1, attributes: raw.slice(from + 1, stop), hasAttributes: true };
}

export function replaceImageAttributes(raw: string, changes: Record<string, string | null>) {
  const tail = imageTail(raw);
  let attributes = tail.attributes;
  // Tokenize the bounded attribute list so matching words inside unknown quoted values stay untouched.
  const tokens = /(?:[^\s"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')+/g;
  const edits: { from: number; to: number; value: string }[] = [];
  const seen = new Set<string>();
  for (const match of attributes.matchAll(tokens)) {
    const key = /^([\w:-]+)=/.exec(match[0])?.[1];
    if (!key || !Object.hasOwn(changes, key)) continue;
    const value = changes[key];
    edits.push({ from: match.index!, to: match.index! + match[0].length,
      value: !seen.has(key) && value !== null ? `${key}="${escapeXml(value)}"` : "" });
    seen.add(key);
  }
  for (const edit of edits.reverse()) attributes = attributes.slice(0, edit.from) + edit.value + attributes.slice(edit.to);
  for (const [key, value] of Object.entries(changes)) {
    if (!["width", "align", "crop"].includes(key)) throw new Error("Unsupported image layout property.");
    if (!seen.has(key) && value !== null) attributes += `${attributes && !/\s$/.test(attributes) ? " " : ""}${key}="${escapeXml(value)}"`;
  }
  return raw.slice(0, tail.start) + (attributes.trim() ? `${tail.hasAttributes ? "" : " "}{${attributes}}` : "") + raw.slice(tail.end);
}

export function replaceImageDestination(raw: string, src: string) {
  const label = imageCaptionRange(raw);
  if (!label || raw[label.to + 1] !== "(") throw new Error("Use Source view to replace a reference-style image link.");
  let start = label.to + 2;
  while (/\s/.test(raw[start] || "") && start < raw.length) start++;
  let end = start, depth = 0;
  if (raw[start] === "<") {
    for (end = start + 1; end < raw.length && raw[end] !== ">"; end++) if (raw[end] === "\\") end++;
    if (end === raw.length) throw new Error("The image destination is incomplete.");
    end++;
  } else {
    for (; end < raw.length; end++) {
      const char = raw[end];
      if (char === "\\") { end++; continue; }
      if (char === "(") depth++;
      else if (char === ")") { if (!depth) break; depth--; }
      else if (/\s/.test(char) && !depth) break;
    }
  }
  if (!src.trim() || safeUrl(src) !== src || /[\r\n<>]/.test(src)) throw new Error("Enter a valid image URL or attachment path.");
  const encoded = src.replace(/[\s()\\]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return raw.slice(0, start) + encoded + raw.slice(end);
}

/** Safe generated presentation, also used by HTML export; the original asset remains unchanged. */
export function imageFigureHTML(model: ImageModel, supplemental: boolean) {
  const { width, align, crop } = imageLayout(model.attributes, supplemental);
  const margin = align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";
  const imageStyle = crop ? `position:absolute;left:${-crop[0] / crop[2] * 100}%;top:${-crop[1] / crop[3] * 100}%;width:${100 / crop[2]}%;height:${100 / crop[3]}%;max-width:none;` : "display:block;width:100%;height:auto;";
  const extras = Object.entries(domAttributes(model.attributes)).filter(([key]) => !["style", "title"].includes(key)).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  return `<figure class="pm-export-image" style="max-width:100%;width:${width || (crop ? "100%" : "fit-content")};margin:${margin}"><span style="display:block;position:relative;overflow:hidden;${crop ? `aspect-ratio:${crop[4] * crop[2] / crop[3]};` : ""}"><img${extras} src="${escapeXml(safeUrl(model.src))}" alt="${escapeXml(model.alt)}" title="${escapeXml(model.title)}" style="${imageStyle}"></span>${model.caption ? `<figcaption>${escapeXml(model.caption)}</figcaption>` : ""}</figure>`;
}

export function imageLayoutDOM(node: PMNode): DOMOutputSpec {
  const model = imageModel(node)!, { width, align, crop } = imageLayout(model.attributes, true);
  const margin = align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";
  const style = crop ? `position:absolute;left:${-crop[0] / crop[2] * 100}%;top:${-crop[1] / crop[3] * 100}%;width:${100 / crop[2]}%;height:${100 / crop[3]}%;max-width:none;` : "display:block;width:100%;height:auto;";
  return ["span", { class: "pm-image-layout", style: `display:block;position:relative;overflow:hidden;max-width:100%;width:${width || (crop ? "100%" : "fit-content")};margin:${margin};${crop ? `aspect-ratio:${crop[4] * crop[2] / crop[3]};` : ""}` },
    ["img", { ...domAttributes(model.attributes), src: safeUrl(model.src), alt: model.alt, title: model.title, style }]];
}
