import { setUIAttribute, setUIText } from "../../shared/i18n";
import { isEditorKind } from "../../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  createElement,
  Github,
  Cloud,
  FileText,
  ExternalLink,
  RefreshCw,
  Pencil,
} from "lucide";
import { api } from "../../shared/types";
import { httpsUrl, linkTarget, type LinkPreviewData } from "./link-preview";
import { openBlockProperties } from "../../editor/block-properties";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text = "",
) => {
  const element = document.createElement(tag);
  element.className = cls;
  element.textContent = text;
  return element;
};
const icon = (provider: string) =>
  createElement(
    provider === "github" ? Github : provider === "onedrive" ? Cloud : FileText,
    { width: 18, height: 18, "aria-hidden": "true" },
  );
function size(value?: number) {
  return value === undefined
    ? ""
    : value < 1024
      ? `${value} B`
      : value < 1048576
        ? `${(value / 1024).toFixed(1)} KB`
        : `${(value / 1048576).toFixed(1)} MB`;
}
function date(value?: string) {
  const d = new Date(value || "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/** Remote data stays in this view: refresh never dispatches a document transaction. */
export class LinkPreviewView implements NodeView {
  readonly dom: HTMLElement;
  private data?: LinkPreviewData;
  private error = "";
  private loading = false;
  private serial = 0;
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private dialog?: HTMLDialogElement;
  private controller?: AbortController;
  private readonly inline: boolean;
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.inline = isEditorKind(node, "link_mention");
    this.dom = document.createElement(this.inline ? "span" : "figure");
    this.dom.contentEditable = "false";
    this.render();
    void this.load();
    this.timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        this.dom.isConnected &&
        !this.error
      )
        void this.load();
    }, 60000);
    window.addEventListener(
      "notdown-link-connections",
      this.connectionsChanged,
    );
  }
  private connectionsChanged = () => {
    this.controller?.abort();
    this.serial++;
    this.loading = false;
    this.data = undefined;
    this.error = "";
    this.dialog?.close();
    this.render();
    void this.load();
  };
  private async load() {
    const target = linkTarget(String(this.node.attrs.url));
    if (!target || this.disposed || this.loading) return;
    const serial = ++this.serial;
    this.controller = new AbortController();
    this.loading = true;
    this.render();
    try {
      const data = await api<LinkPreviewData>("/link-previews/resolve", {
        method: "POST",
        body: JSON.stringify({ url: target.url }),
        signal: this.controller.signal,
      });
      if (this.disposed || serial !== this.serial) return;
      this.data = data;
      this.error = "";
    } catch (e) {
      if (!this.disposed && serial === this.serial)
        this.error = (e as Error).message;
    } finally {
      if (!this.disposed && serial === this.serial) {
        this.loading = false;
        this.render();
      }
    }
  }
  private button(label: string, glyph: typeof RefreshCw, action: () => void) {
    const b = el("button", "pm-preview-action");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(
      createElement(glyph, { width: 14, height: 14, "aria-hidden": "true" }),
    );
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    };
    return b;
  }
  private open() {
    const url = httpsUrl(this.node.attrs.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
  private render() {
    const t = linkTarget(String(this.node.attrs.url)),
      d = this.data,
      provider = t?.provider || "link";
    const title =
      d?.title ||
      this.node.attrs.title ||
      this.node.attrs.label ||
      t?.label ||
      this.node.attrs.url ||
      "Link preview";
    const selected = this.dom.classList.contains("ProseMirror-selectednode");
    this.dom.className = this.inline
      ? "pm-link-mention"
      : `pm-link-preview pm-preview-${provider}`;
    this.dom.classList.toggle("ProseMirror-selectednode", selected);
    this.dom.dataset.provider = provider;
    this.dom.setAttribute("aria-busy", String(this.loading));
    this.dom.replaceChildren();
    if (this.inline) {
      const a = el("a", "pm-link-mention-label");
      a.href = httpsUrl(this.node.attrs.url);
      a.append(icon(provider), document.createTextNode(title));
      a.title = [
        d?.state,
        d?.repository,
        this.error || (this.loading ? "Loading preview…" : "Click for details"),
      ]
        .filter(Boolean)
        .join(" · ");
      a.onclick = (e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          this.expand();
        }
      };
      this.dom.append(a);
      return;
    }
    const body = el("div", "pm-preview-body"),
      identity = el("div", "pm-preview-identity");
    if (httpsUrl(d?.avatar)) {
      const avatar = el("img", "pm-preview-avatar");
      avatar.src = d!.avatar!;
      avatar.alt = "";
      avatar.referrerPolicy = "no-referrer";
      avatar.onerror = () => avatar.remove();
      identity.append(avatar);
    }
    identity.append(icon(provider));
    const info = el("div", "pm-preview-info"),
      header = el("div", "pm-preview-heading");
    const a = el("a", "pm-preview-title", title);
    a.href = httpsUrl(this.node.attrs.url);
    a.title = "Open original";
    a.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.open();
    };
    header.append(a);
    if (d?.state)
      header.append(
        el("span", "pm-preview-state state-" + d.state.toLowerCase(), d.state),
      );
    info.append(header);
    const details = [
      d?.number ? `#${d.number}` : "",
      d?.repository,
      d?.author,
      size(d?.size),
      date(d?.updated) ? `Updated ${date(d?.updated)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    info.append(
      el(
        "div",
        "pm-preview-meta",
        details ||
          (provider === "github"
            ? "GitHub"
            : provider === "onedrive"
              ? "OneDrive / SharePoint"
              : this.node.attrs.url),
      ),
    );
    body.append(identity, info);
    if (provider === "onedrive" || httpsUrl(this.node.attrs.image)) {
      const image = httpsUrl(d?.image || this.node.attrs.image);
      const media = el("div", "pm-preview-media");
      if (image) {
        const img = el("img", "");
        img.src = image;
        img.alt = title;
        img.referrerPolicy = "no-referrer";
        img.onerror = () =>
          media.replaceChildren(el("span", "", "File preview unavailable"));
        media.append(img);
      } else
        media.append(
          icon("onedrive"),
          el(
            "span",
            "",
            this.loading
              ? "Loading file preview…"
              : this.error
                ? "Connect to view this file"
                : "No thumbnail available",
          ),
        );
      this.dom.append(media);
    }
    this.dom.append(body);
    if (d?.code !== undefined) {
      const pre = el("pre", "pm-preview-code");
      pre.append(el("code", "", d.code));
      pre.setAttribute("aria-label", `Code from line ${d.start || 1}`);
      this.dom.append(pre);
      if (d.truncated)
        this.dom.append(
          el(
            "div",
            "pm-preview-meta",
            "Preview limited to 200 lines / 40,000 characters. Open original for the complete file.",
          ),
        );
    } else if (
      (provider !== "github" || !d) &&
      (d?.description || this.node.attrs.description)
    )
      this.dom.append(
        el(
          "div",
          "pm-preview-description",
          d?.description || this.node.attrs.description,
        ),
      );
    if (this.node.attrs.caption)
      this.dom.append(
        el("figcaption", "pm-preview-description", this.node.attrs.caption),
      );
    const toolbar = el("div", "pm-preview-toolbar");
    if (t) {
      const refresh = this.button("Refresh preview", RefreshCw, () => {
        void this.load();
      });
      refresh.disabled = this.loading;
      toolbar.append(refresh);
    }
    toolbar.append(
      this.button("Expand preview", ExternalLink, () => this.expand()),
    );
    if (this.view.editable)
      toolbar.append(
        this.button("Edit link preview", Pencil, () => {
          const pos = this.getPos();
          if (pos !== undefined) openBlockProperties(this.view, pos);
        }),
      );
    this.dom.append(toolbar);
    const status = el(
      "output",
      "pm-preview-status",
      this.error ||
        (this.loading
          ? "Updating…"
          : !t
            ? "Static preview · automatic updates support GitHub and OneDrive links."
            : ""),
    );
    status.setAttribute("aria-live", "polite");
    if (this.error) {
      status.dataset.error = "true";
      status.textContent += this.data
        ? " Showing the last loaded preview."
        : "";
    }
    this.dom.append(status);
  }
  private expand() {
    this.dialog?.remove();
    const dialog = (this.dialog = document.createElement("dialog"));
    dialog.className = "pm-preview-dialog";
    setUIAttribute(dialog, "aria-label", "Link preview");
    const header = el("header", ""),
      title = el(
        "h2",
        "",
        this.data?.title ||
          this.node.attrs.label ||
          this.node.attrs.title ||
          linkTarget(this.node.attrs.url)?.label ||
          "Link preview",
      );
    const close = el("button", "", "Close");
    close.type = "button";
    close.onclick = () => dialog.close();
    header.append(title, close);
    dialog.append(header);
    if (this.data?.code !== undefined)
      dialog.append(el("pre", "pm-preview-code", this.data.code));
    else if (httpsUrl(this.data?.image || this.node.attrs.image)) {
      const img = el("img", "pm-preview-expanded-image");
      img.src = this.data?.image || this.node.attrs.image;
      img.alt = title.textContent!;
      img.referrerPolicy = "no-referrer";
      dialog.append(img);
    }
    if (this.data?.description)
      dialog.append(el("p", "", this.data.description));
    if (this.data?.state) dialog.append(el("p", "", this.data.state));
    if (this.error) dialog.append(el("p", "", this.error));
    if (this.data?.provider === "onedrive" && this.data.kind === "file") {
      const full = el("button", "", "View document"),
        output = el("output", "pm-preview-status");
      full.type = "button";
      full.onclick = async () => {
        full.disabled = true;
        setUIText(output, "Opening document…");
        const original = this.node.attrs.url;
        try {
          const result = await api<{ url: string }>("/link-previews/viewer", {
            method: "POST",
            body: JSON.stringify({ url: original }),
          });
          if (this.disposed || !dialog.open || original !== this.node.attrs.url)
            return;
          const url = httpsUrl(result.url);
          if (
            !url ||
            !/(^|\.)(sharepoint\.com|onedrive\.com|officeapps\.live\.com|office\.net)$/.test(
              new URL(url).hostname,
            )
          )
            throw new Error("The document viewer is unavailable.");
          const frame = document.createElement("iframe");
          frame.title = setUIText(title, "Document preview");
          frame.sandbox.add(
            "allow-scripts",
            "allow-same-origin",
            "allow-forms",
          );
          frame.referrerPolicy = "no-referrer";
          frame.src = url;
          frame.className = "pm-preview-document";
          dialog.append(frame);
          setUIText(output, "If the viewer cannot display this file, use Open original.");
          full.remove();
        } catch (e) {
          if (dialog.open)
            output.textContent =
              (e as Error).message +
              " Embedded viewing requires OneDrive for Business or SharePoint; you can still open the original.";
        } finally {
          full.disabled = false;
        }
      };
      dialog.append(full, output);
    }
    const open = el("button", "", "Open original");
    open.type = "button";
    open.onclick = () => this.open();
    dialog.append(open);
    const refresh = el("button", "", "Refresh preview");
    refresh.type = "button";
    refresh.onclick = async () => {
      refresh.disabled = true;
      await this.load();
      if (!this.disposed && dialog.open) this.expand();
    };
    dialog.append(refresh);
    if (this.inline && this.view.editable) {
      const edit = el("button", "", "Edit mention");
      edit.type = "button";
      edit.onclick = () => {
        const pos = this.getPos();
        if (pos !== undefined) {
          dialog.close();
          openBlockProperties(this.view, pos);
        }
      };
      dialog.append(edit);
    }
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.url !== this.node.attrs.url;
    this.node = node;
    if (changed) {
      this.controller?.abort();
      this.serial++;
      this.loading = false;
      this.data = undefined;
      this.error = "";
      this.dialog?.close();
    }
    this.render();
    if (changed) void this.load();
    return true;
  }
  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode");
  }
  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode");
  }
  stopEvent(event: Event) {
    return event.type !== "dblclick";
  }
  ignoreMutation(m: { type: string }) {
    return m.type !== "selection";
  }
  destroy() {
    this.disposed = true;
    this.serial++;
    this.controller?.abort();
    clearInterval(this.timer);
    this.dialog?.remove();
    window.removeEventListener(
      "notdown-link-connections",
      this.connectionsChanged,
    );
  }
}
