import { Plugin, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { closeHistory } from "prosemirror-history";
import { isEditorKind } from "../document/node-identity";
import { replaceTypingBlock } from "./editor-input-rules";
import { commentDialog } from "./comment-dialog";

/** Leave the trigger intact until submit, so dismissal never loses typed text. */
export function commentInput(allow: () => boolean, parse: (source: string) => PMNode) {
  let dialog: HTMLDialogElement | undefined;
  return new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          const input = event as InputEvent;
          const { state } = view, { selection } = state;
          if (input.inputType !== "insertText" || !input.data || input.isComposing || view.composing ||
              !selection.empty) return false;
          const previous = selection.$from.nodeBefore;
          if (previous?.type !== state.schema.nodes["inline.inline_comment"] &&
              !previous?.marks.some(mark => mark.type === state.schema.marks.critic && mark.attrs.kind === "comment")) return false;
          // Intercept before Chrome relocates native text insertion to the
          // visible text before a hidden atom. Keep other input plugins active.
          event.preventDefault();
          const insert = () => state.tr.insertText(input.data!, selection.from, selection.to);
          if (!view.someProp("handleTextInput", handler => handler(view, selection.from, selection.to, input.data!, insert)))
            view.dispatch(insert());
          return true;
        },
      },
      handleTextInput(view, from, to, text) {
        const { state } = view, $from = state.doc.resolve(from);
        if (!allow() || view.composing || from !== to || !$from.parent.isTextblock ||
            $from.parent.type.spec.code || $from.marks().some(mark => mark.type.spec.code || mark.type.name === "link")) return false;
        const before = $from.parent.textBetween(0, $from.parentOffset, "", "\ufffc") + text;
        if (!/(?<![\\%])%%$/.test(before)) return false;
        view.dispatch(state.tr.insertText(text, from, to));
        const original = view.state.doc, end = from + text.length, start = end - 2;
        const block = isEditorKind($from.parent, "paragraph") && before === "%%" && from === $from.end();
        dialog?.close();
        dialog = commentDialog({ inline: true, canSwitchToBlock: block, owner: view.dom,
          submit(value, inline) {
            if (view.isDestroyed || view.state.doc !== original || !allow()) throw new Error("The page changed. Reopen the comment input.");
            const current = view.state;
            let tr;
            if (inline) {
              const parsed = parse(`%%${value}%%`).firstChild;
              const node = parsed?.firstChild?.mark(original.resolve(start).marks());
              if (!node || node.type !== current.schema.nodes["inline.inline_comment"])
                throw new Error("This comment is not supported by the current dialect.");
              tr = current.tr.replaceWith(start, end, node);
              tr.setSelection(TextSelection.create(tr.doc, start + node.nodeSize));
            } else {
              const node = parse(`%%\n${value}\n%%`).firstChild;
              if (!node || node.type !== current.schema.nodes["block.block_comment"])
                throw new Error("This comment is not supported by the current dialect.");
              const anchored = current.apply(current.tr.setSelection(TextSelection.create(current.doc, end)));
              tr = replaceTypingBlock(anchored, start, end, [
                node,
                current.schema.nodes["block.paragraph"].create(),
              ], 2);
              if (!tr) throw new Error("A block comment cannot be inserted at this position.");
            }
            view.dispatch(closeHistory(tr).scrollIntoView());
            // Synchronize the DOM selection while the new document is current;
            // waiting for the dialog's asynchronous close event can let the
            // browser restore a caret before an invisible inline atom.
            view.focus();
          },
          close() { if (!view.isDestroyed) view.focus(); },
        });
        return true;
      },
    },
    view() { return {
      update(view) {
        const { selection, storedMarks } = view.state, previous = selection.$from.nodeBefore;
        if (!view.hasFocus() || view.composing || !selection.empty ||
            !previous?.marks.some(mark => mark.type === view.state.schema.marks.critic && mark.attrs.kind === "comment") ||
            (storedMarks ?? selection.$from.marks()).some(mark => mark.type === view.state.schema.marks.critic && mark.attrs.kind === "comment")) return;
        const dom = view.nodeDOM(selection.from - previous.nodeSize);
        const hidden = (dom instanceof Element ? dom : dom?.parentElement)?.closest(".pm-comment");
        if (!hidden?.parentNode) return;
        const index = Array.prototype.indexOf.call(hidden.parentNode.childNodes, hidden) + 1;
        if (view.posAtDOM(hidden.parentNode, index) !== selection.from) return;
        // A mark contains a hidden text node, unlike the empty %% atom. Put the
        // native caret outside that element so Chrome can receive new input.
        const range = view.dom.ownerDocument.createRange();
        range.setStartAfter(hidden); range.collapse(true);
        const native = view.dom.ownerDocument.getSelection();
        native?.removeAllRanges(); native?.addRange(range);
      },
      destroy() { dialog?.close(); dialog?.remove(); },
    }; },
  });
}
