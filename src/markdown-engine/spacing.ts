import type { Node } from "prosemirror-model";
import { editorSchema as schema } from "../document/editor-schema.js";
import { editorFingerprint } from "../document/editor-markdown.js";

/** Project uncovered blank source lines as editable paragraphs, each owning its bytes. */
export function editableBlankParagraphs(doc: Node): Node {
  const source: string = doc.attrs.source;
  const gaps: string[] = [...doc.attrs.sourceGaps];
  const nodes: Node[] = [];
  let end = 0;
  const blanks = (finish: number, trailing = false) => {
    const gap = source.slice(end, finish);
    if (!/^[ \t\r\n]*$/.test(gap)) return;
    const breaks = [...gap.matchAll(/\r\n|\r|\n/g)];
    const hasPrevious = nodes.length > 0;
    const count = Math.max(
      0,
      Math.floor(breaks.length / 2) - (hasPrevious && !trailing ? 1 : 0),
    );
    const base = end;
    for (let i = 0; i < count; i++) {
      const preceding = hasPrevious
        ? breaks[2 * i + 1]
        : i
          ? breaks[2 * i - 1]
          : undefined;
      const start = preceding
        ? base + preceding.index! + preceding[0].length
        : base;
      const nextBreak = breaks[hasPrevious ? 2 * i + 2 : 2 * i];
      const stop = nextBreak ? base + nextBreak.index! : finish;
      const paragraph = schema.nodes.paragraph.create();
      const key = gaps.length;
      gaps.push(source.slice(end, start));
      nodes.push(
        paragraph.type.create({
          source: source.slice(start, stop),
          sourceStart: start,
          sourceEnd: stop,
          sourceKey: key,
          sourceFingerprint: editorFingerprint(paragraph),
        }),
      );
      end = stop;
    }
  };
  doc.forEach((node) => {
    if (typeof node.attrs.sourceStart !== "number") {
      nodes.push(node);
      return;
    }
    blanks(node.attrs.sourceStart);
    gaps[node.attrs.sourceKey] = source.slice(end, node.attrs.sourceStart);
    nodes.push(node);
    end = node.attrs.sourceEnd;
  });
  blanks(source.length, true);
  const next = doc.type.create(
    {
      ...doc.attrs,
      sourceGaps: gaps,
      sourceSuffix: source.slice(end),
      sourceEditableBlanks: true,
    },
    nodes,
  );
  return next.type.create(
    { ...next.attrs, sourceFingerprint: editorFingerprint(next) },
    next.content,
  );
}
