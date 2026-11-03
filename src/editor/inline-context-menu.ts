import { setUIText, setUIAttribute } from "../shared/i18n";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { Plugin, NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import { createElement, CodeXml, Repeat2, Copy, ExternalLink, Pencil, Link2, Unlink, Trash2, Type, Code, Radical, Check, X, ArrowLeft, ChevronRight, type IconNode } from "lucide";
import { editorKind } from "../document/node-identity";
import { safeReference } from "../document/notion-syntax";
import { vaultAssetUrl } from "../shared/vault-url";
import { openBlockSource } from "./block-source";
import { showEditorPanel } from "./editor-panel";
import { inlineMarkRange, inlineRevision, inlineSource, inlineText, inlineToText, inlineTypeLabel, isSemanticInlineMark, type InlineTarget } from "./inline-context";
import { inlineSourceDetails } from "./inline-reference-source";
import type { ReferencePage } from "../document/internal-reference";
import "./inline-context-menu.css";

interface Options {
  serialize: (doc: PMNode) => string;
  parse: (source: string) => PMNode;
  canCommand: (name: string) => boolean;
  editLink: () => void;
  onError: (error: unknown) => void;
  pages: () => readonly ReferencePage[];
  currentPageId: () => string | undefined;
}

function targetAtDOM(view: EditorView, element: Element): InlineTarget | null {
  let found: InlineTarget | null = null;
  // Node views can render deep DOM trees (KaTeX, previews, contact badges).
  // Compare their owned DOM, rather than inferring identity from presentation.
  view.state.doc.descendants((node, from) => {
    if (found) return false;
    if (!node.isInline || node.isText || editorKind(node) === "hard_break") return;
    const dom = view.nodeDOM(from);
    if (dom === element || dom?.contains(element)) { found = { from, to: from + node.nodeSize, node }; return false; }
  });
  if (found) return found;
  for (let wrapper: Element | null = element; wrapper && wrapper !== view.dom; wrapper = wrapper.parentElement) {
    if (!wrapper.matches("a[href], code, abbr, .pm-critic")) continue;
    const pos = view.posAtDOM(wrapper, 0), resolved = view.state.doc.resolve(pos);
    const node = resolved.nodeAfter || resolved.nodeBefore;
    const mark = node?.marks.find(mark => isSemanticInlineMark(mark) && (
      editorKind(mark) === "link" && wrapper!.matches("a[href]") ||
      editorKind(mark) === "code" && wrapper!.matches("code") ||
      editorKind(mark) === "abbreviation" && wrapper!.matches("abbr") ||
      editorKind(mark) === "critic" && wrapper!.matches(".pm-critic")
    ));
    if (mark) return inlineMarkRange(view.state.doc, pos, mark);
  }
  return null;
}

/** Desktop context actions for semantic inlines. Formatting marks keep their own toolbar. */
export function inlineContextMenu(options: Options) {
  return new Plugin({
    view(view) {
      const lifetime = new AbortController();
      let menu: HTMLDivElement | undefined, menuEvents: AbortController | undefined;
      let original: PMNode | undefined, sourceDialog: HTMLDialogElement | undefined, editDialog: HTMLDialogElement | undefined;
      let pressed: { target: InlineTarget; doc: PMNode; x: number; y: number } | undefined;
      const close = (focus = false) => {
        menuEvents?.abort(); menuEvents = undefined;
        menu?.remove(); menu = undefined; original = undefined;
        if (focus) view.focus();
      };
      const select = (target: InlineTarget) => {
        view.dispatch(view.state.tr.setSelection(target.mark
          ? TextSelection.create(view.state.doc, target.from, target.to)
          : NodeSelection.create(view.state.doc, target.from)));
      };
      const editSource = (target: InlineTarget) => {
        editDialog?.close();
        const baseline = view.state.doc;
        const dialog = editDialog = document.createElement("dialog"); dialog.className = "pm-link-dialog";
        const form = document.createElement("form"), heading = document.createElement("h3"), input = document.createElement("textarea"), output = document.createElement("output");
        setUIText(heading, "Edit inline source");
        setUIAttribute(input, "aria-label", "Inline source"); input.value = inlineSource(baseline, target, options.serialize);
        output.setAttribute("role", "status");
        const save = document.createElement("button"), cancel = document.createElement("button");
        save.type = "submit"; setUIText(save, "Save"); cancel.type = "button"; setUIText(cancel, "Cancel"); cancel.onclick = () => dialog.close();
        form.append(input, output, save, cancel); dialog.append(heading, form);
        form.onsubmit = event => {
          event.preventDefault();
          if (!view.editable || !view.state.doc.eq(baseline)) { setUIText(output, "Content changed. Reopen the inline editor."); return; }
          try {
            const parsed = options.parse(input.value);
            if (parsed.childCount !== 1 || editorKind(parsed.firstChild) !== "paragraph" || !parsed.firstChild!.content.size ||
              parsed.attrs.sourcePrefix?.trim() || parsed.attrs.sourceSuffix?.trim() || parsed.attrs.sourceGaps?.some((gap: string) => gap.trim())) {
              setUIText(output, "Enter inline content only, without blocks or definitions."); return;
            }
            // Unchanged source must not normalize legacy attributes or definitions.
            if (input.value !== inlineSource(baseline, target, options.serialize)) {
              let content = parsed.firstChild!.content;
              if (!target.mark) content = Fragment.from(Array.from({ length: content.childCount }, (_, i) => {
                const child = content.child(i);
                return child.mark(target.node.marks.reduce((marks, mark) => mark.addToSet(marks), child.marks));
              }));
              view.dispatch(closeHistory(view.state.tr).replaceWith(target.from, target.to, content).setMeta("isolateHistory", true));
            }
            dialog.close(); view.focus();
          } catch (error) { output.textContent = error instanceof Error ? error.message : String(error); }
        };
        dialog.onclose = () => { dialog.remove(); if (editDialog === dialog) editDialog = undefined; };
        document.body.append(dialog); showEditorPanel(dialog, heading.textContent, view.dom); input.focus({ preventScroll: true });
      };
      const show = (target: InlineTarget, x: number, y: number) => {
        close();
        const baseline = original = view.state.doc;
        const nodeDOM = view.nodeDOM(target.from);
        const kind = target.mark ? editorKind(target.mark) : editorKind(target.node);
        const label = inlineTypeLabel(target);
        menu = document.createElement("div"); menu.className = "pm-inline-context-menu";
        menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", `${label} actions`);
        menuEvents = new AbortController(); const { signal } = menuEvents;
        const place = () => {
          if (!menu) return;
          menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
          menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
        };
        const heading = () => {
          const title = document.createElement("div"); title.className = "pm-inline-context-heading"; title.textContent = label; menu!.append(title);
        };
        const add = (title: string, icon: IconNode, action: () => void, keep = false) => {
          const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem");
          button.append(createElement(icon, { width: 17, height: 17, "aria-hidden": "true" }), document.createTextNode(title));
          button.onclick = () => {
            if (!view.editable || !view.state.doc.eq(baseline)) { close(true); return; }
            if (!keep) close();
            try { action(); } catch (error) { options.onError(error); view.focus(); }
          };
          menu!.append(button); return button;
        };
        const separator = () => menu!.append(document.createElement("hr"));
        const write = (value: string) => { void navigator.clipboard.writeText(value).catch(options.onError); view.focus(); };
        const apply = (transaction: ReturnType<typeof inlineToText>) => { view.dispatch(transaction.scrollIntoView()); view.focus(); };
        const rootMenu = () => {
          menu!.replaceChildren(); heading();
          add("View source", CodeXml, () => {
            sourceDialog?.close();
            const details = inlineSourceDetails(baseline, target, options.serialize, { pages: options.pages(), currentPageId: options.currentPageId() });
            const dialog = openBlockSource(details.source, () => { if (sourceDialog === dialog) sourceDialog = undefined; if (!view.isDestroyed) view.focus(); }, lifetime.signal, "Inline", details.reference);
            sourceDialog = dialog;
          });
          const turn = add("Turn into", Repeat2, () => {
            menu!.replaceChildren(); heading();
            add("Back", ArrowLeft, () => { rootMenu(); place(); menu?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); }, true);
            separator();
            add("Plain text", Type, () => apply(inlineToText(view.state, target)));
            if (kind !== "code" && inlineText(baseline, target)) add("Inline code", Code, () => apply(inlineToText(view.state, target, true)));
            if (kind !== "inline_math" && inlineText(baseline, target) && options.canCommand("equation")) add("Inline equation", Radical, () => {
              const value = inlineText(baseline, target), marks = target.node.marks.filter(mark => !target.mark?.eq(mark));
              apply(closeHistory(view.state.tr).replaceWith(target.from, target.to, view.state.schema.nodes["inline.inline_math"].create({ value }, null, marks)).setMeta("isolateHistory", true));
            });
            place(); menu?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
          }, true);
          turn.setAttribute("aria-haspopup", "menu"); turn.append(createElement(ChevronRight, { width: 14, height: 14, class: "pm-inline-context-chevron", "aria-hidden": "true" }));
          separator();
          const dom = nodeDOM instanceof HTMLElement ? nodeDOM : null;
          if (dom?.matches(".pm-inline-math, .pm-date-mention, .pm-person-mention")) {
            add(kind === "inline_math" ? "Edit equation" : dom.matches(".pm-person-mention") ? "Open contact" : "Edit date", Pencil, () => dom.click());
          } else if (target.mark && kind === "link") {
            add("Edit link", Pencil, () => { select(target); view.focus(); options.editLink(); });
          } else if (target.mark && ["critic", "abbreviation"].includes(kind) || !target.mark && ["image", "syntax_inline", "html_inline", "mention", "footnote_reference", "citation", "link_mention"].includes(kind)) {
            add("Edit properties", Pencil, () => {
              select(target);
              const event = new MouseEvent("dblclick", { clientX: x, clientY: y });
              if (target.mark) view.someProp("handleDoubleClick", handler => handler(view, target.from, event));
              else view.someProp("handleDoubleClickOn", handler => handler(view, target.from, target.node, target.from, event, true));
            });
          }
          add("Edit source", CodeXml, () => editSource(target));
          const href = safeReference(String(target.mark?.attrs.href || target.node.attrs.url || target.node.attrs.src || dom?.closest("a[href]")?.getAttribute("href") ||
            (dom?.matches("a[href]") ? dom.getAttribute("href") : "") || ""));
          if (href) {
            add("Open link", ExternalLink, () => {
              const anchor = document.createElement("a"); anchor.href = vaultAssetUrl(href); anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.click(); view.focus();
            });
            add("Copy link", Link2, () => write(new URL(vaultAssetUrl(href), location.href).href));
            if (kind === "link" || kind === "page_link") add("Remove link", Unlink, () => apply(inlineToText(view.state, target)));
          }
          if (kind === "footnote_reference") {
            let at: number | undefined;
            baseline.descendants((node, pos) => { if (editorKind(node) === "footnote" && node.attrs.label === target.node.attrs.label) { at = pos + 2; return false; } });
            if (at !== undefined) add("Go to footnote", ExternalLink, () => { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at!)).scrollIntoView()); view.focus(); });
          }
          if (target.mark && kind === "critic" && target.mark.attrs.kind !== "comment") {
            add("Accept revision", Check, () => { const tr = inlineRevision(view.state, target, true); if (tr) apply(tr); });
            add("Reject revision", X, () => { const tr = inlineRevision(view.state, target, false); if (tr) apply(tr); });
          }
          separator();
          add("Copy source", Copy, () => write(inlineSourceDetails(baseline, target, options.serialize).source));
          const remove = add("Delete", Trash2, () => apply(closeHistory(view.state.tr).delete(target.from, target.to).setMeta("isolateHistory", true)));
          remove.classList.add("danger");
        };
        rootMenu(); document.body.append(menu); place(); menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        menu.addEventListener("keydown", event => {
          if (["Escape", "Tab"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); close(true); return; }
          if (!["ArrowUp", "ArrowDown", "Home", "End", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (event.key === "ArrowLeft") { rootMenu(); place(); menu?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); return; }
          if (event.key === "ArrowRight") { (document.activeElement as HTMLElement)?.matches('[aria-haspopup="menu"]') && (document.activeElement as HTMLElement).click(); return; }
          const buttons = [...menu!.querySelectorAll<HTMLButtonElement>("button")], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus({ preventScroll: true });
        }, { signal });
        document.addEventListener("pointerdown", event => { if (!menu?.contains(event.target as Node)) close(); }, { signal, capture: true });
        document.addEventListener("scroll", event => {
          // Updating the hidden source editor can scroll its own CodeMirror
          // viewport. Only scrolling an ancestor of this editor moves the menu's target.
          const scroller = event.target;
          if (scroller === document || scroller instanceof Node && scroller.contains(view.dom)) close();
        }, { signal, capture: true });
        window.addEventListener("resize", () => close(), { signal });
        window.addEventListener("blur", () => close(), { signal });
      };
      const context = (event: MouseEvent) => {
        close();
        if (!view.editable || view.composing || !(event.target instanceof Element) || event.target.closest("button, input, textarea")) return;
        // Finish pending browser edits before capturing positions and the baseline.
        (view as unknown as { domObserver: { flush(): void } }).domObserver.flush();
        const down = pressed; pressed = undefined;
        const target = targetAtDOM(view, event.target) || (down && down.doc.eq(view.state.doc) &&
          Math.abs(down.x - event.clientX) < 3 && Math.abs(down.y - event.clientY) < 3 ? down.target : null);
        if (!target) return;
        event.preventDefault(); event.stopPropagation(); show(target, event.clientX, event.clientY);
      };
      view.dom.addEventListener("pointerdown", event => {
        pressed = undefined;
        if (event.button !== 2 || view.composing || !view.editable || !(event.target instanceof Element) || event.target.closest("button, input, textarea")) return;
        (view as unknown as { domObserver: { flush(): void } }).domObserver.flush();
        const target = targetAtDOM(view, event.target);
        // Focusing a KaTeX node may redraw its DOM before contextmenu is fired.
        // Retain the pressed object only while its exact document and coordinates survive.
        if (target) pressed = { target, doc: view.state.doc, x: event.clientX, y: event.clientY };
      }, { signal: lifetime.signal, capture: true });
      view.dom.addEventListener("pointercancel", () => { pressed = undefined; }, { signal: lifetime.signal });
      view.dom.addEventListener("contextmenu", context, { signal: lifetime.signal, capture: true });
      view.dom.addEventListener("keydown", event => {
        if (!(event.shiftKey && event.key === "F10" || event.key === "ContextMenu") || !view.editable || view.composing) return;
        const { selection } = view.state;
        let target: InlineTarget | null = selection instanceof NodeSelection && selection.node.isInline
          ? { from: selection.from, to: selection.to, node: selection.node } : null;
        if (!target) {
          const mark = (selection.$from.nodeAfter || selection.$from.nodeBefore)?.marks.find(isSemanticInlineMark);
          if (mark) target = inlineMarkRange(view.state.doc, selection.from, mark);
        }
        if (!target) return;
        event.preventDefault(); event.stopPropagation();
        const rect = view.coordsAtPos(target.from); show(target, rect.left, rect.bottom);
      }, { signal: lifetime.signal });
      return {
        update() { if (original && view.state.doc !== original) close(); },
        destroy() { close(); lifetime.abort(); editDialog?.remove(); sourceDialog?.remove(); },
      };
    },
  });
}
