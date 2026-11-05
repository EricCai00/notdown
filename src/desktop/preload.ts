import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("notdownDesktop", {
  uiLanguage: {
    get: () => ipcRenderer.invoke("ui:language:get"),
    set: (value: "en" | "zh-CN") => ipcRenderer.invoke("ui:language:set", value),
    onChanged: (callback: (value: "en" | "zh-CN") => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: "en" | "zh-CN") => callback(value);
      ipcRenderer.on("ui:language:changed", listener);
      return () => ipcRenderer.removeListener("ui:language:changed", listener);
    },
  },
  notionImportClipboard: { get: () => ipcRenderer.invoke("notion:clipboard:get") },
  notionImportToken: {
    get: () => ipcRenderer.invoke("notion:token:get"),
    set: (token: string) => ipcRenderer.invoke("notion:token:set", token),
  },
  quit: () => ipcRenderer.invoke("app:quit"),
  onQuitState: (callback: (active: boolean) => void) => {
    ipcRenderer.on("vault:quit-state", (_event, active: boolean) => callback(active));
  },
  openVaultWindow: () => ipcRenderer.invoke("vault:welcome"),
  onOpenTab: (callback: (url: string) => void) => {
    ipcRenderer.on("vault:open-tab", (_event, url: string) => callback(url));
  },
  onCloseRequested: (callback: (id: string) => void) => {
    ipcRenderer.on("vault:save-before-close", (_event, id: string) => callback(id));
  },
  finishClose: (id: string, saved: boolean) => ipcRenderer.send("vault:close-result", id, saved === true),
});
contextBridge.exposeInMainWorld("notdownWelcome", {
  browse: (path: string) => ipcRenderer.invoke("vault:browse", path),
  rememberLocation: (path: string) => ipcRenderer.invoke("vault:create-location", path),
  setLocation: (path: string) => ipcRenderer.invoke("vault:location", path),
  submit: (input: object) => ipcRenderer.invoke("vault:submit", input),
  recents: () => ipcRenderer.invoke("vault:recents"),
  choose: (mode: "create" | "open") => ipcRenderer.invoke("vault:choose", mode),
  openRecent: (path: string) => ipcRenderer.invoke("vault:recent", path),
  managed: () => ipcRenderer.invoke("vault:managed"),
  createManaged: (name: string) => ipcRenderer.invoke("vault:create-managed", name),
  openManaged: (path: string) => ipcRenderer.invoke("vault:open-managed", path),
});
