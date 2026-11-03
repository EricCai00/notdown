import { setUIAttribute, setUIText, t } from "../shared/i18n";
import { api } from "../shared/types";
import { runtimeKeys, type RuntimeSettings, type RuntimeSettingsSnapshot, type RuntimeCheck } from "../shared/runtime-settings";

export async function mountRuntimeSettings(container: HTMLElement) {
  const section = document.createElement("section");
  section.className = "settings-section runtime-settings";
  setUIAttribute(section, "aria-label", "Code execution");
  section.innerHTML = `<h3 data-i18n="Code execution">Code execution</h3><p data-i18n="Choose the interpreters for this vault. Enter executable paths without quotes or arguments. Leave blank to use startup configuration or automatic detection.">Choose the interpreters for this vault. Enter executable paths without quotes or arguments. Leave blank to use startup configuration or automatic detection.</p><form><div data-interpreters></div><details><summary data-i18n="Advanced: Jupyter and Pandoc">Advanced: Jupyter and Pandoc</summary><p data-i18n="Python also connects to Julia through Jupyter. Install jupyter_client and ipykernel in the selected Python environment; Julia needs IJulia. A named Python kernel uses its own interpreter. With no named kernel, Python cells use the selected Python executable.">Python also connects to Julia through Jupyter. Install jupyter_client and ipykernel in the selected Python environment; Julia needs IJulia. A named Python kernel uses its own interpreter. With no named kernel, Python cells use the selected Python executable.</p><div data-advanced></div></details><p data-i18n="Observable JavaScript runs in the built-in browser runtime and needs no interpreter path.">Observable JavaScript runs in the built-in browser runtime and needs no interpreter path.</p><p data-i18n="Saving restarts notebook sessions and clears their variables. The next run uses the new settings. Paths are stored locally for this vault.">Saving restarts notebook sessions and clears their variables. The next run uses the new settings. Paths are stored locally for this vault.</p><button type="submit" class="secondary-button" data-i18n="Save interpreter settings">Save interpreter settings</button><output data-status aria-live="polite"></output></form>`;
  const actions = container.querySelector(".dialog-actions");
  if (actions) actions.before(section); else container.append(section);
  const form = section.querySelector("form")!, status = section.querySelector<HTMLOutputElement>("[data-status]")!;
  const fields: [keyof RuntimeSettings, string, string, string?][] = [
    ["rscript", "Rscript path", "Auto-detect Rscript", "r"],
    ["python", "Python path", "Auto-detect Python with jupyter_client", "python"],
    ["julia", "Julia path", "Use the installed IJulia kernel's executable", "julia"],
    ["pythonKernel", "Python kernel name", "Match an installed Python kernel"],
    ["juliaKernel", "Julia kernel name", "Match an installed Julia kernel"],
    ["jupyterDataDir", "Jupyter data directory", "Use Jupyter's default directories"],
    ["pandoc", "Pandoc path", "Auto-detect Pandoc (R Markdown)"],
  ];
  let revision = "";
  const values = () => Object.fromEntries(runtimeKeys.map(key => [key, (form.elements.namedItem(key) as HTMLInputElement).value])) as RuntimeSettings;
  const busy = (value: boolean) => form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach(control => control.disabled = value);
  for (const [key, title, placeholder, language] of fields) {
    const row = document.createElement("div"); row.className = "runtime-setting";
    const label = document.createElement("label"); setUIText(label, title);
    const input = document.createElement("input"); input.name = key; setUIAttribute(input, "placeholder", placeholder);
    input.autocomplete = "off"; input.spellcheck = false; input.maxLength = 2048;
    label.append(input); row.append(label);
    if (language) {
      const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button";
      setUIText(check, "Check"); check.setAttribute("aria-label", `Check ${language === "r" ? "R" : language === "python" ? "Python" : "Julia"}`);
      const output = document.createElement("output"); output.setAttribute("aria-live", "polite");
      check.onclick = async () => {
        busy(true); setUIText(output, "Checking interpreter and dependencies…");
        try {
          const result = await api<RuntimeCheck>("/runtimes/check", { method: "POST", body: JSON.stringify({ language, settings: values() }) });
          output.textContent = `${t(result.available ? "Ready" : "Unavailable")}\n${result.detail}`;
        } catch (error) { output.textContent = (error as Error).message; }
        finally { busy(false); }
      };
      row.append(check, output);
    }
    section.querySelector(language ? "[data-interpreters]" : "[data-advanced]")!.append(row);
  }
  busy(true);
  try {
    const result = await api<RuntimeSettingsSnapshot>("/runtimes/settings");
    if (!section.isConnected) return;
    revision = result.revision;
    for (const key of runtimeKeys) {
      const input = form.elements.namedItem(key) as HTMLInputElement;
      input.value = result.settings[key];
      if (result.inherited[key]) { input.placeholder = `Startup: ${result.inherited[key]}`; input.title = input.placeholder; }
    }
    busy(false);
  } catch (error) { status.textContent = (error as Error).message; }
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!revision) return;
    busy(true); setUIText(status, "Saving…");
    try {
      const result = await api<RuntimeSettingsSnapshot>("/runtimes/settings", { method: "PUT", body: JSON.stringify({ settings: values(), baseRevision: revision }) });
      revision = result.revision;
      window.dispatchEvent(new Event("notdown-runtime-settings-changed"));
      setUIText(status, "Interpreter settings saved. Notebook sessions have restarted; run your code to begin.");
    } catch (error) { status.textContent = (error as Error).message; }
    finally { busy(false); }
  });
}
