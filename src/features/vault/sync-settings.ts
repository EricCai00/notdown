import { api, escape as e } from "../../shared/types";
import type { SyncStatus } from "../../sync/service";
import type { SyncProgress } from "../../sync/engine";
import type { CloudVault } from "../../sync/supabase";
import { nutstoreUrl } from "../../sync/webdav";
import type { SyncConflict, SyncItem } from "../../sync/protocol";
import { diffHTML } from "../pages/conflict-diff";
import "../pages/conflict-diff.css";
import "./sync-settings.css";

export type SyncHooks = { beforeSync(): Promise<boolean>; afterSync?(): Promise<void> };
const post = <T>(action: string, body: unknown = {}) => api<T>(`/sync/${action}`, { method: "POST", body: JSON.stringify(body) });
const changed = () => window.dispatchEvent(new Event("notdown-sync-changed"));
type ProgressStatus = Pick<SyncStatus, "running" | "progress" | "error">;

export async function mountSyncSettings(container: HTMLElement, hooks: SyncHooks, options: {
  existingOnly?: boolean; onStatus?(status: SyncStatus): Promise<void>;
} = {}) {
  const section = document.createElement("section"); section.className = "settings-section sync-settings";
  section.setAttribute("aria-label", "Cloud sync");
  section.innerHTML = `<h3>Cloud sync</h3><p>Your notes stay on this device and remain editable offline. Connect the same cloud notebook on your other devices.</p>
    <p class="sync-summary" data-sync-summary role="status">Loading sync settings…</p>
    <div class="sync-progress" data-sync-progress hidden>
      <p data-sync-stage role="status" aria-live="polite"></p><progress aria-label="Current sync step"></progress>
      <p class="sync-progress-current" data-sync-current></p><p data-sync-counts></p><p class="sync-progress-time" data-sync-time></p>
    </div>
    <form data-sync-login><label>Sync provider<select name="provider"><option value="supabase">Supabase</option><option value="webdav">Nutstore / WebDAV</option></select></label>
    <label><span data-url-label>Supabase project URL</span><input name="url" type="url" placeholder="https://your-project.supabase.co" required autocomplete="url"></label>
    <label data-key-label>Publishable key<input name="key" required autocomplete="off" spellcheck="false"></label>
    <label data-folder-label hidden>Remote notebook folder<input name="folder" placeholder="Notdown/My-notebook" value="Notdown/My-notebook" autocomplete="off" spellcheck="false"></label>
    <label><span data-account-label>Email</span><input name="email" type="email" required autocomplete="username"></label><label><span data-password-label>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
    <p data-login-help>Use an account created in your configured Supabase project. The password is used only to sign in.</p><button class="secondary-button" type="submit">Sign in</button></form>
    <form data-sync-connect hidden><label>Cloud notebook<select name="vault"></select></label><label data-new-name>New notebook name<input name="name" maxlength="200" value="My notebook"></label>
    <p>This connects the current local notebook. Its pages and attachments will sync with the selected cloud notebook; conflicting edits are preserved for review.</p>
    <button class="primary-button" type="submit">Enable sync</button></form>
    <div class="sync-actions" data-sync-actions hidden><button class="primary-button" type="button" data-sync-run>Sync now</button><button class="secondary-button" type="button" data-sync-pause>Pause sync</button><button class="secondary-button" type="button" data-sync-sign-in-again>Sign in again</button><button class="secondary-button" type="button" data-sync-disconnect>Disconnect</button></div>
    <output class="sync-feedback" data-sync-feedback aria-live="polite"></output><div data-sync-conflicts></div>`;
  const actions = container.querySelector(".dialog-actions"); if (actions) actions.before(section); else container.append(section);
  const feedback = section.querySelector<HTMLOutputElement>("[data-sync-feedback]")!;
  const login = section.querySelector<HTMLFormElement>("[data-sync-login]")!;
  const connect = section.querySelector<HTMLFormElement>("[data-sync-connect]")!;
  const select = connect.elements.namedItem("vault") as HTMLSelectElement;
  if (options.existingOnly) {
    section.querySelector("h3 + p")!.textContent = "Connect the existing cloud notebook from your computer. After the first download, you can edit it offline on this device.";
    connect.querySelector<HTMLElement>("[data-new-name]")!.hidden = true;
    connect.querySelector("p")!.textContent = "Download your existing cloud notebook. Future edits sync with your computer in both directions.";
  }
  const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
  let status: SyncStatus;
  let progressStatus: ProgressStatus = { running: false }, requestStartedAt = 0;
  const progressPanel = section.querySelector<HTMLElement>("[data-sync-progress]")!;
  function renderSummary(running = status?.running ?? false) {
    if (!status) return;
    const summary = section.querySelector<HTMLElement>("[data-sync-summary]")!;
    summary.textContent = !status.signedIn ? "Not connected" : `${status.email ?? "Signed in"}${status.vaultName ? ` · ${status.vaultName}` : ""} · ${running ? "Syncing…" : status.enabled ? "Sync enabled" : "Sync paused"}${status.lastSyncedAt ? ` · Last sync ${new Date(status.lastSyncedAt).toLocaleString()}` : ""}`;
    if (status.signedIn && status.provider === "webdav") summary.textContent += ` · WebDAV: ${status.folder}`;
  }
  function renderProgress(value: ProgressStatus) {
    progressStatus = value;
    renderSummary(value.running);
    const p = value.progress; progressPanel.hidden = !p;
    if (!p) return;
    const labels: Record<NonNullable<SyncProgress["phase"]>, string> = {
      preparing: "Preparing sync", reading: "Reading cloud records", applying: "Downloading and saving cloud changes",
      scanning: "Checking local changes", uploading: "Uploading local changes", finalizing: "Saving sync state", complete: "Sync completed",
    };
    const bytes = (amount: number) => amount < 1024 ? `${amount} B` : amount < 1024 * 1024 ? `${(amount / 1024).toFixed(1)} KiB` : `${(amount / 1024 / 1024).toFixed(1)} MiB`;
    const transferring = p.bytesTotal !== undefined && p.bytesCompleted !== undefined;
    const total = transferring ? p.bytesTotal : p.total, completed = transferring ? p.bytesCompleted : p.completed;
    const determinate = total !== undefined && total > 0 && completed !== undefined;
    const amount = determinate ? transferring ? `${bytes(completed!)} / ${bytes(total!)}` : `${completed} / ${total} resources` : "";
    const label = !value.running && value.error ? "Sync stopped" : labels[p.phase ?? "preparing"];
    progressPanel.querySelector("[data-sync-stage]")!.textContent = `${label}${p.batch ? ` · Batch ${p.batch}` : ""}${amount ? ` · ${amount} (${Math.floor(completed! / total! * 100)}%)` : ""}`;
    const bar = progressPanel.querySelector("progress")!;
    if (p.phase === "complete" && !value.error) { bar.max = 1; bar.value = 1; }
    else if (determinate) { bar.max = total!; bar.value = completed!; }
    else if (!value.running) { bar.max = 1; bar.value = 0; }
    else bar.removeAttribute("value");
    bar.setAttribute("aria-busy", String(value.running));
    progressPanel.dataset.state = value.error && !value.running ? "error" : value.running ? "running" : "complete";
    progressPanel.querySelector("[data-sync-current]")!.textContent = p.current ?? "";
    progressPanel.querySelector("[data-sync-counts]")!.textContent = `Downloaded ${p.downloaded} · Uploaded ${p.uploaded} · Conflicts ${p.conflicts}`;
    const seconds = Math.max(0, Math.floor(((value.running ? Date.now() : p.updatedAt ?? Date.now()) - (p.startedAt ?? Date.now())) / 1000));
    const waiting = value.running && Date.now() - (p.updatedAt ?? Date.now()) >= 15000;
    progressPanel.querySelector("[data-sync-time]")!.textContent = `Elapsed ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${waiting ? " · Waiting for the current step… Keep the app open." : value.running ? " · Keep the app open." : ""}`;
  }
  async function readProgress() {
    const value = await api<ProgressStatus>("/sync/progress");
    if (!section.isConnected || requestStartedAt && !value.running && (value.progress?.startedAt ?? 0) < requestStartedAt) return;
    renderProgress(value);
    if (value.error) feedback.textContent = value.error;
  }
  async function runSync() {
    requestStartedAt = Date.now();
    renderProgress({ running: true, progress: { uploaded: 0, downloaded: 0, conflicts: 0, phase: "preparing", startedAt: requestStartedAt, updatedAt: requestStartedAt } });
    try {
      return await post<{ uploaded: number; downloaded: number; conflicts: number }>("run");
    } catch (error) {
      renderProgress({ ...progressStatus, running: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      requestStartedAt = 0;
      try { await readProgress(); } catch { /* Keep the last visible progress if status is temporarily unavailable. */ }
    }
  }
  const provider = login.elements.namedItem("provider") as HTMLSelectElement;
  function providerFields(resetUrl = false) {
    const dav = provider.value === "webdav";
    login.querySelector("[data-url-label]")!.textContent = dav ? "WebDAV server URL" : "Supabase project URL";
    login.querySelector<HTMLElement>("[data-key-label]")!.hidden = dav; field(login, "key").required = !dav;
    login.querySelector<HTMLElement>("[data-folder-label]")!.hidden = !dav; field(login, "folder").required = dav;
    login.querySelector("[data-account-label]")!.textContent = dav ? "WebDAV account" : "Email"; field(login, "email").type = dav ? "text" : "email";
    login.querySelector("[data-password-label]")!.textContent = dav ? "Application password" : "Password";
    field(login, "password").setAttribute("aria-label", dav ? "Application password" : "Password");
    login.querySelector("[data-login-help]")!.textContent = dav
      ? options.existingOnly ? "Use your Nutstore application password and the same remote folder as your computer."
        : "For Nutstore, use the application password from Account → Security → Third-party applications. Both devices must use the same remote folder. Connection testing creates and removes a temporary test folder; notebook sync preserves original files."
      : options.existingOnly ? "Use the same Supabase project and account as your computer."
        : "Use an account created in your configured Supabase project. The password is used only to sign in.";
    if (resetUrl) field(login, "url").value = dav ? nutstoreUrl : "";
  }
  provider.onchange = () => providerFields(true);
  if (options.existingOnly) { provider.value = "webdav"; providerFields(true); }
  const busy = (value: boolean) => section.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea").forEach(control => control.disabled = value);
  const fail = (error: unknown) => { feedback.textContent = error instanceof Error ? error.message : String(error); };
  async function refresh() {
    status = await api<SyncStatus>("/sync/status"); if (!section.isConnected) return;
    if (!requestStartedAt) renderProgress(status);
    renderSummary();
    login.hidden = status.signedIn; connect.hidden = !status.signedIn || !!status.vaultId;
    section.querySelector<HTMLElement>("[data-sync-actions]")!.hidden = !status.signedIn;
    section.querySelector<HTMLButtonElement>("[data-sync-run]")!.hidden = !status.vaultId;
    const pause = section.querySelector<HTMLButtonElement>("[data-sync-pause]")!; pause.hidden = !status.vaultId; pause.textContent = status.enabled ? "Pause sync" : "Resume sync";
    if (!status.signedIn) { field(login, "url").value ||= status.url; field(login, "key").value ||= status.key; }
    if (status.signedIn && !status.vaultId) {
      const vaults = await api<CloudVault[]>("/sync/vaults");
      select.replaceChildren(...(options.existingOnly ? [] : [new Option("Create a new cloud notebook", "")]), ...vaults.map(vault => new Option(vault.name, vault.id)));
      if (options.existingOnly && !vaults.length) {
        select.add(new Option("No existing cloud notebook found", ""));
        feedback.textContent = "Create and sync this notebook on your computer first, then sign in here using the same server and remote folder.";
      }
    }
    if (status.error) feedback.textContent = status.error;
    if (status.nextSyncAt && status.nextSyncAt > Date.now() + 60000) feedback.textContent += ` Next automatic attempt after ${new Date(status.nextSyncAt).toLocaleTimeString()}.`;
    await conflicts();
    await options.onStatus?.(status);
  }
  async function action(work: () => Promise<void>) {
    busy(true); feedback.textContent = "";
    try { await work(); changed(); await refresh(); }
    catch (error) {
      fail(error);
      try { await refresh(); } catch { /* Keep the original failure if status cannot be refreshed. */ }
    } finally { busy(false); }
  }
  login.onsubmit = event => { event.preventDefault(); void action(async () => {
    try {
      await post("sign-in", { provider: provider.value, url: field(login, "url").value, key: field(login, "key").value.trim(), folder: field(login, "folder").value.trim(), email: field(login, "email").value, password: field(login, "password").value });
      if (provider.value === "webdav") feedback.textContent = options.existingOnly
        ? "WebDAV connection and conditional-write protection verified. Select your existing cloud notebook."
        : "WebDAV connection and conditional-write protection verified. Select or create the notebook in this remote folder.";
    }
    finally { field(login, "password").value = ""; }
  }); };
  select.onchange = () => { connect.querySelector<HTMLElement>("[data-new-name]")!.hidden = !!options.existingOnly || !!select.value; };
  connect.onsubmit = event => { event.preventDefault(); void action(async () => {
    if (!await hooks.beforeSync()) throw new Error("Finish or save your current edit before connecting sync.");
    if (options.existingOnly && !select.value) throw new Error("Choose an existing cloud notebook created on your computer.");
    status = await post<SyncStatus>("connect", { vaultId: select.value || undefined, name: field(connect, "name").value });
    if (options.existingOnly) feedback.textContent = "Downloading your cloud notebook… Keep the app open until the first sync completes.";
    await runSync(); await hooks.afterSync?.(); feedback.textContent = "First sync completed.";
  }); };
  section.querySelector<HTMLButtonElement>("[data-sync-run]")!.onclick = () => void action(async () => {
    if (!status.enabled) throw new Error("Resume sync before syncing this notebook.");
    if (!await hooks.beforeSync()) throw new Error("Finish or save your current edit before syncing.");
    const result = await runSync(); await hooks.afterSync?.();
    feedback.textContent = `Synced ${result.uploaded} uploads and ${result.downloaded} downloads.${result.conflicts ? ` ${result.conflicts} conflict(s) need review.` : ""}`;
  });
  section.querySelector<HTMLButtonElement>("[data-sync-pause]")!.onclick = () => void action(async () => { await post("pause", { paused: status.enabled }); });
  section.querySelector<HTMLButtonElement>("[data-sync-sign-in-again]")!.onclick = () => {
    provider.value = status.provider ?? "supabase"; providerFields(); field(login, "folder").value = status.folder ?? "Notdown/My-notebook";
    login.hidden = false; field(login, "url").value = status.url; field(login, "key").value = status.key;
    field(login, "email").value = status.email ?? ""; field(login, "password").focus();
  };
  section.querySelector<HTMLButtonElement>("[data-sync-disconnect]")!.onclick = () => void action(async () => { await post("disconnect"); feedback.textContent = "Disconnected. Your local notes and cloud notebook are preserved."; });

  async function conflicts() {
    const entries = await api<(SyncConflict & { localRevision: string })[]>("/sync/conflicts");
    const list = section.querySelector<HTMLElement>("[data-sync-conflicts]")!;
    const previous = new Map([...list.querySelectorAll<HTMLDetailsElement>(".sync-conflict")].map(panel => [panel.dataset.conflictId, panel]));
    list.replaceChildren();
    if (!entries.length) return;
    const heading = document.createElement("h4"); heading.textContent = `${entries.length} sync conflict(s) need review`; list.append(heading);
    const source = (item: SyncItem | null) => item?.value === null || !item ? "[Deleted or not yet created]" : item.kind === "page" || item.kind === "person" ? item.value.source : JSON.stringify(item.value, null, 2);
    for (const entry of entries) {
      const existing = previous.get(entry.id);
      if (existing?.dataset.localRevision === entry.localRevision && existing.dataset.remoteVersion === String(entry.remote.version)) {
        list.append(existing); continue; // Keep the open review and unsaved merge text when its versions have not changed.
      }
      const panel = document.createElement("details"); panel.className = "sync-conflict";
      panel.dataset.conflictId = entry.id; panel.dataset.localRevision = entry.localRevision; panel.dataset.remoteVersion = String(entry.remote.version);
      const name = entry.local.value?.metadata?.title || entry.remote.item.value?.metadata?.title || entry.key;
      panel.innerHTML = `<summary>${e(name)}</summary><p>Compare this device with the cloud version. Both originals remain in history.</p>
        <div class="conflict-legend"><span class="diff-count-removed">− This device${entry.local.value === null ? " (deleted)" : ""}</span><span class="diff-count-added">+ Cloud${entry.remote.item.value === null ? " (deleted)" : ""}</span></div>
        <div class="conflict-diff">${diffHTML(source(entry.local), source(entry.remote.item))}</div><details><summary>Last shared version</summary><pre data-base></pre></details>
        <div data-merge></div><div class="sync-actions"><button type="button" class="secondary-button" data-choice="local">Keep this device</button><button type="button" class="secondary-button" data-choice="remote">Use cloud version</button></div>`;
      panel.querySelector("[data-base]")!.textContent = source(entry.base);
      const merge = panel.querySelector<HTMLElement>("[data-merge]")!;
      let body: HTMLTextAreaElement | undefined, metadata: HTMLTextAreaElement | undefined, bodyEdited = false;
      const template = entry.local.value ? entry.local : entry.remote.item;
      if (template.value && template.kind !== "asset") {
        const details = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Edit merged version"; details.append(summary);
        const label = document.createElement("label"); label.textContent = template.kind === "metadata" ? "Merged resource (JSON)" : "Merged source";
        body = document.createElement("textarea"); body.rows = 8; body.value = source(template); body.setAttribute("aria-label", label.textContent); body.oninput = () => { bodyEdited = true; }; label.append(body); details.append(label);
        if (template.kind === "page") {
          const metadataLabel = document.createElement("label"); metadataLabel.textContent = "Merged page properties (JSON)";
          metadata = document.createElement("textarea"); metadata.rows = 5; metadata.value = JSON.stringify(template.value.metadata, null, 2); metadata.setAttribute("aria-label", metadataLabel.textContent); metadataLabel.append(metadata); details.append(metadataLabel);
          const originalProperties = document.createElement("pre"); originalProperties.textContent = `Cloud properties:\n${JSON.stringify(entry.remote.item.value?.metadata ?? null, null, 2)}`; details.append(originalProperties);
        }
        const save = document.createElement("button"); save.type = "button"; save.className = "primary-button"; save.textContent = "Save merged version"; save.dataset.choice = "merged"; details.append(save); merge.append(details);
      }
      panel.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(button => { button.onclick = () => void action(async () => {
        if (!await hooks.beforeSync()) throw new Error("Save or recover your current draft before resolving this conflict.");
        let merged: SyncItem | undefined;
        if (button.dataset.choice === "merged") {
          merged = structuredClone(template);
          if (merged.kind === "metadata") merged.value = JSON.parse(body!.value);
          else { merged.value!.source = bodyEdited ? body!.value : template.value!.source; if (metadata) merged.value!.metadata = JSON.parse(metadata.value); }
        }
        await post("resolve", { id: entry.id, choice: button.dataset.choice, baseRevision: entry.localRevision, merged });
        await hooks.afterSync?.(); feedback.textContent = "Conflict resolved locally. The chosen version will be uploaded on the next sync.";
      }); });
      list.append(panel);
    }
  }
  busy(true);
  try { await refresh(); } catch (error) { fail(error); } finally { busy(false); }
  // Poll only in this mounted panel, without scanning the notebook or making cloud requests.
  async function monitor() {
    if (!section.isConnected) return;
    try { await readProgress(); } catch { /* A pending request remains visible, including its elapsed time. */ }
    if (section.isConnected) { renderProgress(progressStatus); setTimeout(() => { void monitor(); }, 750); }
  }
  void monitor();
}

/** Foreground-only scheduling: browsers/WebViews are not reliable background workers. */
export function installSyncScheduler(hooks: SyncHooks) {
  let running = false, disposed = false, debounce: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    if (disposed || running || document.visibilityState !== "visible" || !navigator.onLine) return;
    running = true;
    try {
      const status = await api<SyncStatus>("/sync/status");
      if (!disposed && status.enabled && !status.running && !status.needsSignIn && (status.nextSyncAt ?? 0) <= Date.now() && await hooks.beforeSync()) { await post("run"); if (!disposed) await hooks.afterSync?.(); }
    } catch { /* Status retains the failure; local saving remains independent. */ }
    finally { running = false; }
  }
  const schedule = () => { clearTimeout(debounce); debounce = setTimeout(() => { void tick(); }, 5000); };
  const wake = () => { void tick(); };
  const interval = setInterval(wake, 30000);
  document.addEventListener("input", schedule); document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake); window.addEventListener("notdown-sync-changed", schedule);
  schedule();
  return () => { disposed = true; clearInterval(interval); clearTimeout(debounce); document.removeEventListener("input", schedule); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); window.removeEventListener("notdown-sync-changed", schedule); };
}
