import { editorKind, isEditorKind } from "../document/node-identity";
import { InputRule, inputRules } from "prosemirror-inputrules";

/** Typing conveniences, not Markdown grammar. Stored content is plain Unicode. */
export const symbolReplacements = [
  ["<->", "↔"],
  ["<=>", "⇔"],
  ["->", "→"],
  ["<-", "←"],
  ["=>", "⇒"],
  ["<=", "≤"],
  [">=", "≥"],
  ["!=", "≠"],
  ["+/-", "±"],
  ["...", "…"],
  ["(c)", "©"],
  ["(r)", "®"],
  ["(tm)", "™"],
] as const;

export function symbolReplacementPlugin(allow: () => boolean) {
  // A shorter rule may have fired before the final > of a bidirectional arrow.
  const replacements = [...symbolReplacements, ["←>", "↔"], ["≤>", "⇔"]];
  return inputRules({
    rules: replacements.map(
      ([source, symbol]) =>
        new InputRule(
          new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
          (state, _match, start, end) => {
            if (!allow() || !state.selection.empty) return null;
            const { $from } = state.selection;
            if (!["paragraph", "heading"].includes(editorKind($from.parent)))
              return null;
            if (
              (state.storedMarks ?? $from.marks()).some(
                (mark) => mark.type.spec.code || isEditorKind(mark, "link"),
              )
            )
              return null;
            let protectedText = false;
            state.doc.nodesBetween(start, end, (node) => {
              if (
                node.isInline &&
                (!node.isText ||
                  node.marks.some(
                    (mark) => mark.type.spec.code || isEditorKind(mark, "link"),
                  ))
              )
                protectedText = true;
            });
            if (protectedText) return null;
            const prefix = $from.parent.textBetween(
              0,
              start - $from.start(),
              "",
              "\ufffc",
            );
            // Do not consume escapes, longer operators, URLs or unfinished code/math.
            if (
              /[\\<>=!+\-.]$/.test(prefix) ||
              /(?:\S+:\/\/|www\.)\S*$/.test(prefix)
            )
              return null;
            if (
              /(?:^|[^\\])(?:\\\\)*`/.test(prefix) ||
              /(?:^|[^\\])(?:\\\\)*\$/.test(prefix)
            )
              return null;
            return state.tr.insertText(symbol, start, end);
          },
          { inCodeMark: false },
        ),
    ),
  });
}
