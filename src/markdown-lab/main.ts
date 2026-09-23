import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import "../notion-blocks.css";
import "./style.css";
import {
  variants,
  blockPlugins,
  extensionLabels,
  type Variant,
  type Capabilities,
  type RenderResult,
} from "./model";
import { markdownExample, notionExample } from "./examples";
import { normalizeSyntax, enabled as extensionEnabled, supportsOption, extensions as nativeExtensions } from "../markdown-engine/config";
import { mapScroll, type Anchor } from "./scroll";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const rendererOptions = (engine: "direct" | "pandoc" | "notdown") =>
  variants
    .filter((item) => engine === "direct" ? item.engine !== "pandoc" && item.engine !== "notdown" : item.engine === engine)
    .map((item) => `<option value="${item.id}">${item.label}</option>`)
    .join("");
const storageKey = "notdown-markdown-lab-v1";
interface Draft {
  source: string;
  variant: Variant;
  overrides: Partial<Record<Variant, Record<string, boolean>>>;
  plugins: string[];
  filename: string;
  sync: boolean;
}
const draft: Draft = {
  source: markdownExample,
  variant: "gfm",
  overrides: {},
  plugins: [],
  filename: "Untitled.md",
  sync: true,
};
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  if (
    saved &&
    typeof saved.source === "string" &&
    saved.source.length <= 128_000 &&
    variants.some((item) => item.id === saved.variant)
  ) {
    draft.source = saved.source;
    draft.variant = saved.variant;
    if (typeof saved.filename === "string") draft.filename = saved.filename;
    draft.sync = saved.sync !== false;
    if (Array.isArray(saved.plugins))
      draft.plugins = saved.plugins.filter((id: string) =>
        blockPlugins.some((plugin) => plugin.id === id),
      );
    for (const item of variants) {
      if (
        saved.overrides?.[item.id] &&
        typeof saved.overrides[item.id] === "object"
      )
        draft.overrides[item.id] = normalizeSyntax({ version: 1, variant: "notdown", extensions: Object.fromEntries(
          Object.entries(saved.overrides[item.id]).filter(
            ([, enabled]) => typeof enabled === "boolean",
          ),
        ) as Record<string, boolean> }).extensions;
    }
  }
} catch {
  /* An unavailable session store must never prevent editing. */
}

$("#lab").innerHTML = `
  <header class="lab-header">
    <div class="lab-brand"><a class="lab-logo" href="/" target="_blank" rel="noopener" aria-label="Open Notdown vault">N<span>↗</span></a><strong>Notdown</strong><span class="brand-divider">/</span><h1>Markdown Lab</h1><span class="lab-tag">Lab</span></div>
    <div class="file-actions"><button id="open-file"><span aria-hidden="true">↥</span> Open file</button><button id="download" class="primary"><span aria-hidden="true">↓</span> Download Markdown</button></div>
  </header>
  <div class="lab-toolbar">
    <div class="format-control"><label for="variant">Renderer / dialect</label><select id="variant"><optgroup label="External programs">${rendererOptions("direct")}</optgroup><optgroup label="Pandoc dialect readers">${rendererOptions("pandoc")}</optgroup><optgroup label="Notdown codecs">${rendererOptions("notdown")}</optgroup></select><button id="configure">Extensions and plugins <span id="extension-count"></span></button></div>
    <div class="view-controls"><details id="examples"><summary>Load example <span aria-hidden="true">⌄</span></summary><div class="example-menu"><button data-example="gfm">Markdown introduction</button><button data-example="notion-markdown">Notion blocks and columns</button></div></details><button id="sync" aria-pressed="true"><span aria-hidden="true">⇅</span> Sync scrolling</button></div>
  </div>
  <main class="lab-workspace">
    <section class="source-pane" aria-label="Markdown source pane"><div class="pane-heading"><div><span class="pane-symbol" aria-hidden="true">&lt;/&gt;</span><h2>Source</h2><span id="filename"></span></div><span class="pane-caption">MARKDOWN</span></div><div id="editor"></div></section>
    <section class="preview-pane" aria-label="Rendered output pane"><div class="pane-heading"><div class="output-tabs" role="group" aria-label="Output view"><button id="show-page" aria-pressed="true">Page</button><button id="show-html" aria-pressed="false">HTML</button></div><span class="preview-only">Rendered output</span></div><span id="render-status" role="status" data-state="pending">Waiting for preview</span></div><div id="preview-scroll" tabindex="0" aria-label="Rendered output"><div id="preview-error" role="alert" hidden></div><article id="preview" class="pm-document" aria-label="Rendered Markdown" aria-busy="true"></article><pre id="html-output" aria-label="Generated HTML" hidden></pre></div></section>
  </main>
  <footer class="lab-footer"><div><span id="engine">Checking local renderers…</span><span class="footer-dot">·</span><span id="mapping">Sync by source position</span></div><div><span id="draft-status">Draft in this window</span><span class="footer-dot">·</span><span id="position">Ln 1, Col 1</span><span class="footer-dot">·</span><span id="word-count"></span></div></footer>
  <dialog id="settings"><div class="dialog-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2>Extensions and plugins</h2></div><button id="close-settings" aria-label="Close extensions and plugins">✕</button></div><p class="settings-note">Syntax extensions belong to the current dialect. Changing settings updates the preview and preserves the source.</p><div class="extensions-heading"><h3>Syntax extensions <span id="settings-variant"></span></h3><button id="reset-extensions">Reset dialect defaults</button></div><input id="extension-search" type="search" placeholder="Search extensions, e.g. footnotes, math" aria-label="Search syntax extensions"><p id="extension-note"></p><div id="extensions"></div><div class="dialog-footer"><span>Markdown preview</span><button id="done-settings" class="primary">Done</button></div></dialog>
  <input id="file-input" type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" hidden>
`;

