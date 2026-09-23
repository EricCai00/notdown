import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { escapeXml } from "../notion-syntax.js";

const allowed = new Set(
  "a abbr b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd label li mark ol p pre s small span strong sub summary sup table tbody td th thead textarea tfoot time tr u ul".split(
    " ",
  ),
);
const hidden = new Set(
  "script style iframe object embed template svg math form input select button link meta base noscript".split(
    " ",
  ),
);
const voids = new Set(["br", "hr", "img", "col"]);
const cache = new Map<string, string>();
function safeStyle(value: string) {
  return value
    .split(";")
    .flatMap((part) => {
      const at = part.indexOf(":");
      if (at < 0) return [];
      const key = part.slice(0, at).trim().toLowerCase(),
        val = part.slice(at + 1).trim();
      const rules: Record<string, RegExp> = {
        color: /^(?:#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|hsl)a?\([\d.,% /-]+\))$/i,
        "background-color":
          /^(?:#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|hsl)a?\([\d.,% /-]+\))$/i,
        "text-align": /^(left|right|center|justify|start|end)$/,
        "font-weight": /^(normal|bold|[1-9]00)$/,
        "font-style": /^(normal|italic|oblique)$/,
        "text-decoration": /^(none|underline|line-through|overline)$/,
        "white-space": /^(normal|pre|pre-wrap|pre-line)$/,
      };
      return rules[key]?.test(val) ? [`${key}:${val}`] : [];
    })
    .join(";");
}
/** Same HTML5 parser and allowlist in the browser and exported HTML. Raw source is untouched. */
export function renderRawHtml(raw: string): string {
  const prior = cache.get(raw);
  if (prior !== undefined) return prior;
  const render = (node: DefaultTreeAdapterMap["childNode"]): string => {
    if (node.nodeName === "#text")
      return escapeXml((node as DefaultTreeAdapterMap["textNode"]).value);
    if (!("tagName" in node)) return "";
    const tag = node.tagName;
    if (hidden.has(tag)) return "";
    const content = node.childNodes.map(render).join("");
    if (!allowed.has(tag)) return content;
    const attrs = node.attrs.flatMap(({ name, value }) => {
      if (name === "style") {
        const style = safeStyle(value);
        return style ? [`style="${escapeXml(style)}"`] : [];
      }
      if (name === "href" && tag === "a")
        return /^(?:https?:\/\/|mailto:|#(?!page\/))[^\u0000-\u0020]*$/i.test(
          value,
        )
          ? [`href="${escapeXml(value)}"`, `rel="noreferrer noopener"`]
          : [];
      if (name === "src" && tag === "img")
        return /^(?:https?:\/\/|assets\/)[^\u0000-\u0020\\]*$/i.test(value)
          ? [`src="${escapeXml(value)}"`, `loading="lazy"`]
          : [];
      if (["title", "alt", "datetime"].includes(name))
        return [`${name}="${escapeXml(value)}"`];
      if (
        ["colspan", "rowspan", "width", "height", "start", "span", ...(tag === "textarea" ? ["rows", "cols"] : [])].includes(
          name,
        ) &&
        /^\d{1,4}$/.test(value)
      )
        return [`${name}="${value}"`];
      if (name === "open" && tag === "details") return ["open"];
      // No ids, app classes, data attributes, event handlers, or executable URLs.
      return [];
    });
    if (tag === "textarea") attrs.push('readonly', 'aria-label="HTML text area preview"');
    return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>${voids.has(tag) ? "" : content + `</${tag}>`}`;
  };
  const result = parseFragment(raw).childNodes.map(render).join("");
  if (raw.length < 100000) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(raw, result);
  }
  return result;
}
