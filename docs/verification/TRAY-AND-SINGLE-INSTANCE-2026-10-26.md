<a id="windows-托盘驻留与单实例2026-10-26"></a>

# Windows tray residence and single instance (2026-10-26)

**English** · [简体中文](TRAY-AND-SINGLE-INSTANCE-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- Apply to create a system tray icon, left-click or menu **Open Notdown** to restore the most recent existing window; minimize the window and restore it first. Restore the new welcome page or restart the vault service.
- When a normal window is closed, the page, database, and conflict save checks are first inherited, and then hidden in the tray; windows, labels, drafts, and local services are retained. The welcome page can also be hidden, and the welcome page for completed tasks will be destroyed after selecting the vault.
- The same user configuration uses the Electron single-instance lock; the second launch exits itself and notifies the existing instance of the recovery window. Normal multiple vault windows still belong to the same instance.
- The tray and desktop application menus provide **Quit Notdown**. Pause all vault window input before exiting, wait for all saves to pass, then remove the tray and exit; if any fails, restore the window and input, and do not destroy the saved windows one by one in advance.
- Restoring the window when closing the save is not yet complete will not hide it again after the save is complete. Save responses, failures and timeouts are still checked against the main process via restricted preload.

Tray residency does not constitute a background cloud synchronization commitment; cloud synchronization of hidden windows is still subject to existing foreground scheduling restrictions. vault content, identities, and CAS rules are not migrated.

<a id="验证"></a>

## Validation

- Full unit test: 1, 051 passed, 5 skipped, 0 failed.
- Browser builds with app menus, tab saving, and conflict regressions: 9 passed.
- Windows actual unpacking product: 8 desktop tests all passed.
- Desktop testing uses isolated user configuration, temporary vault and independent Electron process; covers real Tray objects, menu callbacks, welcome page closing, hiding and restoring after saving, actual second startup, minimized restore, multi-window exit failure and retry.

The second launch of the test directly calls the Electron actual executable, rather than the command line wrapper process used by Playwright on Windows. The original program and vault are not used for testing.

The log is located in `.run/logs/tray-*.log` of the local machine; the icon arrangement and folding of the Windows notification area are managed by the system.

<a id="本机更新"></a>

## Native update

The unpacked product that passed the test has been updated to the existing computer installation directory, and the program before the update is saved in `.run/desktop-backups/before-tray-20261026/`. `Notdown.exe` and `resources/app.asar` in the installation directory have been compared with SHA-256 and match the test product.

Actual verification on this machine: After the window is closed normally, the main process still resides. The new process that starts exe again exits normally, and the original main process and window are restored. The update retains the original vault and user configuration.
