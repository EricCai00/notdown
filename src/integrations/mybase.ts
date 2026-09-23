/** A metadata-only projection. This module never reads or writes a MyBase store. */
export interface MyBasePage {
  id: string;
  title: string;
  body?: string;
  properties?: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_OR_LINE_SEPARATOR = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

function literal(value: string): string {
  // Python's splitlines(), used by MyBase, also splits these Unicode characters.
  return JSON.stringify(value).replace(
    /[\u0085\u2028\u2029]/gu,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function propertyLabel(value: string): string {
  return value.replace(/[\\:^%@\[\]<>!]/gu, "\\$&");
}

function decimal(value: number): string {
  const text = String(value);
  if (!/[eE]/u.test(text)) return text;
  const [coefficient, power] = text.toLowerCase().split("e");
  const sign = coefficient.startsWith("-") ? "-" : "";
  const unsigned = coefficient.replace(/^-/, "");
  const dot = unsigned.indexOf(".");
  const digits = unsigned.replace(".", "");
  const point = (dot < 0 ? unsigned.length : dot) + Number(power);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length)
    return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Export UTF-8 MyBase Notation, using immutable UUID identity and a display name.
 * Untyped frontmatter scalars are deliberately scoped under generated local
 * properties. Rich MyBase statements need a future explicit typed adapter.
 */
export function toMyBase(page: MyBasePage): string {
  if (!page || typeof page.id !== "string" || !UUID.test(page.id)) {
    throw new TypeError("MyBase export requires a UUID page id");
  }
  if (typeof page.title !== "string")
    throw new TypeError("Page title must be a string");
  if (
    page.properties != null &&
    (typeof page.properties !== "object" || Array.isArray(page.properties))
  )
    throw new TypeError("Page properties must be an object");

  const declarations = ["name^prop%String", "note URI^lprop%Url"];
  const statements = [
    `    name: ${literal(page.title)}`,
    `    note URI: <note:${page.id.toLowerCase()}>`,
  ];
  const seenLabels = new Set<string>();
  for (const [key, raw] of Object.entries(page.properties ?? {}).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  )) {
    if (!key || key !== key.trim() || CONTROL_OR_LINE_SEPARATOR.test(key)) {
      throw new TypeError(
        "Property names must be nonempty single-line text without surrounding whitespace",
      );
    }
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length) continue;
    if (
      values.some(
        (value) =>
          value === null ||
          !["string", "number", "boolean"].includes(typeof value),
      )
    ) {
      throw new TypeError(
        `Property ${key} must contain scalar strings, finite numbers, or booleans`,
      );
    }
    const types = new Set(values.map((value) => typeof value));
    if (types.size !== 1)
      throw new TypeError(`Property ${key} must have one scalar type`);
    if (
      values.some(
        (value) => typeof value === "number" && !Number.isFinite(value),
      )
    ) {
      throw new TypeError(`Property ${key} must contain finite numbers`);
    }
    const datatype = typeof values[0] === "number" ? "Quantity" : "String";
    // The datatype suffix avoids incompatible declarations across independent pages.
    const label = `note property ${key} (${datatype})`;
    if (seenLabels.has(label.toLowerCase()))
      throw new TypeError(`Ambiguous property name: ${key}`);
    seenLabels.add(label.toLowerCase());
    const escaped = propertyLabel(label);
    declarations.push(`${escaped}^lprop%${datatype}`);
    for (const value of values) {
      statements.push(
        `    ${escaped}: ${typeof value === "number" ? decimal(value) : literal(String(value))}`,
      );
    }
  }
  return `${declarations.join("\n")}\n\n[Note ${page.id.toLowerCase()}]^lind%document\n${statements.join("\n")}\n`;
}
