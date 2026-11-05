<a id="运行与开发指南"></a>

# Development guide

**English** · [简体中文](DEVELOPMENT.zh-CN.md)

This page covers running from source, selecting a vault, restarting services and running tests. Start with the project [README](../../README.md) for first use, and the [repository layout](REPOSITORY.md) for file ownership.

<a id="环境与启动"></a>

## Requirements and startup

Use Node.js 24 and npm. Run these commands in the repository directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317) in your browser; the local API is at `http://127.0.0.1:4318`. Closing the terminal or pressing Ctrl+C stops the development services. Pandoc is optional and unnecessary for ordinary editing; notebooks and external renderers require their respective runtimes.

Run the Windows desktop application with `npm run desktop`. Packaging, native folder selection and separate-window behavior are described in the [desktop guide](../features/DESKTOP-AND-IMPORT.md).

<a id="选择知识库"></a>

## Selecting a vault

Each vault occupies a separate directory containing `pages/`, `assets/`, `metadata.json`, `.notdown/` and `.history/`. Vaults sit directly inside the data directory, such as `D:\ProgramData\Notdown\Default\` and `D:\ProgramData\Notdown\Work\`, without an extra `vaults/` level. The desktop welcome page can create or open named vaults in the data directory, or select a folder elsewhere.

In the browser, create, open and switch vaults from the sidebar heading or **Manage knowledge bases** in settings without restarting the service; see [vault management](../features/DESKTOP-AND-IMPORT.md#usage). The browser service routes `/v/<目录身份>/` to a separate `createApp` for each vault. The default root URL remains attached to the startup vault; APIs and attachments follow their URL rather than a global current-vault switch.

The default data directory is `%LOCALAPPDATA%\Notdown` on Windows and `$XDG_DATA_HOME/Notdown` on other platforms (or `~/.local/share/Notdown` if unset), with `Default` as the default vault name. If no new data directory is configured and the repository already contains legacy `vault/pages/`, that vault remains in use without automatic migration. To specify a single vault, set `VAULT_PATH`, for example in PowerShell:

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

You can also save paths in the local `.env` file at the repository root for `npm run dev`, `npm start` and `start.cmd`, without setting environment variables each time:

```dotenv
NOTDOWN_DATA_PATH=D:\ProgramData\Notdown
NOTDOWN_VAULT_NAME=Default
```

Existing terminal environment variables override `.env`; `VAULT_PATH` overrides the data directory and vault name. The source desktop app also reads local `.env`. The packaged app accepts a data directory through environment variables and otherwise uses the platform defaults above. Isolated desktop tests use a separate temporary data directory.

Git ignores this file and the legacy repository `vault/`; user content does not enter source control. Before moving a vault, stop services that write to it, back up the entire directory including hidden directories, move it intact, update `.env` and desktop recent locations, then start again. Check the actual vault path shown in settings after moving. Optional local Git history is stored inside each vault; see [vault metadata](../features/VAULT-METADATA.md#optional-local-git-history) for configuration, retention and recovery.

Example notes are created only on the first startup of a newly created default vault. Existing vaults and explicitly selected directories are not filled automatically. Ordinary Markdown needs no application-specific YAML; see [vault metadata](../features/VAULT-METADATA.md) for file and property rules. Copy existing Markdown folders into a vault with **Import Markdown folder**.

Run only one local service process per vault. Desktop windows use isolated services and access tokens; the standalone browser service has no authentication. Neither has a cross-process vault lock. Do not write to one vault from desktop and a separate browser service simultaneously, or expose the unauthenticated service to untrusted networks.

<a id="windows-后台启动与重启"></a>

## Windows background startup and restart

After installing dependencies, double-click [start.cmd](../../start.cmd) at the root. It starts the services in the background, checks readiness, opens the browser and writes logs to `.run/logs/`.

To stop browser services on Windows, save pending edits and double-click [stop.cmd](../../stop.cmd), or run `npm stop`. This covers the standalone API, Vite development/preview servers (including mobile preview), isolated browser test servers and their child processes, including `tsx watch`. It identifies services by their command lines and, for relative launches, Notdown HTTP responses on their actual listening ports, so custom ports are included. Desktop Electron processes and unrelated services are excluded. Services with hidden command lines can only be identified through a matching background launch record; an elevated service may require running the script as administrator.

Preview the processes without stopping them:

```powershell
.\stop.cmd -WhatIf
```

The script reports when no verified services are running and can be run repeatedly. It terminates the identified processes; wait for saves and imports to finish first. It does not delete vaults or logs.

After changing backend code or environment variables for a background service, save your edits, then run this in the repository directory:

```powershell
.\start.cmd -Restart
```

The script checks the process on port 4318, restarts its backend with the same vault path, and reuses the frontend. If the terminal has no `MARKDOWN_PL_PATH`, it reads the user-level setting. It does not arbitrarily stop processes it did not start. If you started with `npm run dev`, press Ctrl+C in that terminal and run it again.

If HTML uploads return `.bin`, previews trigger downloads, or a database entry reports an outdated backend, first check that the running backend has been updated, then retry. Do not bypass revision conflicts by forcing an old draft to save.

<a id="本地生产构建"></a>

## Local production build

```sh
npm run build
npm start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318), which serves both the application in `dist/` and the API. This build does not create a Windows installer. Use `npm run desktop:dist` for installers, output to `.run/desktop-release/`.

<a id="验证"></a>

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`build` includes TypeScript checking; use `typecheck` to check types separately. Feature changes require unit/service tests and a build; editor interaction changes also require browser tests.

