import { api } from "./types";
import { mountLinkConnections } from "./link-connection-settings";
export async function mountServiceSettings(container: HTMLElement) {
  void mountLinkConnections(container);
  const section = document.createElement("section"); section.className = "settings-section";
  section.innerHTML = '<h3>OpenAI-compatible services</h3><p>Used when you click Generate or Transcribe. Model IDs are supplied by your provider.</p><form><label>API endpoint<input name="endpoint" aria-label="API endpoint" required></label><label>Text model<input name="model" aria-label="Text model"></label><label>Transcription model<input name="transcriptionModel" aria-label="Transcription model"></label><label>API key<input name="apiKey" aria-label="API key" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved key"></label><label><input type="checkbox" name="clearKey">Remove saved API key</label><button type="submit" class="secondary-button">Save service settings</button><output aria-live="polite"></output></form>';
  container.append(section);
  const reminders = document.createElement("section"); reminders.className = "settings-section";
  reminders.innerHTML = '<h3>Local reminders</h3><p>Date mentions can carry a reminder date and time. Reminders appear while this app is open; missed reminders appear when it reopens.</p><button type="button">Enable desktop notifications</button><output aria-live="polite"></output>';
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
    output.textContent = values.hasKey ? "A key is saved locally." : "No API key saved.";
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
      output.textContent = "Service settings saved.";
    } catch (error) { output.textContent = (error as Error).message; }
    finally { busy(false); }
  });
}
