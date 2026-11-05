let locks = 0;
let release: (() => void) | undefined;

/** Keep the page and its nested scrollers still while an anchored menu is open. */
export function lockDatabaseBackgroundScroll() {
  if (locks++ === 0) {
    const locked = [...document.querySelectorAll<HTMLElement>("html, body, body *")].filter(element => {
      if (element.closest(".database-popover, dialog[open]")) return false;
      const style = getComputedStyle(element);
      return [style.overflowX, style.overflowY].some(value => value === "auto" || value === "scroll");
    });
    locked.forEach(element => {
      const style = getComputedStyle(element);
      const gutter = element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      // Overlay scrollbars occupy no layout space; reserving a gutter would shift the anchor.
      if (gutter > 0 && element.scrollHeight > element.clientHeight) element.classList.add("database-scroll-locked-gutter");
      element.classList.add("database-scroll-locked");
    });
    const events = new AbortController();
    const preventOutside = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".database-popover, dialog[open]")) event.preventDefault();
    };
    document.addEventListener("wheel", preventOutside, { capture: true, passive: false, signal: events.signal });
    document.addEventListener("touchmove", preventOutside, { capture: true, passive: false, signal: events.signal });
    release = () => { events.abort(); locked.forEach(element => element.classList.remove("database-scroll-locked", "database-scroll-locked-gutter")); };
  }
  let released = false;
  return () => { if (!released) { released = true; if (--locks === 0) { release?.(); release = undefined; } } };
}