- Unit and service tests live in `tests/unit/` and use temporary vaults.
- Browser tests live in `tests/e2e/` and require local Google Chrome. They use an isolated headless instance and temporary vault, without connecting to the user's browser.
- `test:e2e` builds first, then runs Playwright. Reports, traces and screenshots go in `test-results/`; local execution logs go in `.run/logs/`.
- Run desktop tests with `npm run test:desktop`; their temporary vaults and user profiles are also isolated.
- Run cloud sync tests with `npm run test:sync`, which builds isolated desktop/mobile frontends and exercises actual PostgreSQL migrations and cross-platform browser flows. See [cloud sync](../features/CLOUD-SYNC.md).

Focused examples:

```sh
npx tsx --test tests/unit/markdown-engine.test.ts
npm run build
npx playwright test tests/e2e/markdown-lab.spec.ts
```

<a id="隔离浏览器测试"></a>

### Isolated browser tests

During parallel development, do not overwrite another session's `dist/` or reuse its test port. PowerShell example (directories, ports and output paths must be exclusive to this run):

```powershell
npm run build -- --outDir .run/e2e-dist
$env:NOTDOWN_E2E_PORT = '4330'
$env:NOTDOWN_E2E_FRONTEND_DIR = '.run/e2e-dist'
npx playwright test --output test-results/e2e-isolated --reporter=list
```

With `NOTDOWN_E2E_FRONTEND_DIR` configured, the desktop build in `npm run test:e2e` also uses that separate directory. If already built, run Playwright directly as above. The test server refuses to reuse an existing service; check that the target port is free before starting. The repository `vault/` contains user content and must not be used for tests or cleanup.

To test the Vite development service, including development stylesheet order, set `$env:NOTDOWN_E2E_DEV = '1'` and run `npx playwright test`. This mounts Vite in the same isolated test service. The API still accesses only this run's temporary vault and does not proxy to the daily development service; no prior build is needed. Remove the environment variable afterward to restore production-build testing.

<a id="android-开发"></a>

## Android development

Android and desktop share this repository's dependencies, document model, editor and vault core. The mobile entry is in `src/mobile/` and the Capacitor native project in `android/`. See the [Android guide](../features/ANDROID.md) for capabilities and backups.

```sh
npm ci
npm run mobile:dev
```

The browser preview is at [http://127.0.0.1:4337](http://127.0.0.1:4337), using separate IndexedDB data. It does not open desktop or Android private vaults. The actual Android app uses native file storage only.

Builds require JDK 21, Android SDK 36 / Build Tools 36.0.0, and correctly set `JAVA_HOME` and `ANDROID_HOME` (or the untracked `android/local.properties` with `sdk.dir` configured). The first build downloads Gradle and Android build dependencies.

```sh
npm run android:build
```

This builds the mobile frontend, syncs Capacitor resources, runs native file unit tests and produces `.run/android-release/Notdown-Android-debug.apk`. The minimum system is Android 8.0 / API 26. This is a debug-signed package, not a store release. Do not commit signing keys, `local.properties` or build artifacts.

```sh
npm run android:open
npm run test:mobile
```

`android:open` opens the Android Studio project; `test:mobile` uses a separate Chrome touch instance to test offline editing, recovery, attachments and backups. The mobile frontend build goes in `.run/android-frontend/`. The default test port is 4347, overridable with `NOTDOWN_MOBILE_E2E_PORT`. Browser tests do not establish acceptance for physical-device input methods, WebView, system file pickers or process reclamation.

<a id="工具与集成"></a>

## Tools and integrations

| Tool | Entry and purpose |
| --- | --- |
| Block Explorer | Sidebar entry or `/block-catalog.html` on the development service; inspect content objects, dialects, syntax examples and extension provenance. |
| Markdown Lab | `/markdown-lab.html`; compare source and HTML from different renderers independently of vault autosave. See the [Lab guide](../features/MARKDOWN-LAB.md) for external dependencies. |
| MCP | Start the local API first, then run `npm run mcp` in the repository directory. The stdio bridge defaults to `NOTE_API_URL=http://127.0.0.1:4318`. Writes must include the revision obtained when reading; see the [API](../reference/API.md). |
| MyBase | Export current page metadata using stable UUIDs and actual data types. It does not automatically write to the main repository; see the [integration contract](../reference/MYBASE.md). |

Optional AI, transcription and preview service settings live under the vault's `.notdown/`, outside page Markdown. Invoking generation or transcription sends the corresponding text or audio to the configured service.

<a id="界面文案"></a>

## Interface text

The main application language entry is `src/shared/i18n.ts`; the Simplified Chinese dictionary is `src/shared/locales/zh-CN.ts`. Static HTML explicitly marks text with `data-i18n` and attributes with `data-i18n-title` / `data-i18n-aria-label` / `data-i18n-placeholder`. Programmatically created interface text uses `setUIText` and `setUIAttribute`; interpolation uses `t`. Only marked interface text refreshes. Note bodies are neither scanned nor rewritten, and binding updates preserve existing form controls.

Do not pass user titles, property names, option values, or data-source/view names to translation functions. Internal selectors use `data-*` or stable IDs rather than translated `aria-label` values. Disable `localize` when a generic database menu receives user-defined names. Browser language is saved in `notdown-ui-language`; desktop uses trusted IPC and separate application configuration so random service ports do not lose the preference.

<a id="文档维护"></a>

## Documentation maintenance

Root READMEs introduce the product and its entry points. Put feature instructions in `docs/features/`, update runtime configuration on this page, and update format/API topics in their references. Register new topics in the [documentation index](../README.md). Record individual validation results with a date and scope instead of accumulating them on the homepage. See [AGENTS.md](../../AGENTS.md#readme-maintenance) for the full rules.

For documentation-only changes, run `npm run docs:check`. Application interaction tests are required when application behavior changes.
