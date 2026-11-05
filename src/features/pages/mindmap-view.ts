import { escape as e } from "../../shared/types";
import { t, languageChanged } from "../../shared/i18n";
import { BlockEditor } from "../../editor/prosemirror-editor";
import { Fragment } from "prosemirror-model";
import { blockTypeLabel } from "../../catalog/block-catalog-data";
import { editorKind } from "../../document/node-identity";
import { commandEnabled, defaultSyntax, syntaxFormat, type SyntaxConfig } from "../../markdown-engine/config";
import { serializeNative } from "../../markdown-engine/codec";
import { expandMindmapNode, hiddenMindmapCount, mindmapNodeText, visibleMindmapChildren, type MindmapExpansion, type MindmapKind, type MindmapNode } from "./mindmap-model";
import "./mindmap-view.css";

const labels: Record<MindmapKind, string> = { root: "Mind map", heading: "Heading", paragraph: "Text", list: "List item", task: "Task", quote: "Quote", code: "Code", table: "Table", media: "Media", block: "Content" };
const marks: Record<MindmapKind, string> = { root: "", heading: "", paragraph: "", list: "•", task: "□", quote: "", code: "‹/›", table: "▦", media: "▧", block: "" };
const tone = (node: MindmapNode) => node.kind === "root" ? "root" : node.kind !== "heading" ? "body" : (node.level ?? 1) <= 2 ? "main" : node.level === 3 ? "sub" : "detail";

type MindmapOptions = Partial<Pick<ConstructorParameters<typeof BlockEditor>[1], "pages" | "currentPage" | "onOpenPage" | "onError">> & { syntax?: SyntaxConfig };

