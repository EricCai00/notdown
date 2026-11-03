import { setUIText } from "../shared/i18n";
import { api } from "../shared/types";
import { mountLinkConnections } from "../features/links/link-connection-settings";
export async function mountServiceSettings(container: HTMLElement) {
  void mountLinkConnections(container);
  const section = document.createElement("section"); section.className = "settings-section";
  section.innerHTML = `<h3 data-i18n="OpenAI-compatible services">OpenAI-compatible services</h3><p data-i18n="Used when you click Generate or Transcribe. Model IDs are supplied by your provider.">Used when you click Generate or Transcribe. Model IDs are supplied by your provider.</p><form><label><span data-i18n="API endpoint">API endpoint</span><input name="endpoint" aria-label="API endpoint" required data-i18n-aria-label="API endpoint"></label><label><span data-i18n="Text model">Text model</span><input name="model" aria-label="Text model" data-i18n-aria-label="Text model"></label><label><span data-i18n="Transcription model">Transcription model</span><input name="transcriptionModel" aria-label="Transcription model" data-i18n-aria-label="Transcription model"></label><label><span data-i18n="API key">API key</span><input name="apiKey" aria-label="API key" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved key" data-i18n-placeholder="Leave blank to keep the saved key" data-i18n-aria-label="API key"></label><label class="switch-row"><span data-i18n="Remove saved API key">Remove saved API key</span><input type="checkbox" name="clearKey"></label><button type="submit" class="secondary-button" data-i18n="Save service settings">Save service settings</button><output aria-live="polite"></output></form>`;
  container.append(section);
  const reminders = document.createElement("section"); reminders.className = "settings-section reminder-settings";
  reminders.innerHTML = `<h3 data-i18n="Local reminders">Local reminders</h3><p data-i18n="Date mentions can carry a reminder date and time. Reminders appear while this app is open; missed reminders appear when it reopens.">Date mentions can carry a reminder date and time. Reminders appear while this app is open; missed reminders appear when it reopens.</p><button type="button" data-i18n="Enable desktop notifications">Enable desktop notifications</button><output aria-live="polite"></output>`;
  reminders.querySelector("button")!.onclick = async () => {
    reminders.querySelector("output")!.textContent = typeof Notification === "undefined" ? "Desktop notifications are unavailable in this browser." : "Notification permission: " + await Notification.requestPermission();
  };
  container.append(reminders);
  const form = section.querySelector("form")!, output = section.querySelector("output")!;
  const busy = (value: boolean) => form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach(control => control.disabled = value);
  busy(true);
  try {
    const values = await api<Record<string, string | boolean>>("/services/settings");
    if (!section.isConnected) return;
    for (const key of ["endpoint", "model", "transcriptionModel"]) (form.elements.namedItem(key) as HTMLInputElement).value = String(values[key] || "");
    setUIText(output, values.hasKey ? "A key is saved locally." : "No API key saved.");
  } catch (error) { output.textContent = (error as Error).message; }
  finally { busy(false); }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form)); values.clearKey = String((form.elements.namedItem("clearKey") as HTMLInputElement).checked);
    busy(true);
    try {
      await api("/services/settings", { method: "PUT", body: JSON.stringify({ ...values, clearKey: values.clearKey === "true" }) });
      (form.elements.namedItem("apiKey") as HTMLInputElement).value = "";
      (form.elements.namedItem("clearKey") as HTMLInputElement).checked = false;
      setUIText(output, "Service settings saved.");
    } catch (error) { output.textContent = (error as Error).message; }
    finally { busy(false); }
  });
}
