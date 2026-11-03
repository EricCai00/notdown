import { setUIAttribute, setUIText } from "../shared/i18n";
import { editorKind, isEditorKind } from "../document/node-identity";
import { Plugin, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { toggleMark } from "prosemirror-commands";
import { closeHistory } from "prosemirror-history";
import {
  createElement,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Radical,
  RemoveFormatting,
  ChevronRight,
  Check,
  type IconNode,
} from "lucide";
import { colorStyle, inlineColors } from "../document/notion-syntax";
import { inTableCell } from "./editor-table";
import "./selection-menu.css";

export type SelectionBlockType =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "list"
  | "number"
  | "task"
  | "quote"
  | "code";
interface Options {
  canCommand: (name: string) => boolean;
  canCombineColors: () => boolean;
  convert: (type: SelectionBlockType) => void;
  link: () => void;
}
const blockTypes: [SelectionBlockType, string, string][] = [
  ["text", "Normal text", "T"],
  ["heading1", "Heading 1", "H₁"],
  ["heading2", "Heading 2", "H₂"],
  ["heading3", "Heading 3", "H₃"],
  ["heading4", "Heading 4", "H₄"],
  ["list", "Bulleted list", "•"],
  ["number", "Numbered list", "1."],
  ["task", "To-do list", "☑"],
  ["quote", "Quote", "❝"],
  ["code", "Code", "</>"],
];
const colors = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

function currentBlock(state: EditorState): SelectionBlockType {
  const { $from } = state.selection;
  if (isEditorKind($from.parent, "heading"))
    return `heading${$from.parent.attrs.level}` as SelectionBlockType;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = editorKind($from.node(depth));
    if (name === "task_list_item") return "task";
    if (name === "numbered_list_item") return "number";
    if (name === "bullet_list_item") return "list";
    if (name === "blockquote") return "quote";
  }
  return "text";
}

