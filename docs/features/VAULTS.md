# Knowledge bases

**English** · [简体中文](VAULTS.zh-CN.md)

The browser vault manager and desktop launcher share one picker. It lists known vaults, including folders outside the default location, without moving their contents. The current browser vault is marked and cannot be opened again from its own row.

**Create a new vault** and **Open an existing vault** are always visible. To create a vault, enter its name and choose a **Save location** using **Browse…** or a typed path. Check the complete destination below the form. Notdown creates a named child folder and rejects existing folders rather than overwriting them.

**Save location** starts empty until you enter or select a folder. The last input is remembered even if you close the picker without creating a vault, and returns after restarting. This preference is shared by the browser and desktop when they use the same application settings file. It does not move existing vaults or change their contents.

To open a vault, choose its folder containing `pages/`. Both path fields have a **Browse…** button. On Windows, desktop and browser use the full system folder picker, with an address bar, navigation pane, and search; the browser opens it through the local Notdown service. Canceling preserves the previous input. On other browser-service platforms, enter the path manually. Browser paths refer to the computer running Notdown, and browsing requires a local connection. The browser can open another tab; the desktop launcher opens a vault window.

Fresh Windows installations use the actual Windows Documents known folder with a `Notdown` child. Existing configured locations and legacy folders containing vaults remain in use. The Documents folder may be redirected by Windows; its path is resolved through the operating system. Application location preferences are stored separately under the user's local application-data directory. An explicitly saved location takes precedence over `NOTDOWN_DATA_PATH`; `VAULT_PATH` still selects the initial browser vault. Tests use isolated profiles and temporary folders.

Changing a browser vault first saves pending edits. A save conflict stops the switch and preserves the recoverable draft. Location preferences do not rewrite vault files.

Browser vault addresses use `/v/<id>/`. New addresses take the first 16 hexadecimal characters of the SHA-256 hash of the canonical folder path (lowercase on Windows). Moving or renaming the folder changes this address; reopen the moved folder through the picker. A short-ID collision is rejected rather than routing to another vault. This ID is a routing key, not an access token.

Existing 64-character addresses remain valid at the same folder path, including page/view links, API calls and attachments. Their full hash is checked, and they are not automatically redirected to the short address, preserving browser drafts stored under the old URL. New picker entries use the short address. No persistent ID file is added to the vault.
