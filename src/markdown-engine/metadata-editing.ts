import { parseDocument } from "yaml";
import { mmdMetadataKey } from "./mmd-metadata";

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