/** Controls act on the live PM selection, never a detached DOM range or draft. */
export function selectionMenu(options: Options) {
  let focusMenu: (() => boolean) | undefined;
  return new Plugin({
    props: {
      handleKeyDown(_view, event) {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "m"
        )
          return focusMenu?.() || false;
        return false;
      },
    },
    view(view) {
      const menu = document.createElement("div");
      menu.className = "pm-selection-menu";
      menu.setAttribute("role", "toolbar");
      setUIAttribute(menu, "aria-label", "Text formatting");
      menu.hidden = true;
      document.body.append(menu);
      const abort = new AbortController(),
        { signal } = abort;
      let panel: "colors" | "blocks" | null = null;
      let dismissed = false,
        dragging = false,
        frame = 0,
        disposed = false;
      let recent: string[] = [];
      let renderedState: EditorState | undefined;
      let renderedPanel: "colors" | "blocks" | null | undefined;

      const eligible = () => {
        const { selection, doc } = view.state;
        if (
          !view.editable ||
          view.composing ||
          dragging ||
          dismissed ||
          !(selection instanceof TextSelection) ||
          selection.empty
        )
          return false;
        let code = false;
        doc.nodesBetween(selection.from, selection.to, (node) => {
          if (node.type.spec.code) code = true;
        });
        return !code && !!doc.textBetween(selection.from, selection.to).trim();
      };
      const hide = () => {
        menu.hidden = true;
        panel = null;
      };
      const schedule = () => {
        if (!frame && !disposed)
          frame = requestAnimationFrame(() => {
            frame = 0;
            refresh();
          });
      };
      const icon = (node: IconNode) =>
        createElement(node, { width: 18, height: 18, "aria-hidden": "true" });
      const button = (
        label: string,
        action: () => void,
        glyph?: IconNode | string,
      ) => {
        const el = document.createElement("button");
        el.type = "button";
        setUIAttribute(el, "title", label);
        setUIAttribute(el, "aria-label", label);
        if (typeof glyph === "string") el.textContent = glyph;
        else if (glyph) el.append(icon(glyph));
        else setUIText(el, label);
        el.onclick = () => {
          if (eligible()) action();
        };
        return el;
      };
      const finish = () => {
        panel = null;
        view.focus();
        schedule();
      };
      const activeMark = (name: string, value?: string) => {
        let found = false,
          all = true;
        const { from, to } = view.state.selection;
        view.state.doc.nodesBetween(from, to, (node) => {
          if (!node.isText) return;
          found = true;
          if (
            !node.marks.some(
              (mark) =>
                editorKind(mark) === name &&
                (value === undefined || (name === "color" && options.canCombineColors()
                  ? value.endsWith("_bg") ? inlineColors(mark.attrs).bg_color === value.slice(0, -3) : inlineColors(mark.attrs).color === value
                  : mark.attrs.color === value)),
            )
          )
            all = false;
        });
        return found && all;
      };
      const togglePanel = (next: "colors" | "blocks") => {
        panel = panel === next ? null : next;
        render();
        position();
        menu.querySelector<HTMLElement>(".pm-selection-panel button")?.focus();
      };
      const colorTransaction = (value: string, tr = view.state.tr) => {
        const { state } = view,
          { from, to } = state.selection;
        // Keep unknown span attributes when changing the supported color attribute.
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isText) return;
          const old = node.marks.find(
            (mark) => mark.type === state.schema.marks.color,
          );
          const attrs = { ...old?.attrs.nfmAttrs };
          delete attrs.color;
          delete attrs.bg_color;
          // Underline already has its own mark; stale source attributes must not restore it.
          delete attrs.underline;
          const dual = options.canCombineColors();
          const next = dual && value ? inlineColors(old?.attrs || {}) : { color: "", bg_color: "" };
          if (dual && value.endsWith("_bg")) next.bg_color = value === "default_bg" ? "" : value.slice(0, -3);
          else next.color = value === "default" || value === "default_bg" ? "" : value;
          const start = Math.max(from, pos),
            end = Math.min(to, pos + node.nodeSize);
          tr = tr.removeMark(start, end, state.schema.marks.color);
          if (next.color || next.bg_color || Object.keys(attrs).length)
            tr.addMark(
              start,
              end,
              state.schema.marks.color.create({
                ...next,
                nfmAttrs: attrs,
              }),
            );
        });
        return tr;
      };
      const applyColor = (value: string) => {
        if (!options.canCommand("color")) return;
        view.dispatch(closeHistory(colorTransaction(value)));
        if (value && value !== "default" && value !== "default_bg")
          recent = [value, ...recent.filter((c) => c !== value)].slice(0, 5);
        finish();
      };
      function render() {
        renderedState = view.state;
        renderedPanel = panel;
        menu.replaceChildren();
        const { state } = view,
          { from, to, $from, $to } = state.selection;
        if (!inTableCell(state) && $from.sameParent($to)) {
          const current = currentBlock(state);
          const choose = button("Turn into", () => togglePanel("blocks"));
          choose.className = "pm-selection-block";
          const symbol = document.createElement("span");
          symbol.textContent =
            blockTypes.find(([type]) => type === current)?.[2] || "T";
          const label = document.createElement("span");
          label.textContent =
            blockTypes.find(([type]) => type === current)?.[1] || "Text";
          choose.replaceChildren(symbol, label, icon(ChevronRight));
          choose.setAttribute("aria-expanded", String(panel === "blocks"));
          menu.append(choose);
        }
        const row = document.createElement("div");
        row.className = "pm-selection-actions";
        if (options.canCommand("color")) {
          const color = button(
            "Text and background color",
            () => togglePanel("colors"),
            "A",
          );
          color.className = "pm-selection-color";
          color.setAttribute("aria-expanded", String(panel === "colors"));
          row.append(color);
        }
        for (const [name, label, glyph, command] of [
          ["strong", "Bold", Bold, "bold"],
          ["em", "Italic", Italic, "italic"],
          ["underline", "Underline", Underline, "underline"],
          ["strike", "Strikethrough", Strikethrough, "strike"],
          ["code", "Inline code", Code, "inline_code"],
        ] as [string, string, IconNode, string][]) {
          const mark = state.schema.marks[name];
          if (!options.canCommand(command) || !toggleMark(mark)(state))
            continue;
          const control = button(
            label,
            () => {
              toggleMark(mark)(
                view.state,
                (tr) => {
                  // Keep the original color while removing a duplicate underline attribute.
                  if (name === "underline") {
                    view.state.doc.nodesBetween(
                      view.state.selection.from,
                      view.state.selection.to,
                      (node, pos) => {
                        const color = node.marks.find(
                          (m) =>
                            isEditorKind(m, "color") &&
                            m.attrs.nfmAttrs.underline,
                        );
                        if (!node.isText || !color) return;
                        const attrs = { ...color.attrs.nfmAttrs };
                        delete attrs.underline;
                        const a = Math.max(pos, view.state.selection.from),
                          b = Math.min(
                            pos + node.nodeSize,
                            view.state.selection.to,
                          );
                        tr.removeMark(a, b, color.type).addMark(
                          a,
                          b,
                          color.type.create({
                            ...color.attrs,
                            nfmAttrs: attrs,
                          }),
                        );
                      },
                    );
                  }
                  view.dispatch(closeHistory(tr));
                },
                view,
              );
              finish();
            },
            glyph,
          );
          control.dataset.mark = name;
          control.setAttribute("aria-pressed", String(activeMark(name)));
          row.append(control);
        }
        const clear = button(
          "Clear formatting",
          () => {
            // Do not erase semantic marks such as links, citations, or unknown attributes.
            const { state } = view,
              { from, to } = state.selection;
            let tr = state.tr;
            for (const name of [
              "strong",
              "em",
              "underline",
              "strike",
              "code",
              "highlight",
              "subscript",
              "superscript",
            ])
              tr = tr.removeMark(from, to, state.schema.marks[name]);
            state.doc.nodesBetween(from, to, node => {
              for (const mark of node.marks)
                if (mark.type === state.schema.marks.critic && mark.attrs.kind === "highlight")
                  tr = tr.removeMark(from, to, mark);
            });
            if (options.canCommand("color")) tr = colorTransaction("", tr);
            view.dispatch(closeHistory(tr));
            finish();
          },
          RemoveFormatting,
        );
        row.insertBefore(
          clear,
          row.querySelector('[data-mark="strike"], [data-mark="code"]'),
        );
        const link = button(
          "Link",
          () => {
            hide();
            options.link();
          },
          Link,
        );
        link.setAttribute("aria-pressed", String(activeMark("link")));
        row.insertBefore(
          link,
          row.querySelector('[data-mark="strike"], [data-mark="code"]'),
        );
        let plainSelection = $from.sameParent($to);
        state.doc.nodesBetween(from, to, (node) => {
          if (node.isInline && !node.isText) plainSelection = false;
        });
        if (plainSelection && options.canCommand("equation"))
          row.append(
            button(
              "Inline equation",
              () => {
                const { state } = view,
                  { from, to } = state.selection;
                const value = state.doc.textBetween(from, to);
                view.dispatch(
                  closeHistory(
                    state.tr.replaceSelectionWith(
                      state.schema.nodes["inline.inline_math"].create({ value }),
                      false,
                    ),
                  ),
                );
                finish();
              },
              Radical,
            ),
          );
        menu.append(row);
        if (!panel) return;
        const sub = document.createElement("div");
        sub.className = "pm-selection-panel";
        sub.setAttribute("role", "group");
        sub.setAttribute(
          "aria-label",
          panel === "colors" ? "Colors" : "Block types",
        );
        if (panel === "blocks") {
          for (const [type, label, glyph] of blockTypes) {
            if (!options.canCommand(type)) continue;
            const item = button(label, () => {
              options.convert(type);
              finish();
            });
            const symbol = document.createElement("span");
            symbol.textContent = glyph;
            const text = document.createElement("span");
            setUIText(text, label);
            item.replaceChildren(symbol, text);
            item.setAttribute(
              "aria-pressed",
              String(currentBlock(state) === type),
            );
            if (currentBlock(state) === type) item.append(icon(Check));
            sub.append(item);
          }
        } else {
          const group = (title: string, values: string[]) => {
            const heading = document.createElement("div");
            heading.className = "pm-selection-label";
            setUIText(heading, title);
            const grid = document.createElement("div");
            grid.className = "pm-selection-swatches";
            for (const value of values) {
              const bg = value.endsWith("_bg"),
                base = value.replace("_bg", "");
              const label = `${base[0].toUpperCase() + base.slice(1)} ${bg ? "background" : "text"}`;
              const swatch = button(
                label,
                () => applyColor(value),
                bg ? "" : "A",
              );
              swatch.style.cssText = colorStyle(value);
              swatch.setAttribute(
                "aria-pressed",
                String(
                  base === "default"
                    ? options.canCombineColors()
                      ? (() => {
                        let clear = true;
                        state.doc.nodesBetween(from, to, node => {
                          if (node.isText && node.marks.some(mark => isEditorKind(mark, "color") && inlineColors(mark.attrs)[bg ? "bg_color" : "color"])) clear = false;
                        });
                        return clear;
                      })()
                      : !state.doc.rangeHasMark(
                        from,
                        to,
                        state.schema.marks.color,
                      )
                    : activeMark("color", value),
                ),
              );
              grid.append(swatch);
            }
            sub.append(heading, grid);
          };
          if (recent.length) group("Recently used", recent);
          group("Text color", colors);
          group(
            "Background color",
            colors.map((c) => c + "_bg"),
          );
        }
        menu.append(sub);
      }
      function position() {
        if (menu.hidden) return;
        const { from, to } = view.state.selection;
        const start = view.coordsAtPos(from),
          end = view.coordsAtPos(to);
        const bounds = view.dom.getBoundingClientRect();
        const top = Math.max(start.top, bounds.top),
          bottom = Math.min(end.bottom, bounds.bottom);
        if (
          bottom < 0 ||
          top > innerHeight ||
          bounds.right < 0 ||
          bounds.left > innerWidth
        ) {
          hide();
          return;
        }
        const width = menu.offsetWidth,
          height = menu.offsetHeight;
        const x =
          start.top === end.top ? (start.left + end.left) / 2 : start.left;
        menu.style.left = `${Math.max(8, Math.min(x - width / 2, innerWidth - width - 8))}px`;
        const y =
          bottom + 8 + height <= innerHeight ? bottom + 8 : top - height - 8;
        menu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
      }
      function refresh() {
        if (
          !eligible() ||
          (!view.hasFocus() && !menu.contains(document.activeElement))
        ) {
          hide();
          return;
        }
        if (renderedState !== view.state || renderedPanel !== panel) render();
        menu.hidden = false;
        position();
      }
      // Pointer controls must not collapse the editor's native selection.
      menu.addEventListener("mousedown", (e) => e.preventDefault(), { signal });
      menu.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (panel) {
              panel = null;
              render();
              position();
              menu.querySelector<HTMLElement>("button")?.focus();
            } else {
              dismissed = true;
              hide();
              view.focus();
            }
          } else if (
            ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)
          ) {
            const group =
              (e.target as Element).closest(".pm-selection-panel") || menu;
            const buttons = [
              ...group.querySelectorAll<HTMLButtonElement>("button"),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            e.preventDefault();
            buttons[
              (index +
                (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1) +
                buttons.length) %
                buttons.length
            ]?.focus();
          }
        },
        { signal },
      );
      document.addEventListener(
        "pointerdown",
        (e) => {
          if (menu.contains(e.target as Node)) return;
          if (view.dom.contains(e.target as Node)) {
            dragging = true;
            dismissed = false;
          } else dismissed = true;
          hide();
        },
        { signal },
      );
      document.addEventListener(
        "pointerup",
        () => {
          dragging = false;
          schedule();
        },
        { signal },
      );
      document.addEventListener(
        "pointercancel",
        () => {
          dragging = false;
          schedule();
        },
        { signal },
      );
      document.addEventListener("focusin", schedule, { signal });
      document.addEventListener("focusout", schedule, { signal });
      view.dom.addEventListener("compositionstart", hide, { signal });
      view.dom.addEventListener("compositionend", schedule, { signal });
      view.dom.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape" && !menu.hidden) {
            dismissed = true;
            hide();
          }
        },
        { signal },
      );
      window.addEventListener("scroll", schedule, { capture: true, signal });
      window.addEventListener("resize", schedule, { signal });
      focusMenu = () => {
        dismissed = false;
        refresh();
        if (menu.hidden) return false;
        menu.querySelector<HTMLElement>("button")?.focus();
        return true;
      };
      return {
        update(_view: EditorView, previous: EditorState) {
          if (
            !previous.selection.eq(view.state.selection) ||
            previous.doc !== view.state.doc
          ) {
            dismissed = false;
            panel = null;
          }
          schedule();
        },
        destroy() {
          disposed = true;
          abort.abort();
          cancelAnimationFrame(frame);
          menu.remove();
          focusMenu = undefined;
        },
      };
    },
  });
}
