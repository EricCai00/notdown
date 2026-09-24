declare global {
  interface Window {
    notdownDesktop?: {
      openVaultWindow(): Promise<void>;
      onCloseRequested(callback: (id: string) => void): void;
      finishClose(id: string, saved: boolean): void;
    };
  }
}

export function installDesktopCloseGuard(save: () => Promise<boolean>) {
  window.notdownDesktop?.onCloseRequested(async id => {
    const root = document.querySelector<HTMLElement>("#app");
    if (root) root.inert = true;
    let saved = false;
    try { saved = await save(); }
    finally {
      if (root) root.inert = false;
      window.notdownDesktop?.finishClose(id, saved);
    }
  });
}