const variantSelect = $<HTMLSelectElement>("#variant");
variantSelect.value = draft.variant;
const preview = $("#preview");
const htmlOutput = $("#html-output");
const previewScroll = $("#preview-scroll");
const renderStatus = $("#render-status");
const dialog = $<HTMLDialogElement>("#settings");
let capabilities: Capabilities | undefined;
let sequence = 0,
  timer = 0,
  request: AbortController | undefined;
let displayedSequence = -1;
let displayedMapping: RenderResult["mapping"] = "source";
let outputMode: "page" | "html" = "page";
let lastPane: "source" | "preview" = "source";
let expectedScroll: { pane: "source" | "preview"; top: number } | undefined;
let syncFrame = 0;

const editor = new EditorView({
  doc: draft.source,
  parent: $("#editor"),
  extensions: [
    basicSetup,
    markdown({
      codeLanguages: (name) =>
        /^(?:js|javascript|typescript|ts)$/.test(name)
          ? javascriptLanguage
          : /^json$/.test(name)
            ? jsonLanguage
            : null,
    }),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.heading, color: "#7952a5", fontWeight: "600" },
        { tag: tags.strong, color: "#3e5662", fontWeight: "700" },
        { tag: tags.emphasis, color: "#ad7344", fontStyle: "italic" },
        { tag: tags.link, color: "#367fa0" },
        { tag: tags.url, color: "#70897b" },
        { tag: tags.monospace, color: "#ae674a" },
        { tag: tags.processingInstruction, color: "#b7a0bd" },
      ]),
    ),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": "Markdown source",
      spellcheck: "false",
    }),
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          download();
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        draft.source = update.state.doc.toString();
        persist();
        scheduleRender();
      }
      if (update.selectionSet || update.docChanged) updatePosition();
    }),
  ],
});