export function mountMindmap(host: HTMLElement, root: MindmapNode, context: MindmapOptions = {}) {
  const syntax = context.syntax ?? defaultSyntax("markdown");
  let previewEditor: BlockEditor | undefined;
  const disposePreview = () => { previewEditor?.destroy(); previewEditor = undefined; };
  const states = new Map<string, MindmapExpansion>();
  const nodes = new Map<string, MindmapNode>();
  function index(node: MindmapNode) { nodes.set(node.id, node); node.children.forEach(index); }
  index(root);
  if (!root.hasHeading) expandMindmapNode(root, states);
  const abort = new AbortController(), options = { signal: abort.signal };
  let scale = 1, frame = 0, selected: string | undefined;
  host.innerHTML = `<section class="mindmap-view">
    <div class="mindmap-toolbar"><div class="mindmap-presets">
      <button type="button" data-map-preset="headings" data-i18n="Headings only">${t("Headings only")}</button>
      <button type="button" data-map-preset="expanded" data-i18n="Expand all">${t("Expand all")}</button>
      <button type="button" data-map-preset="collapsed" data-i18n="Collapse all">${t("Collapse all")}</button>
    </div><div class="mindmap-zoom">
      <button type="button" data-map-zoom="out" aria-label="${t("Zoom out")}" data-i18n-aria-label="Zoom out">−</button>
      <output class="mindmap-scale">100%</output>
      <button type="button" data-map-zoom="in" aria-label="${t("Zoom in")}" data-i18n-aria-label="Zoom in">+</button>
      <button type="button" data-map-fit data-i18n="Fit map">${t("Fit map")}</button>
    </div></div>
    <div class="mindmap-viewport" tabindex="0" role="region" aria-label="${t("Mind map")}" data-i18n-aria-label="Mind map"><div class="mindmap-scene"></div></div>
    <div class="mindmap-help" data-i18n="Expand a branch to reveal content · Numbers count hidden descendants · Drag background to pan">${t("Expand a branch to reveal content · Numbers count hidden descendants · Drag background to pan")}</div>
    <section class="mindmap-preview" hidden><header class="mindmap-preview-header"><strong></strong><button type="button" data-map-close aria-label="${t("Close preview")}" data-i18n-aria-label="Close preview">×</button></header><div class="mindmap-preview-content" data-user-content></div></section>
  </section>`;
  const viewport = host.querySelector<HTMLElement>(".mindmap-viewport")!;
  const scene = host.querySelector<HTMLElement>(".mindmap-scene")!;
  const preview = host.querySelector<HTMLElement>(".mindmap-preview")!;
  const text = (node: MindmapNode) => mindmapNodeText(node, context.pages?.());
  const badge = (node: MindmapNode) => node.container || node.typeLabel || (!text(node) ? labels[node.kind] : "");
  const caption = (node: MindmapNode) => [badge(node) && t(badge(node)), text(node)].filter(Boolean).join(" · ");

  function topic(node: MindmapNode) {
    const children = visibleMindmapChildren(node, states), hidden = hiddenMindmapCount(node, states);
    const partial = children.length < node.children.length;
    const action = partial ? t("Expand branch; {count} hidden nodes", { count: hidden }) : t("Collapse branch; {count} child nodes", { count: node.children.length });
    return `<div class="mindmap-topic mindmap-${node.kind}${node.container ? " mindmap-container" : ""}" data-map-id="${node.id}" data-tone="${tone(node)}"${node.level ? ` data-heading-level="${node.level}"` : ""}>
      <button type="button" class="mindmap-label" data-map-select="${node.id}" aria-pressed="${selected === node.id}" title="${e(caption(node))}">${badge(node) ? `<span class="mindmap-type">${e(t(badge(node)))}</span>` : marks[node.kind] ? `<span class="mindmap-kind" aria-hidden="true">${node.kind === "task" && node.checked ? "☑" : marks[node.kind]}</span>` : ""}${text(node) ? `<span class="mindmap-text" data-user-content>${e(text(node))}</span>` : ""}</button>
      ${node.children.length ? `<span class="mindmap-toggle-line" aria-hidden="true"></span><button type="button" class="mindmap-toggle${partial ? " has-count" : ""}" data-map-toggle="${node.id}" aria-expanded="${children.length > 0}" aria-label="${e(action)}" title="${e(action)}">${partial ? `<span class="mindmap-count" aria-hidden="true">${hidden}</span>` : `<span aria-hidden="true">−</span>`}</button>` : ""}
    </div>`;
  }
  function branch(node: MindmapNode, parent: string): string {
    const children = visibleMindmapChildren(node, states);
    return `<div class="mindmap-branch" data-parent="${parent}">${topic(node)}${children.length ? `<div class="mindmap-children">${children.map(child => branch(child, node.id)).join("")}</div>` : ""}</div>`;
  }
  function drawLinks() {
    const origin = scene.getBoundingClientRect();
    const boxes = new Map([...scene.querySelectorAll<HTMLElement>(".mindmap-topic")].map(el => [el.dataset.mapId!, { el, rect: el.getBoundingClientRect() }]));
    const paths: string[] = [];
    for (const child of scene.querySelectorAll<HTMLElement>(".mindmap-branch")) {
      const element = child.querySelector<HTMLElement>(":scope > .mindmap-topic")!;
      const from = boxes.get(child.dataset.parent!), to = boxes.get(element.dataset.mapId!);
      if (!from || !to) continue;
      const x1 = (from.rect.right - origin.left) / scale;
      const x2 = (to.rect.left - origin.left) / scale;
      const anchor = (box: typeof from) => (box.rect.top + (box.el.dataset.tone === "body" ? box.rect.height - .5 * scale : box.rect.height / 2) - origin.top) / scale;
      const y1 = anchor(from), y2 = anchor(to);
      const start = x1 + 48, bend = start + (x2 - start) * .5;
      paths.push(`<path data-tone="${element.dataset.tone}" d="M${x1},${y1} H${start} C${bend},${y1} ${bend},${y2} ${x2},${y2}"/>`);
    }
    scene.querySelector("svg")!.innerHTML = paths.join("");
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(drawLinks); }
  function render() {
    const children = visibleMindmapChildren(root, states);
    scene.innerHTML = `<svg class="mindmap-links" aria-hidden="true"></svg>${topic(root)}${children.length ? `<div class="mindmap-side">${children.map(child => branch(child, root.id)).join("")}</div>` : ""}`;
    schedule();
  }
  function zoom(next: number) {
    const x = (viewport.scrollLeft + viewport.clientWidth / 2) / scale;
    const y = (viewport.scrollTop + viewport.clientHeight / 2) / scale;
    scale = Math.min(1.8, Math.max(.15, next));
    scene.style.zoom = String(scale);
    host.querySelector(".mindmap-scale")!.textContent = `${Math.round(scale * 100)}%`;
    viewport.scrollLeft = x * scale - viewport.clientWidth / 2;
    viewport.scrollTop = y * scale - viewport.clientHeight / 2;
    schedule();
  }
  function fit(minimum = .15) {
    zoom(Math.max(minimum, Math.min(1, (viewport.clientWidth - 24) / scene.offsetWidth, (viewport.clientHeight - 24) / scene.offsetHeight)));
    viewport.scrollLeft = (scene.offsetWidth * scale - viewport.clientWidth) / 2;
    viewport.scrollTop = (scene.offsetHeight * scale - viewport.clientHeight) / 2;
  }
  function select(id: string) {
    selected = id;
    const node = nodes.get(id)!;
    preview.hidden = false;
    const block = node.kind === "media" && editorKind(node.block) === "paragraph" ? node.block.firstChild! : node.block;
    const label = node.kind === "root" ? "Page" : blockTypeLabel(block, node.preview);
    preview.querySelector(".mindmap-preview-header strong")!.textContent = label.startsWith("Toggle heading ") ? `${t("Toggle heading")} ${node.level}` : t(label);
    disposePreview();
    const content = preview.querySelector<HTMLElement>(".mindmap-preview-content")!;
    content.replaceChildren(); content.scrollTop = 0;
    const doc = node.preview.type === root.block.type ? node.preview : root.block.copy(Fragment.from(node.preview));
    previewEditor = new BlockEditor(content, {
      ...context, value: "", readOnly: true,
      pages: context.pages ?? (() => []),
      codec: { parse: () => doc, serialize: value => serializeNative(value, syntax), format: syntaxFormat(syntax) },
      canCommand: name => commandEnabled(syntax, name),
      onChange() {}, onInsert() {}, onError: context.onError ?? (() => {}),
    });
    scene.querySelectorAll<HTMLElement>("[data-map-select]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.mapSelect === id)));
  }
  host.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.mapToggle) {
      const id = button.dataset.mapToggle, node = nodes.get(id)!;
      const before = button.getBoundingClientRect();
      if (visibleMindmapChildren(node, states).length < node.children.length) expandMindmapNode(node, states);
      else states.set(id, "collapsed");
      render();
      const replacement = scene.querySelector<HTMLButtonElement>(`[data-map-toggle="${id}"]`)!;
      const after = replacement.getBoundingClientRect();
      viewport.scrollLeft += after.left - before.left;
      viewport.scrollTop += after.top - before.top;
      replacement.focus({ preventScroll: true });
    } else if (button.dataset.mapSelect) select(button.dataset.mapSelect);
    else if (button.dataset.mapPreset) {
      const mode = button.dataset.mapPreset as MindmapExpansion;
      nodes.forEach(node => states.set(node.id, mode));
      if (mode === "headings" && !root.hasHeading) expandMindmapNode(root, states);
      render(); fit(.55);
    } else if (button.hasAttribute("data-map-fit")) fit();
    else if (button.dataset.mapZoom) zoom(scale + (button.dataset.mapZoom === "in" ? .1 : -.1));
    else if (button.hasAttribute("data-map-close")) {
      preview.hidden = true;
      disposePreview();
      scene.querySelector<HTMLButtonElement>(`[data-map-select="${selected}"]`)?.focus({ preventScroll: true });
    }
  }, options);
  viewport.addEventListener("keydown", event => {
    if (event.target !== viewport) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(scale + .1); }
    if (event.key === "-") { event.preventDefault(); zoom(scale - .1); }
    if (event.key === "0") { event.preventDefault(); fit(); }
  }, options);
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.pointerType === "touch" || (event.target as Element).closest("button")) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId); viewport.classList.add("is-panning");
  }, options);
  viewport.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    viewport.scrollLeft = drag.left - event.clientX + drag.x;
    viewport.scrollTop = drag.top - event.clientY + drag.y;
  }, options);
  const stop = () => { drag = undefined; viewport.classList.remove("is-panning"); };
  viewport.addEventListener("lostpointercapture", stop, options);
  viewport.addEventListener("pointerup", stop, options);
  viewport.addEventListener("pointercancel", stop, options);
  window.addEventListener(languageChanged, () => {
    const closed = preview.hidden;
    render();
    if (selected && !closed) select(selected);
    preview.hidden = closed;
  }, options);
  const observer = new ResizeObserver(schedule);
  observer.observe(scene); observer.observe(viewport);
  render(); fit(.55);
  return () => { disposePreview(); abort.abort(); observer.disconnect(); cancelAnimationFrame(frame); };
}
