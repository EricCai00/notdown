/** Only the overflowing data area uses the page viewport; prose and toolbar keep their normal width. */
export function installInlineDatabaseLayout(host: HTMLElement) {
  let frame = 0;
  const update = () => {
    frame = 0;
    const data = host.querySelector<HTMLElement>(".database-table-scroll"), viewport = host.closest<HTMLElement>("#main, #mobile-content");
    if (!data || !viewport) return;
    data.style.width = ""; data.style.marginLeft = "";
    if (host.closest(".pm-columns, .pm-column")) return;
    const base = host.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    if (data.scrollWidth <= base.width + 24 || bounds.width <= base.width + 48) return;
    const left = Math.max(bounds.left + 24, 0), right = Math.min(bounds.right - 24, innerWidth - 16);
    data.style.width = `${Math.max(base.width, right - left)}px`; data.style.marginLeft = `${left - base.left}px`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule); resize.observe(host); const viewport = host.closest<HTMLElement>("#main, #mobile-content"); if (viewport) resize.observe(viewport);
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.type === "childList" || record.target instanceof HTMLTableElement)) schedule();
  });
  mutations.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] }); schedule();
  return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); };
}
