import "./editor-panel.css";

/** Small editing forms stay open while the user scrolls and consults the page. */
export function showEditorPanel(dialog: HTMLDialogElement, title: string, owner?: HTMLElement) {
  dialog.classList.add("pm-editor-panel");
  dialog.setAttribute("aria-label", title);
  dialog.setAttribute("aria-modal", "false");
  const heading = dialog.querySelector<HTMLElement>(":scope > h3") ?? document.createElement("h3");
  heading.textContent = title;
  const header = document.createElement("header");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close " + title.toLowerCase());
  close.onclick = () => dialog.close();
  header.append(heading, close);
  dialog.prepend(header);
  const form = dialog.querySelector("form");
  if (form) {
    const actions = document.createElement("footer");
    // Existing handlers and validation remain attached to the same controls.
    actions.append(...form.querySelectorAll(":scope > button"));
    form.append(actions);
    form.querySelectorAll("output").forEach(output => output.setAttribute("aria-live", "polite"));
    form.querySelectorAll("textarea").forEach(input => {
      if (!input.closest("label")) {
        const label = document.createElement("label");
        label.textContent = input.getAttribute("aria-label") || "Source";
        input.before(label);
        label.append(input);
      }
    });
  }
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
  // A bibliography panel lives outside its editor; remove it on navigation too.
  if (owner) {
    const observer = new MutationObserver(() => {
      if (!dialog.isConnected) observer.disconnect();
      else if (!owner.isConnected) { dialog.close(); dialog.remove(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    dialog.addEventListener("close", () => observer.disconnect(), { once: true });
  }
  dialog.show();
}
