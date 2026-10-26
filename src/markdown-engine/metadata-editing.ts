import { isMap, parseDocument } from "yaml";
import { mmdMetadataKey } from "./mmd-metadata";
import { syntaxFormat, type SyntaxConfig } from "./config";
import { documentMetadata } from "../features/metadata/document-metadata";

/** An explicit settings change updates existing document overrides, never adds app YAML. */
export function configureDocumentSyntax(source: string, config: SyntaxConfig): string {
  const metadata = documentMetadata(source);
  if (metadata.form !== "yaml" || !Object.hasOwn(metadata.values, "syntax") && !Object.hasOwn(metadata.values, "bodyFormat")) return source;
  const syntaxChanged = Object.hasOwn(metadata.values, "syntax") && JSON.stringify(metadata.values.syntax) !== JSON.stringify(config);
  const formatChanged = Object.hasOwn(metadata.values, "bodyFormat") && metadata.values.bodyFormat !== syntaxFormat(config);
  if (!syntaxChanged && !formatChanged) return source;
  const match = /^((?:\uFEFF)?---[\t ]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[\t ]*(?=\r?\n|$))/.exec(source);
  if (!match) throw new Error("Keep a complete YAML metadata block before changing the dialect.");
  const doc = parseDocument(match[2], { uniqueKeys: true });
  if (doc.errors.length || !isMap(doc.contents)) throw new Error("Fix the YAML source before changing the dialect.");
  if (Object.hasOwn(metadata.values, "syntax")) {
    const previous = doc.get("syntax", true);
    if (isMap(previous)) {
      for (const key of Object.keys(metadata.values.syntax as object)) if (!Object.hasOwn(config, key)) previous.delete(key);
      for (const [key, value] of Object.entries(config)) {
        if (JSON.stringify((metadata.values.syntax as SyntaxConfig)[key]) === JSON.stringify(value)) continue;
        const field = previous.get(key, true);
        if (key === "extensions" && isMap(field)) {
          for (const extension of field.items.map(item => String(item.key))) if (!Object.hasOwn(config.extensions, extension)) field.delete(extension);
          for (const [extension, enabled] of Object.entries(config.extensions)) if (field.get(extension) !== enabled) field.set(extension, enabled);
        } else previous.set(key, value);
      }
    } else doc.set("syntax", config);
  }
  if (Object.hasOwn(metadata.values, "bodyFormat")) doc.set("bodyFormat", syntaxFormat(config));
  const newline = match[1].endsWith("\r\n") ? "\r\n" : "\n";
  const rendered = doc.toString(), withoutFinalNewline = rendered.replace(/\r?\n$/, "");
  // A |+ scalar can own the final newline; do not trim significant unknown data.
  const sameValues = JSON.stringify(parseDocument(withoutFinalNewline).toJS({ maxAliasCount: 50 })) === JSON.stringify(doc.toJS({ maxAliasCount: 50 }));
  const header = (sameValues ? withoutFinalNewline : rendered).replace(/\r?\n/g, newline);
  return match[1] + header + match[3] + source.slice(match[0].length);
}

export function pandocTitleValues(raw: string): Record<string, string> {
  const values = ["", "", ""]; let index = -1;
  for (const line of raw.split(/\r?\n/)) {
    if (/^%(?:\s|$)/.test(line)) { if (++index > 2) break; values[index] = line.replace(/^%\s*/, ""); }
    else if (index >= 0) values[index] += "\n" + line.trim();
  }
  return { title: values[0], author: values[1], date: values[2] };
}
export function editMetadata(raw: string, form: string, key: string, value: string): string {
  if (form === "pandoc") {
    const values = pandocTitleValues(raw); values[key] = value;
    return ["title", "author", "date"].map(k => "% " + values[k].replace(/\n/g, "\n  ")).join("\n");
  }
  if (form === "yaml") {
    const header = /^---[^\n]*\n/.exec(raw)?.[0] || "---\n", footer = /\n(?:---|\.\.\.)\s*$/.exec(raw)?.[0] || "\n---";
    const doc = parseDocument(raw.slice(header.length, raw.length - footer.length));
    if (doc.errors.length) throw new Error("Fix the YAML source before editing its fields.");
    const previous = doc.get(key);
    if (typeof previous === "boolean" && !/^(true|false)$/.test(value)) throw new Error("Enter true or false for a boolean property.");
    if (typeof previous === "number" && (value.trim() === "" || !Number.isFinite(Number(value)))) throw new Error("Enter a number for a numeric property.");
    doc.set(key, typeof previous === "number" ? Number(value) : typeof previous === "boolean" ? value === "true" : value); return header + doc.toString().trimEnd() + footer;
  }
  const lines = raw.split(/\r?\n/); let begin = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z0-9][A-Za-z0-9 _-]*):/.exec(lines[i]);
    if (begin < 0 && match && mmdMetadataKey(match[1]) === mmdMetadataKey(key)) begin = i;
    else if (begin >= 0 && (match || /^(?:---|\.\.\.)\s*$/.test(lines[i]))) { end = i; break; }
  }
  const label = begin >= 0 ? lines[begin].slice(0, lines[begin].indexOf(":")) : key;
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(label)) throw new Error("MultiMarkdown metadata requires an ASCII key.");
  const replacement = [label + ": " + value.replace(/\n/g, "\n    ")];
  if (begin >= 0) lines.splice(begin, end - begin, ...replacement);
  else lines.splice(/^(?:---|\.\.\.)\s*$/.test(lines.at(-1) || "") ? lines.length - 1 : lines.length, 0, ...replacement);
  return lines.join("\n");
}
