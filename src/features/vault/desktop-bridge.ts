declare global {
  interface Window {
    notdownDesktop?: {
      quit(): Promise<void>;
      onQuitState(callback: (active: boolean) => void): void;
      openVaultWindow(): Promise<void>;
      onOpenTab?(callback: (url: string) => void): void;
      onCloseRequested(callback: (id: string) => void): void;
      finishClose(id: string, saved: boolean): void;
    };
  }
}

export function installDesktopCloseGuard(save: () => Promise<boolean>) {
  let quitting = false;
  const setInert = (active: boolean) => {
    const root = document.querySelector<HTMLElement>("#app");
    if (root) root.inert = active || root.getAttribute("aria-busy") === "true";
  };
  window.notdownDesktop?.onQuitState(active => { quitting = active; setInert(active); });
  for (const name of ["keydown", "pointerdown", "click"] as const) window.addEventListener(name, event => {
    if (quitting) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true });
  window.notdownDesktop?.onCloseRequested(async id => {
    const root = document.querySelector<HTMLElement>("#app");
    if (root) root.inert = true;
    let saved = false;
    try { saved = await save(); }
    finally {
      setInert(quitting);
      window.notdownDesktop?.finishClose(id, saved);
    }
  });
}
