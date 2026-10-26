import { api } from "../../shared/types";
export async function mountLinkConnections(container: HTMLElement) {
  const section = document.createElement("section");
  section.className = "settings-section link-connection-settings";
  section.innerHTML =
    "<h3>Link previews</h3><p>GitHub public links work without a token. For private repositories, use a token with read access to the relevant contents, issues and pull requests. OneDrive requires a Microsoft Graph access token with Files.ReadWrite permission and access to the shared file. Expired tokens must be replaced here.</p><p>Tokens are stored only in this vault’s local connection settings. They are never saved in page Markdown. Connected previews fetch their linked content when opened and once per minute while visible.</p>";
  container.append(section);
  const outputs = new Map<string, HTMLOutputElement>();
  for (const [provider, label] of [
    ["github", "GitHub"],
    ["onedrive", "OneDrive"],
  ]) {
    const form = document.createElement("form"),
      row = document.createElement("label"),
      input = document.createElement("input");
    row.textContent = `${label} token`;
    input.type = "password";
    input.autocomplete = "new-password";
    input.setAttribute("aria-label", `${label} token`);
    input.placeholder = "Leave blank to keep saved token";
    row.append(input);
    const save = document.createElement("button"),
      disconnect = document.createElement("button"),
      output = document.createElement("output");
    output.setAttribute("aria-live", "polite");
    save.type = "submit";
    save.textContent = `Connect ${label}`;
    disconnect.type = "button";
    disconnect.textContent = `Disconnect ${label}`;
    form.append(row, save, disconnect, output);
    section.append(form);
    outputs.set(provider, output);
    const update = async (remove: boolean) => {
      save.disabled = disconnect.disabled = true;
      try {
        const status = await api<Record<string, boolean>>(
          "/link-previews/settings",
          {
            method: "PUT",
            body: JSON.stringify({
              provider,
              token: input.value,
              disconnect: remove,
            }),
          },
        );
        input.value = "";
        output.textContent = status[provider]
          ? "Token saved locally. Preview requests will check its permissions."
          : "Disconnected.";
        window.dispatchEvent(new Event("notdown-link-connections"));
      } catch (e) {
        output.textContent = (e as Error).message;
      } finally {
        save.disabled = disconnect.disabled = false;
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      void update(false);
    };
    disconnect.onclick = () => {
      void update(true);
    };
  }
  try {
    const status = await api<Record<string, boolean>>(
      "/link-previews/settings",
    );
    if (section.isConnected)
      for (const [provider, output] of outputs)
        output.textContent = status[provider]
          ? "A token is saved locally."
          : provider === "github"
            ? "Public links available. No token saved."
            : "Not connected.";
  } catch (e) {
    for (const output of outputs.values())
      output.textContent = (e as Error).message;
  }
}
