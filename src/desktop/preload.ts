import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("notdownDesktop", {
  openVaultWindow: () => ipcRenderer.invoke("vault:welcome"),
  onCloseRequested: (callback: (id: string) => void) => {
    ipcRenderer.on("vault:save-before-close", (_event, id: string) => callback(id));
  },
  finishClose: (id: string, saved: boolean) => ipcRenderer.send("vault:close-result", id, saved === true),
});
contextBridge.exposeInMainWorld("notdownWelcome", {
  recents: () => ipcRenderer.invoke("vault:recents"),
  choose: (mode: "create" | "open") => ipcRenderer.invoke("vault:choose", mode),
  openRecent: (path: string) => ipcRenderer.invoke("vault:recent", path),
  managed: () => ipcRenderer.invoke("vault:managed"),
  createManaged: (name: string) => ipcRenderer.invoke("vault:create-managed", name),
  openManaged: (path: string) => ipcRenderer.invoke("vault:open-managed", path),
});
