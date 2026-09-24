import { escape as e } from "../../shared/types";

export type DiffLine = {
  kind: "context" | "removed" | "added";
  text: string;
  oldLine?: number;
  newLine?: number;
};

// Keep line endings in the comparison: even a final newline is a real edit.
const lines = (source: string) => source.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function compare(a: string[], b: string[]): Pick<DiffLine, "kind" | "text">[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - suffix - 1] === b[b.length - suffix - 1]
  )
    suffix++;
  const left = a.slice(prefix, a.length - suffix);
  const right = b.slice(prefix, b.length - suffix);
  const context = (text: string) => ({ kind: "context" as const, text });
  const wrap = (middle: Pick<DiffLine, "kind" | "text">[]) => [
    ...a.slice(0, prefix).map(context),
    ...middle,
    ...a.slice(a.length - suffix).map(context),
  ];
  // Myers shortest edit path. Bound work for very large, unrelated documents;
  // the fallback still shows every changed byte without altering either source.
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[1, 0]]);
  let work = 0;
  for (
    let distance = 0;
    distance <= left.length + right.length && distance <= 512;
    distance++
  ) {
    trace.push(new Map(frontier));
    for (let k = -distance; k <= distance; k += 2) {
      let x =
        k === -distance ||
        (k !== distance &&
          (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1))
          ? (frontier.get(k + 1) ?? 0)
          : (frontier.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x++;
        y++;
        work++;
      }
      frontier.set(k, x);
      if (x >= left.length && y >= right.length) {
        const result: Pick<DiffLine, "kind" | "text">[] = [];
        for (let d = distance; d >= 0; d--) {
          const previous = trace[d];
          const diagonal = x - y;
          const previousK =
            diagonal === -d ||
            (diagonal !== d &&
              (previous.get(diagonal - 1) ?? -1) <
                (previous.get(diagonal + 1) ?? -1))
              ? diagonal + 1
              : diagonal - 1;
          const previousX = previous.get(previousK) ?? 0;
          const previousY = previousX - previousK;
          while (x > previousX && y > previousY) {
            result.push(context(left[--x]));
            y--;
          }
          if (d > 0)
            result.push(
              x === previousX
                ? { kind: "added", text: right[--y] }
                : { kind: "removed", text: left[--x] },
            );
        }
        return wrap(result.reverse());
      }
      if (++work > 1_000_000) break;
    }
    if (work > 1_000_000) break;
  }
  return wrap([
    ...left.map((text) => ({ kind: "removed" as const, text })),
    ...right.map((text) => ({ kind: "added" as const, text })),
  ]);
}

export function diffLines(before: string, after: string): DiffLine[] {
  let oldLine = 0,
    newLine = 0;
  return compare(lines(before), lines(after)).map((line) => ({
    ...line,
    oldLine: line.kind === "added" ? undefined : ++oldLine,
    newLine: line.kind === "removed" ? undefined : ++newLine,
  }));
}

export function diffHTML(before: string, after: string): string {
  const rows = diffLines(before, after);
  const removed = rows.filter((row) => row.kind === "removed").length;
  const added = rows.filter((row) => row.kind === "added").length;
  if (!removed && !added)
    return '<p class="diff-empty">No body changes. Title and properties may still differ.</p>';
  const renderRow = (row: DiffLine) => {
    const text = row.text.replace(/\r?\n$/, "");
    return `<div class="diff-line diff-${row.kind}"><span class="diff-number" aria-label="Old line">${row.oldLine ?? ""}</span><span class="diff-number" aria-label="New line">${row.newLine ?? ""}</span><span class="diff-sign" aria-hidden="true">${row.kind === "removed" ? "−" : row.kind === "added" ? "+" : " "}</span><code>${e(text) || " "}${!row.text.endsWith("\n") ? '<span class="diff-eof"> ⏎ No newline at end of file</span>' : ""}</code></div>`;
  };
  const visible = new Set<number>();
  rows.forEach((row, index) => {
    if (row.kind !== "context")
      for (
        let i = Math.max(0, index - 2);
        i <= Math.min(rows.length - 1, index + 2);
        i++
      )
        visible.add(i);
  });
  let body = "";
  for (let index = 0; index < rows.length;) {
    if (visible.has(index)) {
      body += renderRow(rows[index++]);
      continue;
    }
    const start = index;
    while (index < rows.length && !visible.has(index)) index++;
    body += `<details class="diff-fold"><summary>Show ${index - start} unchanged lines</summary>${rows.slice(start, index).map(renderRow).join("")}</details>`;
  }
  return `<div class="diff-stats"><span class="diff-count-removed">−${removed} removed</span><span class="diff-count-added">+${added} added</span></div><div class="diff-lines">${body}</div>`;
}

export function mountConflictDiff(
  dialog: HTMLDialogElement,
  diskBody: string,
  proposedBody: string,
) {
  dialog.classList.add("conflict-dialog");
  dialog.querySelector<HTMLElement>("[data-conflict-diff]")!.innerHTML =
    diffHTML(diskBody, proposedBody);
  const input = dialog.querySelector<HTMLTextAreaElement>("#merged-body")!;
  const preview = dialog.querySelector<HTMLElement>("[data-merged-diff]")!;
  const update = () => {
    preview.innerHTML = diffHTML(diskBody, input.value);
  };
  input.addEventListener("input", update);
  update();
}
