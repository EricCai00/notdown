import type MarkdownIt from "markdown-it";
import link from "markdown-it/lib/rules_inline/link.mjs";
import image from "markdown-it/lib/rules_inline/image.mjs";
import { enabled, supportsOption, type SyntaxConfig } from "./config";

/** Adapt reference parsing without changing code, escapes or the document source. */
export function installReferenceOptions(md: MarkdownIt, config: SyntaxConfig) {
  for (const [name, rule, offset] of [["link", link, 0], ["image", image, 1]] as const)
  md.inline.ruler.at(name, (s, silent) => {
    if (s.src[s.pos + offset] !== "[" || offset && s.src[s.pos] !== "!") return false;
    const end = md.helpers.parseLinkLabel(s, s.pos + offset, !offset);
    if (end < 0) return false;
    const tail = s.src.slice(end + 1);
    if (enabled(config, "spaced_reference_links")) {
      const gap = /^[ \t\n]+(?=\[)/.exec(tail)?.[0];
      if (gap) {
        const original = s.src, max = s.posMax;
        s.src = original.slice(0, end + 1) + original.slice(end + 1 + gap.length);
        s.posMax -= gap.length;
        try {
          const success = rule(s, silent);
          if (success && s.pos > end + 1) { s.pos += gap.length; return true; }
          return success;
        } finally { s.src = original; s.posMax = max; }
      }
    }
    // CommonMark/GFM have shortcut references in their base syntax. Only the
    // Pandoc switch (when supported) changes it; an explicit false disables it.
    const shortcuts = !supportsOption(config, "shortcut_reference_links") ||
      enabled(config, "shortcut_reference_links");
    if (!shortcuts && !tail.startsWith("[") && !tail.startsWith("(")) return false;
    return rule(s, silent);
  });
}
