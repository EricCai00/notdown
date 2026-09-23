const WIDTH_KEY = "notdown-sidebar-width";
const COLLAPSED_KEY = "notdown-sidebar-collapsed";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Layout still works without storage. */ }
}

export function installSidebarLayout() {
  const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
  const handle = document.querySelector<HTMLElement>(".sidebar-resizer")!;
  const toggle = document.querySelector<HTMLButtonElement>('[data-action="sidebar"]')!;
  const mobile = matchMedia("(max-width: 720px)");
  const savedWidth = Number(readPreference(WIDTH_KEY));
  let preferredWidth = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : DEFAULT_WIDTH;
  let collapsed = readPreference(COLLAPSED_KEY) === "true";
  let drag: { pointer: number; x: number; width: number; original: number } | null = null;
  const maxWidth = () => Math.max(MIN_WIDTH, Math.min(480, innerWidth - 400));
  const clamp = (width: number) => Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth(), width)));
  preferredWidth = Math.max(MIN_WIDTH, Math.min(480, preferredWidth));

  const render = () => {
    const width = clamp(preferredWidth);
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    const expanded = mobile.matches ? document.body.classList.contains("sidebar-open") : !collapsed;
    if (!expanded && sidebar.contains(document.activeElement)) toggle.focus();
    sidebar.inert = !expanded;
    sidebar.setAttribute("aria-hidden", String(!expanded));
    toggle.setAttribute("aria-controls", sidebar.id);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.title = expanded ? "Collapse sidebar" : "Expand sidebar";
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemin", String(MIN_WIDTH));
    handle.setAttribute("aria-valuemax", String(maxWidth()));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
  };
  const finish = (cancel = false) => {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (cancel) preferredWidth = previous.original;
    else savePreference(WIDTH_KEY, String(preferredWidth));
    document.body.classList.remove("sidebar-resizing");
    if (handle.hasPointerCapture(previous.pointer)) handle.releasePointerCapture(previous.pointer);
    render();
  };
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || mobile.matches || collapsed) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, width: sidebar.getBoundingClientRect().width, original: preferredWidth };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("sidebar-resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    preferredWidth = clamp(drag.width + event.clientX - drag.x);
    render();
  });
  handle.addEventListener("pointerup", (event) => {
    if (drag?.pointer === event.pointerId) finish();
  });
  handle.addEventListener("pointercancel", () => finish(true));
  handle.addEventListener("lostpointercapture", () => finish(true));
  window.addEventListener("blur", () => finish(true));
  document.addEventListener("keydown", (event) => {
    if (drag && event.key === "Escape") {
      event.preventDefault();
      finish(true);
    }
  }, true);
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    preferredWidth = event.key === "Home" ? MIN_WIDTH : event.key === "End" ? maxWidth() : clamp(clamp(preferredWidth) + (event.key === "ArrowLeft" ? -step : step));
    savePreference(WIDTH_KEY, String(preferredWidth));
    render();
  });
  handle.addEventListener("dblclick", () => {
    preferredWidth = DEFAULT_WIDTH;
    savePreference(WIDTH_KEY, String(preferredWidth));
    render();
  });
  window.addEventListener("resize", () => { finish(true); render(); });
  mobile.addEventListener("change", () => {
    document.body.classList.remove("sidebar-open");
    finish(true);
    render();
  });
  render();
  return {
    toggle() {
      finish(true);
      if (mobile.matches) document.body.classList.toggle("sidebar-open");
      else {
        collapsed = !collapsed;
        savePreference(COLLAPSED_KEY, String(collapsed));
      }
      render();
    },
  };
}
