import { createEditorNode, isEditorKind } from "../../document/node-identity";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { linkTarget } from "./link-preview";
import { bookmarkUrl } from "../bookmarks/bookmark";

type Pending = { from: number; to: number; url: string } | null;
const key = new PluginKey<Pending>("link-paste");
export function linkPaste(canUse: () => boolean, canBookmark: () => boolean = () => false) {
  return new Plugin<Pending>({
    key,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(key);
        if (meta !== undefined) return meta;
        if (!value) return null;
        if (tr.selectionSet) return null;
        const from = tr.mapping.mapResult(value.from, 1),
          to = tr.mapping.mapResult(value.to, -1);
        return from.deleted ||
          to.deleted ||
          tr.doc.textBetween(from.pos, to.pos) !== value.url
          ? null
          : { ...value, from: from.pos, to: to.pos };
      },
    },
    props: {
      handlePaste(view, event) {
        const url = event.clipboardData?.getData("text/plain").trim();
        if (
          !view.editable ||
          !url ||
          !((canUse() && linkTarget(url)) || (canBookmark() && bookmarkUrl(url))) ||
          view.state.selection.$from.parent.type.spec.code
        )
          return false;
        const tr = closeHistory(view.state.tr).replaceSelectionWith(
          view.state.schema.text(url, [
            view.state.schema.marks.link.create({ href: url }),
          ]),
          false,
        );
        const to = tr.selection.from;
        tr.setMeta(key, { from: to - url.length, to, url });
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
    view(view) {
      const menu = document.createElement("div");
      menu.className = "pm-link-paste-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Paste link as");
      menu.hidden = true;
      document.body.append(menu);
      const dismiss = () => {
        if (key.getState(view.state))
          view.dispatch(view.state.tr.setMeta(key, null));
      };
      const buttons: HTMLButtonElement[] = [];
      for (const [mode, label, hint] of [
        ["link", "Link", "Keep the URL"],
        ["mention", "Mention", "Inline reference"],
        ["preview", "Preview", "Live preview card"],
        ["bookmark", "Bookmark", "Create a visual bookmark"],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.mode = mode;
        b.setAttribute("role", "menuitem");
        b.setAttribute("aria-label", label);
        const title = document.createElement("strong"),
          detail = document.createElement("span");
        title.textContent = label;
        detail.textContent = hint;
        b.append(title, detail);
        b.onclick = () => {
          const p = key.getState(view.state);
          if (!p) return;
          const tr = closeHistory(view.state.tr).setMeta(key, null);
          if (mode !== "link") {
            tr.setSelection(TextSelection.create(tr.doc, p.from, p.to));
            tr.replaceSelectionWith(
              createEditorNode(view.state.schema, mode === "mention" ? "link_mention" : mode === "bookmark" ? "web_bookmark" : "link_preview", { url: p.url }),
              false,
            );
          }
          view.dispatch(tr.scrollIntoView());
          if (mode === "bookmark") {
            // Only this user action fetches metadata; loading an existing page never does.
            let position: number | undefined;
            tr.doc.descendants((node, pos) => {
              if (isEditorKind(node, "web_bookmark") && node.attrs.url === p.url && pos >= p.from - 1 && pos <= tr.selection.to) position = pos;
            });
            if (position !== undefined) view.nodeDOM(position)?.dispatchEvent(new Event("notdown-create-bookmark"));
          }
          view.focus();
        };
        menu.append(b);
        buttons.push(b);
      }
      menu.onkeydown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          dismiss();
          view.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          const visible = buttons.filter(button => !button.hidden);
          const at = visible.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          visible[
            (at +
              (e.key === "ArrowDown" ? 1 : visible.length - 1) +
              visible.length) %
              visible.length
          ].focus();
        }
      };
      const outside = (e: PointerEvent) => {
        if (!menu.contains(e.target as Node)) dismiss();
      };
      const keyboard = (e: KeyboardEvent) => {
        if (!key.getState(view.state)) return;
        if (e.key === "Escape") dismiss();
        else if (e.key === "ArrowDown" && view.hasFocus()) {
          e.preventDefault();
          buttons[0].focus();
        }
      };
      document.addEventListener("pointerdown", outside);
      view.dom.addEventListener("keydown", keyboard, true);
      return {
        update() {
          const p = key.getState(view.state);
          menu.hidden = !p;
          if (p) {
            for (const button of buttons) button.hidden = button.dataset.mode === "bookmark" ? !canBookmark() : ["mention", "preview"].includes(button.dataset.mode!) ? !(canUse() && linkTarget(p.url)) : false;
            const coords = view.coordsAtPos(p.to);
            menu.style.left =
              Math.max(8, Math.min(coords.left, window.innerWidth - 258)) +
              "px";
            menu.style.top =
              Math.max(
                8,
                Math.min(coords.bottom + 6, window.innerHeight - menu.offsetHeight - 8),
              ) + "px";
          }
        },
        destroy() {
          menu.remove();
          document.removeEventListener("pointerdown", outside);
          view.dom.removeEventListener("keydown", keyboard, true);
        },
      };
    },
  });
}
