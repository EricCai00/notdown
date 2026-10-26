export {};
type WelcomeAPI = { recents(): Promise<string[]>; choose(mode: "create" | "open"): Promise<void>; openRecent(path: string): Promise<void>;
  managed(): Promise<{ dataPath: string; vaults: { name: string; path: string }[] }>; createManaged(name: string): Promise<void>; openManaged(path: string): Promise<void> };
const welcome = (window as unknown as { notdownWelcome: WelcomeAPI }).notdownWelcome;
const status = document.querySelector<HTMLElement>("#status")!;
async function run(action: () => Promise<void>) {
  document.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = true);
  status.textContent = "Opening vault…";
  try { await action(); status.textContent = ""; }
  catch (error) { status.textContent = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error); }
  finally { document.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = false); }
}
document.querySelector("#create")!.addEventListener("click", () => void run(() => welcome.choose("create")));
document.querySelector("#open")!.addEventListener("click", () => void run(() => welcome.choose("open")));
document.querySelector("#managed-form")!.addEventListener("submit", event => {
  event.preventDefault();
  void run(() => welcome.createManaged(document.querySelector<HTMLInputElement>("#vault-name")!.value.trim()));
});
void welcome.managed().then(({ dataPath, vaults }) => {
  document.querySelector("#data-path")!.textContent = dataPath;
  const list = document.querySelector("#managed-vaults")!;
  for (const vault of vaults) {
    const button = document.createElement("button"); button.textContent = vault.name;
    button.addEventListener("click", () => void run(() => welcome.openManaged(vault.path))); list.append(button);
  }
}).catch(error => { status.textContent = String(error); });
void welcome.recents().then(paths => {
  const list = document.querySelector("#recents")!;
  if (!paths.length) { list.textContent = "Your vaults will appear here."; return; }
  for (const path of paths) {
    const button = document.createElement("button");
    button.textContent = path.split(/[\\/]/).filter(Boolean).at(-1) || path;
    const detail = document.createElement("span"); detail.textContent = path; button.append(detail);
    button.addEventListener("click", () => void run(() => welcome.openRecent(path)));
    list.append(button);
  }
}).catch(error => { status.textContent = String(error); });
