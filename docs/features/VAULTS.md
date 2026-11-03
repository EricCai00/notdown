# Knowledge bases

**English** · [简体中文](VAULTS.zh-CN.md)

The browser vault manager and desktop launcher share one picker. It lists known vaults, including folders outside the default location, without moving their contents. The current browser vault is marked and cannot be opened again from its own row.

Choose **Create a new vault**, enter a name, and check the complete destination shown below the form. **Advanced options → Parent folder (this vault only)** overrides the destination for this creation without changing the default. Both routes create a named child folder and reject existing folders rather than overwriting them.

Choose **Open an existing vault** to select a folder containing `pages/`. Desktop provides a native folder picker. Browser paths refer to the computer running the Notdown service, not necessarily the computer displaying the browser. The browser can open another tab; the desktop launcher opens a vault window.

**Default save location → Change** changes the parent folder for future vaults. Select an existing writable folder that is not itself a vault. Existing vaults remain registered at their original locations. This operation does not migrate notes or change the currently open vault.

Fresh Windows installations use the actual Windows Documents known folder with a `Notdown` child. Existing configured locations and legacy folders containing vaults remain in use. The Documents folder may be redirected by Windows; its path is resolved through the operating system. Application location preferences are stored separately under the user's local application-data directory. An explicitly saved location takes precedence over `NOTDOWN_DATA_PATH`; `VAULT_PATH` still selects the initial browser vault. Tests use isolated profiles and temporary folders.

Changing a browser vault first saves pending edits. A save conflict stops the switch and preserves the recoverable draft. Default-location preferences do not rewrite vault files.
