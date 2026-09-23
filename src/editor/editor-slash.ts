import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { inTableCell } from "./editor-table.js";

export interface SlashState {
  /** Document position immediately before the trigger, including nested blocks. */
  from: number;
  /** Document position at the collapsed caret. */
  to: number;
  query: string;
}

interface TriggerAnchor {
  from: number;
  trigger: string;
}
interface SlashPluginState {
  active: SlashState | null;
  suppressed: TriggerAnchor | null;
  composing: boolean;
  virtual: number | null;
}
type SlashMeta =
  | { type: "cancel" | "consume" }
  | { type: "composition"; active: boolean }
  | { type: "open"; from: number };

export const slashPluginKey = new PluginKey<SlashPluginState>("notdown-slash");

function candidate(state: EditorState): SlashState | null {
  if (inTableCell(state)) return null;
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;

  // Read the current textblock, not the entire document or DOM selection. The
  // replacement character preserves the position of inline atoms and prevents
  // a command from accidentally consuming an embedded page or image.
  const before = parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
  const match = /(?:^|\s)([/、])([^\s/、\ufffc]*)$/u.exec(before);
  if (!match) return null;
  const localFrom = $from.parentOffset - match[2].length - 1;
  let code = $from.marks().some((mark) => mark.type.spec.code);
  parent.nodesBetween(localFrom, $from.parentOffset, (node) => {
    if (node.marks.some((mark) => mark.type.spec.code)) code = true;
  });
  if (code) return null;
  return {
    from: $from.start() + localFrom,
    to: selection.from,
    query: match[2],
  };
}

function anchor(
  match: SlashState | null,
  doc: ProseMirrorNode,
): TriggerAnchor | null {
  if (!match) return null;
  return {
    from: match.from,
    trigger: doc.textBetween(match.from, match.from + 1),
  };
}

function mapAnchor(
  value: TriggerAnchor | null,
  tr: Transaction,
): TriggerAnchor | null {
  if (!value) return null;
  const mapped = tr.mapping.mapResult(value.from, 1);
  if (mapped.deleted || mapped.pos < 0 || mapped.pos >= tr.doc.content.size)
    return null;
  if (tr.doc.textBetween(mapped.pos, mapped.pos + 1) !== value.trigger)
    return null;
  return { ...value, from: mapped.pos };
}

function equal(left: SlashState | null, right: SlashState | null): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      left.from === right.from &&
      left.to === right.to &&
      left.query === right.query)
  );
}

/** No UI actions or DOM reads occur while a transaction is being applied. */
export function createSlashPlugin(
  onChange: (state: SlashState | null) => void,
): Plugin<SlashPluginState> {
  let compositionEnd: ReturnType<typeof setTimeout> | undefined;
  return new Plugin<SlashPluginState>({
    key: slashPluginKey,
    state: {
      init: () => ({
        active: null,
        suppressed: null,
        composing: false,
        virtual: null,
      }),
      apply(tr, value, oldState, nextState) {
        const meta = tr.getMeta(slashPluginKey) as SlashMeta | undefined;
        const composing =
          meta?.type === "composition" ? meta.active : value.composing;
        let virtual = meta?.type === "open" ? meta.from : value.virtual;
        if (virtual !== null && meta?.type !== "open") {
          const mapped = tr.mapping.mapResult(virtual, -1);
          virtual = mapped.deleted ? null : mapped.pos;
        }
        if (meta?.type === "cancel" || meta?.type === "consume") virtual = null;
        if (virtual !== null) {
          const { selection } = nextState;
          const { $from } = selection;
          if (
            selection instanceof TextSelection &&
            selection.empty &&
            $from.start() === virtual &&
            !$from.parent.type.spec.code &&
            !inTableCell(nextState)
          ) {
            const query = nextState.doc.textBetween(
              virtual,
              selection.from,
              "\n",
              "\ufffc",
            );
            if (!/[\s\ufffc]/u.test(query))
              return {
                active: { from: virtual, to: selection.from, query },
                suppressed: null,
                composing,
                virtual,
              };
          }
          virtual = null;
        }
        const previous = mapAnchor(anchor(value.active, oldState.doc), tr);
        let suppressed = mapAnchor(value.suppressed, tr);
        const next = candidate(nextState);

        if (meta?.type === "cancel" || meta?.type === "consume") {
          return {
            active: null,
            suppressed: anchor(next, nextState.doc) ?? previous ?? suppressed,
            composing,
            virtual,
          };
        }
        // Leaving an active query closes it. Remember its trigger so restoring
        // the selection or continuing the cancelled word never reopens it.
        // IME can temporarily remove/reinsert its text, so it does not cancel.
        if (!next && previous && !composing) suppressed = previous;
        const active = next && next.from !== suppressed?.from ? next : null;
        return { active, suppressed, composing, virtual };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (
          event.key !== "Escape" ||
          event.isComposing ||
          view.composing ||
          slashPluginKey.getState(view.state)?.composing
        )
          return false;
        if (!getSlashState(view.state)) return false;
        cancelSlash(view);
        return true;
      },
      handleDOMEvents: {
        compositionstart(view) {
          clearTimeout(compositionEnd);
          view.dispatch(
            view.state.tr.setMeta(slashPluginKey, {
              type: "composition",
              active: true,
            } satisfies SlashMeta),
          );
          return false;
        },
        compositionend(view) {
          clearTimeout(compositionEnd);
          // ProseMirror flushes its final composition transaction after the
          // native event. The next task reads that committed state; it never
          // examines browser text nodes or races their selection microtasks.
          compositionEnd = setTimeout(() => {
            if (!view.isDestroyed)
              view.dispatch(
                view.state.tr.setMeta(slashPluginKey, {
                  type: "composition",
                  active: false,
                } satisfies SlashMeta),
              );
          }, 0);
          return false;
        },
      },
    },
    view(view) {
      let delivered = getSlashState(view.state);
      if (delivered) onChange(delivered);
      return {
        update(nextView) {
          // Keep an existing menu stable during IME; do not select, consume,
          // or open a new command from an unfinished composition.
          if (slashPluginKey.getState(nextView.state)?.composing) return;
          const next = getSlashState(nextView.state);
          if (equal(delivered, next)) return;
          delivered = next;
          onChange(next);
        },
        destroy() {
          clearTimeout(compositionEnd);
        },
      };
    },
  });
}

export function getSlashState(state: EditorState): SlashState | null {
  const value = slashPluginKey.getState(state);
  return value && !value.composing ? value.active : null;
}

type DispatchView = Pick<EditorView, "state" | "dispatch">;

/** Remove only the active slash and query; surrounding Markdown text survives. */
export function consumeSlash(view: DispatchView): boolean {
  const match = getSlashState(view.state);
  if (!match) return false;
  view.dispatch(
    view.state.tr
      .delete(match.from, match.to)
      .setMeta(slashPluginKey, { type: "consume" } satisfies SlashMeta),
  );
  return true;
}

/** Dismiss the command without deleting its literal text. */
export function cancelSlash(view: DispatchView): void {
  if (!slashPluginKey.getState(view.state)) return;
  view.dispatch(
    view.state.tr
      .setMeta(slashPluginKey, { type: "cancel" } satisfies SlashMeta)
      .setMeta("addToHistory", false),
  );
}