function updatePosition() {
  const cursor = editor.state.selection.main.head;
  const line = editor.state.doc.lineAt(cursor);
  $("#position").textContent =
    `Ln ${line.number}, Col ${cursor - line.from + 1}`;
  $("#word-count").textContent =
    `${editor.state.doc.length.toLocaleString()} characters`;
  $("#filename").textContent = draft.filename;
}
function persist() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
    $("#draft-status").textContent = "Draft saved in this window";
  } catch {
    $("#draft-status").textContent = "Draft not cached. Download to keep a copy.";
  }
}
function scheduleRender() {
  const current = ++sequence;
  clearTimeout(timer);
  request?.abort();
  renderStatus.dataset.state = "pending";
  renderStatus.textContent = "Waiting for update…";
  preview.setAttribute("aria-busy", "true");
  // Invalidate immediately, including during IME composition. An older request
  // must not replace the preview while a newer source/configuration is pending.
  timer = window.setTimeout(() => {
    if (!editor.composing) void render(current);
  }, 180);
}
editor.contentDOM.addEventListener("compositionend", () => scheduleRender());

function showOutput(mode: "page" | "html") {
  outputMode = mode;
  preview.hidden = mode !== "page";
  htmlOutput.hidden = mode !== "html";
  $("#show-page").setAttribute("aria-pressed", String(mode === "page"));
  $("#show-html").setAttribute("aria-pressed", String(mode === "html"));
  previewScroll.scrollTop = 0;
  if (mode === "page") requestAnimationFrame(() => synchronize(lastPane));
}
$("#show-page").onclick = () => showOutput("page");
$("#show-html").onclick = () => showOutput("html");

async function render(current: number) {
  if (current !== sequence) return;
  request = new AbortController();
  renderStatus.dataset.state = "rendering";
  renderStatus.textContent = "Rendering…";
  const start = performance.now();
  try {
    const selected = variants.find((item) => item.id === draft.variant)!;
    const direct = selected.engine !== "pandoc" && selected.engine !== "notdown";
    const response = await fetch("/api/markdown/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: draft.source,
        variant: draft.variant,
        extensions: direct ? {} : draft.overrides[draft.variant] || {},
        plugins: direct ? [] : draft.plugins,
      }),
      signal: request.signal,
    });
    const result: RenderResult & { error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error || "Preview failed. Please try again.");
    if (current !== sequence) return;
    htmlOutput.textContent = result.html;
    // Only the trusted Notion renderer may emit schema-owned style attributes.
    // Pandoc raw HTML cannot style the application or introduce active elements.
    preview.innerHTML = DOMPurify.sanitize(result.html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "link", "form", "iframe", "object", "embed"],
      FORBID_ATTR: selected.engine === "notdown" ? [] : ["style"],
    });
    // Keep document anchors separate from application controls and status IDs.
    const documentIds = new Map<string, string>();
    for (const element of preview.querySelectorAll<HTMLElement>("[id]")) {
      const original = element.id;
      element.id = `lab-content-${original}`;
      documentIds.set(original, element.id);
    }
    for (const link of preview.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) {
        let fragment = href.slice(1);
        try {
          fragment = decodeURIComponent(fragment);
        } catch {
          /* Literal fragment. */
        }
        const id = documentIds.get(fragment);
        if (id) link.setAttribute("href", `#${encodeURIComponent(id)}`);
      }
      if (!link.getAttribute("href")?.startsWith("#")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    for (const input of preview.querySelectorAll<HTMLInputElement>("input"))
      input.disabled = true;
    for (const math of preview.querySelectorAll<HTMLElement>(".math")) {
      const displayMode = math.classList.contains("display");
      const text = math.textContent || "";
      const expression = text.replace(/^\\[([]/, "").replace(/\\[)\]]$/, "");
      katex.render(expression, math, {
        displayMode,
        throwOnError: false,
        trust: false,
        maxSize: 20,
        maxExpand: 1000,
      });
    }
    if (!preview.childElementCount)
      preview.innerHTML =
        '<p class="preview-placeholder">Write your first line to see your ideas here.</p>';
    displayedSequence = current;
    displayedMapping = result.mapping;
    preview.setAttribute("aria-busy", "false");
    renderStatus.dataset.state = "ready";
    renderStatus.textContent = `Updated · ${Math.round(performance.now() - start)} ms`;
    $("#engine").textContent = `${result.engine} · ${result.blocks} top-level ${result.mapping === "proportional" ? "elements" : "blocks"}`;
    $("#mapping").textContent =
      result.mapping === "source" ? "Sync by source position" : result.mapping === "proportional" ? "Sync by document progress" : "Sync by estimated block position";
    $("#mapping").title = result.warnings.join("\n");
    $("#preview-error").hidden = true;
    requestAnimationFrame(() => synchronize(lastPane));
  } catch (error) {
    if (current !== sequence || (error as Error).name === "AbortError") return;
    preview.setAttribute("aria-busy", "false");
    renderStatus.dataset.state = "error";
    renderStatus.textContent = "Preview not updated";
    const banner = $("#preview-error");
    banner.textContent = `${(error as Error).message}. Source preserved. Any content below is the last successful preview.`;
    const retry = document.createElement("button");
    retry.textContent = "Retry";
    retry.onclick = scheduleRender;
    banner.append(retry);
    banner.hidden = false;
  }
}

