import { showEditorPanel } from "./editor-panel";
import "./comment-dialog.css";

export function commentDialog(options: {
  inline: boolean;
  canSwitchToBlock?: boolean;
  owner?: HTMLElement;
  submit: (value: string, inline: boolean) => void;
  close?: () => void;
}) {
  let inline = options.inline;
  const dialog = document.createElement("dialog");
  dialog.className = "pm-comment-dialog";
  dialog.innerHTML = `<form class="comment-form">
    <p class="comment-caption">A private note, kept in your Markdown.</p>
    <label>Comment<textarea aria-label="Comment" placeholder="Write a comment…" required></textarea></label>
    <p class="muted comment-hint"></p>
    <output></output>
    <button type="button">Cancel</button><button type="submit">Insert comment</button>
  </form>`;
  document.body.append(dialog);
  showEditorPanel(dialog, inline ? "Inline comment" : "Block comment", options.owner);
  const input = dialog.querySelector("textarea")!;
  const refresh = () => {
    const title = inline ? "Inline comment" : "Block comment";
    dialog.setAttribute("aria-label", title);
    dialog.querySelector("h3")!.textContent = title;
    dialog.querySelector("header button")!.setAttribute("aria-label", "Close " + title.toLowerCase());
    dialog.dataset.mode = inline ? "inline" : "block";
    input.rows = inline ? 3 : 7;
    dialog.querySelector(".comment-hint")!.textContent = inline && options.canSwitchToBlock
      ? "Enter on empty input → Block comment · Ctrl/⌘ + Enter to insert"
      : "Hidden on the page · Edit later in Source · Ctrl/⌘ + Enter to insert";
  };
  refresh();
  input.oninput = () => input.setCustomValidity("");
  input.onkeydown = event => {
    if (event.isComposing || event.key !== "Enter") return;
    if (inline && options.canSwitchToBlock && !input.value && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); inline = false; refresh();
    } else if (event.ctrlKey || event.metaKey) {
      event.preventDefault(); dialog.querySelector("form")!.requestSubmit();
    }
  };
  dialog.querySelector('form button[type="button"]')!.addEventListener("click", () => dialog.close());
  dialog.querySelector("form")!.onsubmit = event => {
    event.preventDefault();
    const value = input.value;
    input.setCustomValidity(!value.trim() ? "Enter a comment."
      : value.includes("%%") ? "Comments cannot contain a closing delimiter (%%)."
      : inline && /[\r\n]/.test(value) ? "Use a block comment for multiple lines." : "");
    if (!input.reportValidity()) return;
    try { options.submit(value, inline); dialog.close(); }
    catch (error) { dialog.querySelector("output")!.textContent = String(error instanceof Error ? error.message : error); }
  };
  dialog.addEventListener("close", () => { dialog.remove(); options.close?.(); }, { once: true });
  input.focus();
  return dialog;
}
