# Notdown

A local Markdown note-taking app with block editing and page-based organization.

**English** · [简体中文](README.zh-CN.md)

Notdown combines transparent Markdown files with a structured editing experience. The editor uses a single ProseMirror document and a custom Markdown codec; page properties live in YAML, and your notes remain files in a local vault.

**Status:** an actively developed prototype for local use. Revision checks and recoverable conflict copies are implemented; collaboration and cross-device sync are not. The application UI is currently English only.

[Quick start](#quick-start) · [Features](#features) · [Format and storage](#format-and-storage) · [Limitations](#limitations) · [Development](#development) · [Documentation](#documentation)

## Quick start

### Requirements

- Node.js 24 and npm.
- A modern browser; browser tests use an installed Google Chrome.
- Pandoc is optional and is not needed for everyday editing.

From the repository directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The local vault API runs at `http://127.0.0.1:4318`. Closing the terminal stops the development services.

On Windows, after installing dependencies, you can also double-click [`start.cmd`](start.cmd). It starts the services in the background, checks that they are ready, and opens the browser. Logs are written to `.run/logs/`.

### Choose a vault

The default vault is `./vault`. To use another directory, set `VAULT_PATH` before starting the service. For example, in PowerShell:

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

Demo notes are created only on the first launch of a new default vault. Existing vaults and explicitly configured directories are not automatically populated. Existing Markdown files need valid page metadata; arbitrary folders are not automatically imported.

### Run a production build locally

```sh
npm run build
npm start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318), which serves both the built app and the API. Use one local service process per vault. Authentication and multi-process locking are not implemented; the service is intended for local use.

## Features

Availability depends on the page's dialect and enabled extensions.

| Area | Available today |
| --- | --- |
| Editing | Page, Source, and Split views sharing a draft and undo history; slash commands, inline formatting, nested lists, block selection and drag-and-drop. |
| Page organization | Parent/child pages, sidebar reordering, favorites, search, backlinks, page links, and trash with restore. |
| Views and reading | Vault gallery, property list, tree, and graph; page outline, mind map, collapsible headings, and a reading table of contents. |
| Markdown content | Multiple dialect presets, code highlighting, KaTeX math, Mermaid diagrams, footnotes, citations, tables, and metadata editing. |
| Page appearance | Emoji icons that open the picker when clicked; Add icon / Add cover actions appear only when needed. Built-in and uploaded covers can be changed or repositioned from the cover toolbar; page YAML properties are editable. |
| Notdown extensions | Tabs, bookmarks, link previews, breadcrumbs, local buttons, HTML documents, and web embeds. |
| People and dates | Local contacts and person mentions; date editing and, in the Notdown dialect, reminders while the app is running. |
| Files and export | Local attachments, images and media playback, single-page HTML export, and MyBase metadata export. |
| Local data protection | Revision-checked saves, history snapshots, external-change detection, and recoverable conflict copies with explicit merging. |
| Integrations | A stdio MCP bridge; optional GitHub and OneDrive / SharePoint previews; configurable text-generation and transcription services. |

Complex tables, diagrams, mixed HTML, and some other structures use previews with source editing. Feature availability does not imply full visual editing or complete compatibility with every upstream format.

### Everyday controls

| Action | Control |
| --- | --- |
| Search pages | `Ctrl+P`; `Ctrl+K` also works outside the body editor. |
| Switch Page / Source | `Ctrl+E` |
| Save immediately | `Ctrl+S` |
| Insert content | Type `/` in the body or use a block's `+` button. |
| Move or manage blocks | Drag or click the six-dot handle. |
| Change list nesting | `Tab` / `Shift+Tab` |

View changes collect pending input before switching. Source navigation and Split scrolling map by block; complex or reordered content is not mapped character by character.

## Format and storage

### Markdown dialects

Presets include Notdown, Notion-flavored Markdown, Typora, Obsidian, CommonMark, GFM, Pandoc Markdown, CommonMark X, Original Markdown, PHP Markdown Extra, MultiMarkdown, and legacy GitHub Markdown.

Page syntax settings are stored in YAML under `syntax`. Changing a dialect reinterprets the same source rather than migrating the vault.

- **Notdown** combines supported Markdown dialect features and Notion content. Custom body syntax is limited to gaps in official Enhanced Markdown for Notion blocks, block attributes, inline content, and styles. Existing dialect syntax is reused wherever it can express the content.
- **`notion-markdown`** enables only syntax defined by official Enhanced Markdown. Notdown supplements are restricted to `syntax.variant: notdown`; explicit extension switches cannot bypass this boundary.
- Unknown syntax, legacy content, and unknown fields are preserved for recovery. Unedited content retains its source where supported; edited structures may normalize whitespace or markers. Arbitrary input is not guaranteed to round-trip byte for byte.

See the [format contract](docs/FORMAT.md), [dialect compatibility](docs/reference/DIALECT-CONFORMANCE.md), and [current syntax boundary](docs/audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md).

### Vault layout and saving

```text
vault/
  pages/*.md          Markdown body and YAML page properties
  people/*.yaml       Local contacts
  assets/             Uploaded attachments
  .history/           Page snapshots and conflict copies
  .notdown/           Local integration settings
```

Markdown files are the source of truth, not cached block JSON. Pages require valid `id` and `title` metadata. Invalid YAML and duplicate IDs cause writes to be rejected rather than overwriting the original files.

Updates go through `createVault` with `baseRevision`. A stale revision preserves both recoverable versions; it is not silently retried as a forced overwrite. External refreshes do not replace unsaved text, and browser drafts are isolated per window. Unsaved drafts are not a complete recovery mechanism after a window is closed.

Optional integration credentials are stored locally under `.notdown/`, separately from page Markdown. Configured generation and transcription services receive the relevant text or audio when you invoke their actions.

## Limitations

- **No collaboration or cross-device sync.** Local revision checks and conflict copies are not a synchronization service. Local synced blocks do not connect to Notion cloud sync.
- **No Notion databases, workspace membership, permissions, or full cloud automation.** People entries are local contacts, not user accounts; mentions do not send notifications.
- **Partial format compatibility.** Not all upstream rules or extension combinations are implemented. Full table selection and row/column management, arbitrary block nesting, and cross-page dragging remain incomplete.
- **Local execution only for reminders.** No closed-app system scheduling, email reminders, or recurring reminders.
- **Export and import are limited.** HTML export is for one page and keeps relative attachment links; it does not package the vault. Bulk import of arbitrary Markdown folders and a history rollback UI are not implemented.
- **Further interaction validation is needed** for system-level Chinese IME, touch, accessibility, and large documents. Desktop packaging and an offline mobile app are future work.

## Development

The app is a TypeScript project with a Vite frontend, a local Node service, ProseMirror for document editing, and CodeMirror for source editing.

```text
src/          App, document codec, editor, blocks, features, and integrations
server/       Markdown vault, HTTP API, and MCP bridge
tests/unit/   Model, format, service, and protocol tests
tests/e2e/    Isolated Chrome browser tests
docs/         Architecture, contracts, references, and historical records
scripts/      Startup and maintenance scripts
public/       Static assets
.run/logs/    Local execution logs (not committed)
```

See [repository organization](docs/architecture/REPOSITORY.md) for file ownership and entry points. `vault/` contains user data and must not be used as a test fixture.

### Validation

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit and service tests use temporary vaults. Browser tests use an independent headless Chrome instance and a temporary vault; they do not connect to your browser. Reports and traces go to `test-results/`.

For concurrent browser runs, build into a separate directory and use a separate port. PowerShell example:

```powershell
npm run build -- --outDir .run/e2e-dist
$env:NOTDOWN_E2E_PORT = '4330'
$env:NOTDOWN_E2E_FRONTEND_DIR = '.run/e2e-dist'
npx playwright test --output test-results/e2e-isolated --reporter=list
```

### Tools and integrations

- **Block Explorer:** open [`/block-catalog.html`](http://127.0.0.1:4317/block-catalog.html) or use the sidebar to inspect objects, dialects, syntax examples, and extension sources.
- **Markdown Lab:** open [`/markdown-lab.html`](http://127.0.0.1:4317/markdown-lab.html) for source and rendered-output comparisons. It is separate from vault autosave. External renderer setup is documented in the [Lab guide](docs/features/MARKDOWN-LAB.md).
- **MCP:** start the local API first, then launch `npm run mcp` from the repository directory. The bridge uses stdio and defaults to `NOTE_API_URL=http://127.0.0.1:4318`. Client launch configuration varies; updates must use the revision returned by reads. See the [API reference](docs/reference/API.md).
- **MyBase:** exports the current page's metadata with stable UUID identity and explicit data types. It does not automatically write to a MyBase master library. See the [integration contract](docs/reference/MYBASE.md).

## Documentation

Most detailed documentation is currently in Chinese.

| Start here | Purpose |
| --- | --- |
| [Documentation index](docs/README.md) | All architecture, feature, reference, and verification documents. |
| [Format contract](docs/FORMAT.md) | Markdown, metadata, preservation, and serialization rules. |
| [Repository organization](docs/architecture/REPOSITORY.md) | Development entry points and where files belong. |
| [Notdown content scope](docs/reference/NOTDOWN-SUPERSET.md) | Supported content and format boundaries. |
| [People](docs/features/PEOPLE.md) / [Link previews](docs/features/LINK-PREVIEWS.md) | Local contacts and external preview behavior. |
| [Verification records](docs/verification/VERIFICATION.md) | Dated test evidence, not a guarantee of current coverage. |
| [Previous README — 2026-09-23](docs/archive/README-2026-09-23.zh-CN.md) | Historical detail, including superseded implementation notes. |

## Acknowledgments

SiYuan informed the local storage design; AFFiNE and AppFlowy informed block interactions. Notdown is an independent implementation, not a full fork of those applications.

The project uses ProseMirror, CodeMirror, markdown-it, Lucide, KaTeX, Mermaid, and other dependencies under their respective licenses. Optional Pandoc rendering uses a separately installed executable. Bundled emoji fonts retain their license notices: [Noto — SIL OFL 1.1](src/assets/fonts/LICENSE-Noto.txt) and [OpenMoji — CC BY-SA 4.0](src/assets/fonts/LICENSE-OpenMoji.txt).