function anchors(): Anchor[] {
  const sourceMax = Math.max(
    0,
    editor.scrollDOM.scrollHeight - editor.scrollDOM.clientHeight,
  );
  const previewMax = Math.max(
    0,
    previewScroll.scrollHeight - previewScroll.clientHeight,
  );
  const points: Anchor[] = [{ source: 0, preview: 0 }];
  if (displayedMapping === "proportional") {
    points.push({ source: sourceMax, preview: previewMax });
    return points;
  }
  const sourceInset =
    editor.documentTop -
    editor.scrollDOM.getBoundingClientRect().top +
    editor.scrollDOM.scrollTop;
  const previewInset = previewScroll.getBoundingClientRect().top;
  const candidates: Anchor[] = [];
  for (const element of preview.querySelectorAll<HTMLElement>(
    "[data-source-line], [data-pos]",
  )) {
    if (
      !element.hasAttribute("data-source-line") &&
      !/^(DIV|P|H[1-6]|PRE|BLOCKQUOTE|LI|UL|OL|TABLE)$/.test(element.tagName)
    )
      continue;
    const line = Number(
      element.dataset.sourceLine ||
        /(?:^|@)(\d+):/.exec(element.dataset.pos || "")?.[1],
    );
    if (
      !Number.isInteger(line) ||
      line < 1 ||
      line > editor.state.doc.lines ||
      !element.getClientRects().length
    )
      continue;
    const source =
      sourceInset + editor.lineBlockAt(editor.state.doc.line(line).from).top;
    const target =
      element.getBoundingClientRect().top -
      previewInset +
      previewScroll.scrollTop;
    if (source > 0 && source < sourceMax && target > 0 && target < previewMax)
      candidates.push({ source, preview: target });
  }
  candidates.sort((a, b) => a.source - b.source || a.preview - b.preview);
  for (const point of candidates) {
    const last = points.at(-1)!;
    if (point.source > last.source && point.preview > last.preview)
      points.push(point);
  }
  points.push({ source: sourceMax, preview: previewMax });
  return points;
}
function synchronize(pane: "source" | "preview") {
  if (!draft.sync || outputMode !== "page" || displayedSequence !== sequence) return;
  const from = pane === "source" ? editor.scrollDOM : previewScroll;
  const to = pane === "source" ? previewScroll : editor.scrollDOM;
  const target = mapScroll(anchors(), from.scrollTop, pane);
  if (Math.abs(to.scrollTop - target) < 1) return;
  to.scrollTop = target;
  expectedScroll = {
    pane: pane === "source" ? "preview" : "source",
    top: to.scrollTop,
  };
}
function onScroll(pane: "source" | "preview") {
  const element = pane === "source" ? editor.scrollDOM : previewScroll;
  if (
    expectedScroll?.pane === pane &&
    Math.abs(element.scrollTop - expectedScroll.top) < 2
  ) {
    expectedScroll = undefined;
    return;
  }
  expectedScroll = undefined;
  lastPane = pane;
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(() => synchronize(pane));
}
editor.scrollDOM.addEventListener("scroll", () => onScroll("source"), {
  passive: true,
});
previewScroll.addEventListener("scroll", () => onScroll("preview"), {
  passive: true,
});
new ResizeObserver(() => {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(() => synchronize(lastPane));
}).observe(preview);
window.addEventListener("resize", () =>
  requestAnimationFrame(() => synchronize(lastPane)),
);
preview.addEventListener("click", (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>(
    'a[href^="#"]',
  );
  if (!link) return;
  event.preventDefault();
  const fragment = link.getAttribute("href")!.slice(1);
  let id = fragment;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    /* Keep literal malformed fragments. */
  }
  const target = [...preview.querySelectorAll<HTMLElement>("[id]")].find(
    (node) => node.id === id,
  );
  if (target) {
    lastPane = "preview";
    expectedScroll = undefined;
    previewScroll.scrollTop +=
      target.getBoundingClientRect().top -
      previewScroll.getBoundingClientRect().top -
      24;
  }
});

function updateSync() {
  $("#sync").setAttribute("aria-pressed", String(draft.sync));
  $("#sync").title = draft.sync ? "Two-way scroll sync enabled" : "Scroll each pane independently";
}
$("#sync").onclick = () => {
  draft.sync = !draft.sync;
  updateSync();
  persist();
  synchronize(lastPane);
};
function updateExtensions() {
  const focusedExtension = (document.activeElement as HTMLElement | null)
    ?.dataset.extension;
  const defaults = draft.variant === "notdown"
    ? Object.fromEntries(nativeExtensions.filter(ext => supportsOption({ version: 1, variant: "notdown", extensions: {} }, ext.id)).map(ext => [ext.id, extensionEnabled({ version: 1, variant: "notdown", extensions: {} }, ext.id)]))
    : capabilities?.extensions[draft.variant] || {};
  const selectedVariant = variants.find((item) => item.id === draft.variant)!;
  const direct = selectedVariant.engine !== "pandoc" && selectedVariant.engine !== "notdown";
  const configure = $<HTMLButtonElement>("#configure");
  configure.disabled = direct;
  configure.title = direct ? "Direct renderers use their own Markdown rules without Lab extension switches." : "Configure syntax extensions";
  for (const item of variants) {
    const option = variantSelect.querySelector<HTMLOptionElement>(
      `option[value="${item.id}"]`,
    )!;
    const unsupported = capabilities !== undefined && (
      item.engine === "pandoc"
        ? !capabilities.available || !Object.hasOwn(capabilities.extensions, item.id)
        : item.engine === "notdown"
          ? false
          : !capabilities.renderers?.[item.id as keyof NonNullable<Capabilities["renderers"]>]?.available
    );
    option.disabled = unsupported;
    option.textContent = item.label + (unsupported ? " · Unavailable locally" : "");
    option.title = item.engine === "pandoc" || item.engine === "notdown" ? "" : capabilities?.renderers?.[item.id as keyof NonNullable<Capabilities["renderers"]>]?.error || "";
  }
  const overrides = draft.overrides[draft.variant] || {};
  const active = Object.keys(defaults).filter(
    (name) => overrides[name] ?? defaults[name],
  ).length;
  $("#extension-count").textContent = direct ? "" : String(active + draft.plugins.length);
  $("#settings-variant").textContent = selectedVariant.short;
  const query = $<HTMLInputElement>("#extension-search").value.toLowerCase();
  const labels = draft.variant === "notdown" ? Object.fromEntries(nativeExtensions.map(ext => [ext.id, ext.label])) : extensionLabels;
  $("#extension-note").textContent =
    draft.variant === "notdown"
      ? "Notdown inherits Notion-flavored Markdown and enables Notdown blocks by default. Individual extensions can be turned off without rewriting source."
      : draft.variant === "notion-markdown"
      ? "This preset implements documented Notion enhanced Markdown. Supplemental Notion encodings are available only in Notdown."
      : capabilities?.available && !capabilities.extensions[draft.variant]
        ? "This Pandoc installation does not support this dialect. Choose an available dialect. Source is preserved."
        : capabilities?.available
          ? ("deprecated" in selectedVariant && selectedVariant.deprecated
              ? "Legacy GitHub Markdown is deprecated and provided for older files. Use GFM for new content."
              : "") +
            "All optional extensions for this dialect are listed here; source mapping is managed automatically. Defaults come from your local Pandoc. Highlighting uses generic Markdown syntax; the preview shows the actual interpretation."
          : "Connect to Pandoc to see available extensions for this dialect.";
  $("#extensions").innerHTML = Object.entries(defaults)
    .filter(([name]) =>
      `${name} ${labels[name] || ""}`.toLowerCase().includes(query),
    )
    .sort(
      ([a], [b]) =>
        Number(!extensionLabels[a]) - Number(!extensionLabels[b]) ||
        a.localeCompare(b),
    )
    .map(
      ([name, enabled]) =>
        `<label class="extension-row"><span><strong>${escape(labels[name] || name)}</strong><code>${escape(name)}</code></span><input type="checkbox" data-extension="${name}" ${(overrides[name] ?? enabled) ? "checked" : ""}></label>`,
    )
    .join("");
  for (const checkbox of dialog.querySelectorAll<HTMLInputElement>(
    "[data-plugin]",
  ))
    checkbox.checked = draft.plugins.includes(checkbox.dataset.plugin!);
  if (focusedExtension)
    dialog
      .querySelector<HTMLInputElement>(
        `[data-extension="${CSS.escape(focusedExtension)}"]`,
      )
      ?.focus({ preventScroll: true });
}
variantSelect.onchange = () => {
  draft.variant = variantSelect.value as Variant;
  persist();
  updateExtensions();
  scheduleRender();
};
$("#configure").onclick = () => {
  updateExtensions();
  dialog.showModal();
};
$("#close-settings").onclick = $("#done-settings").onclick = () =>
  dialog.close();
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
dialog.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.plugin)
    draft.plugins = input.checked
      ? [...new Set([...draft.plugins, input.dataset.plugin])]
      : draft.plugins.filter((id) => id !== input.dataset.plugin);
  else if (input.dataset.extension) {
    const overrides = (draft.overrides[draft.variant] ??= {});
    const name = input.dataset.extension;
    if (input.checked === capabilities?.extensions[draft.variant]?.[name])
      delete overrides[name];
    else overrides[name] = input.checked;
  } else return;
  persist();
  updateExtensions();
  scheduleRender();
});
$("#extension-search").addEventListener("input", updateExtensions);
$("#reset-extensions").onclick = () => {
  draft.overrides[draft.variant] = {};
  persist();
  updateExtensions();
  scheduleRender();
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-example]",
))
  button.onclick = () => {
    draft.variant = button.dataset.example as Variant;
    draft.filename =
      draft.variant === "notion-markdown"
        ? "notion-example.md"
        : "markdown-example.md";
    variantSelect.value = draft.variant;
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert:
          draft.variant === "notion-markdown" ? notionExample : markdownExample,
      },
    });
    $<HTMLDetailsElement>("#examples").open = false;
    updateExtensions();
    updatePosition();
    persist();
    scheduleRender();
  };
function download() {
  const url = URL.createObjectURL(
    new Blob([editor.state.doc.toString()], {
      type: "text/markdown;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = draft.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#download").onclick = download;
const fileInput = $<HTMLInputElement>("#file-input");
$("#open-file").onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  const before = sequence;
  try {
    if (file.size > 512_000)
      throw new Error("File too large. Markdown Lab supports up to 128,000 characters.");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    if (source.length > 128_000) throw new Error("File exceeds 128,000 characters.");
    if (before !== sequence)
      throw new Error("Content changed while opening the file. Please select the file again.");
    draft.filename = file.name;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: source },
    });
    updatePosition();
    persist();
    scheduleRender();
  } catch (error) {
    $("#preview-error").textContent = `File not opened: ${(error as Error).message}`;
    $("#preview-error").hidden = false;
  }
};

updateSync();
updatePosition();
updateExtensions();
void fetch("/api/markdown/capabilities")
  .then(async (response) => {
    if (!response.ok) throw new Error("Unable to read renderer capabilities");
    capabilities = await response.json();
    updateExtensions();
  })
  .catch(() => {
    $("#engine").textContent = "Renderer discovery unavailable";
  });
scheduleRender();
