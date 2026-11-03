<a id="仓库组织约定"></a>

# Repository layout

**English** · [简体中文](REPOSITORY.zh-CN.md)

This TypeScript application contains a Vite frontend with multiple entry pages and a local Node service. Source files are organized by responsibility, with one dependency manifest and build configuration. The project is not currently split into a monorepo or published packages. Moving files into their directories preserves existing module relationships; it does not imply that cross-module dependencies have been removed or strict layering is complete.

Android and desktop share this repository and its npm dependencies. The same Vite configuration builds a separate entry point in `mobile` mode. Shared document and vault logic stays in `src/`; the Android native project and platform adapters are maintained separately.

<a id="入口"></a>

## Entry point

| Entry point | Source | Purpose |
| --- | --- | --- |
| `index.html` | [src/app/main.ts](../../src/app/main.ts) | Main application |
| `block-catalog.html` | [src/catalog/block-catalog.ts](../../src/catalog/block-catalog.ts) | Block Explorer |
| `markdown-lab.html` | [src/markdown-lab/main.ts](../../src/markdown-lab/main.ts) | Renderer and HTML output comparison |
| `npm run dev` / `npm start` | [server/index.ts](../../server/index.ts) | Local vault and HTTP API |
| `npm run mcp` | [server/mcp.ts](../../server/mcp.ts) | MCP bridge |
| `npm run desktop` | [src/desktop/main.ts](../../src/desktop/main.ts) | Electron main process, vault selection and local service lifecycle |
| `npm run mobile:dev` / `npm run android:build` | [src/mobile/main.ts](../../src/mobile/main.ts) | Mobile browser preview / Capacitor Android application |

The three HTML entry files remain at the repository root to preserve existing URLs. Build, test and startup configuration also stays at the root; maintenance scripts belong in `scripts/`.

<a id="源码归属"></a>

## Source ownership

| Directory | Contents |
| --- | --- |
| `src/app/` | Page assembly, application lifecycle, sidebar and global styles |
| `src/desktop/` | Electron main process, restricted preload bridge and welcome page; the build script is `scripts/build-desktop.mjs` and the installer configuration is at the root in `electron-builder.yml` |
| `src/mobile/` | Mobile interface, draft recovery, ZIP import/export, and Android/browser-preview storage adapters; the HTML entry in this directory is `index.html` |
| `src/vault/` | Platform-independent vault core, storage interfaces, revision checks, history and conflicts, databases and contact storage |
| `src/sync/` | Shared sync protocol, queues, Supabase/WebDAV authentication and transport; writes go through `src/vault/sync-store.ts`; Supabase SQL lives in `server/sync/` |
| `android/` | Capacitor native project, restricted private-file plugin, sync HTTPS transport and system file saving; the root build configuration is `capacitor.config.ts` |
| `src/document/` | Document schema, content objects and Markdown / Notion codecs |
| `src/editor/` | ProseMirror editor, commands, selections, menus and shared node views |
| `src/blocks/` | Views and operations for columns, Tabs, buttons, embeds and other specific blocks |
| `src/features/` | Models, interactions and styles grouped by bookmarks, links, people, dates, pages and metadata |
| `src/markdown-engine/` | Dialects, extensions, parsing and serialization, source preservation and editing workspace |
| `src/markdown-lab/` | Lab-specific interface, request contracts and scroll mapping |
| `src/catalog/` | Content catalog, syntax entries, relationships and provenance |
| `src/shared/` | Shared types, API client, icons and text utilities |
| `src/integrations/` | External format integrations, currently MyBase export |
| `src/assets/` | Images, cursors and other static assets referenced by Vite builds |
| `public/page-covers/` | Images and thumbnails for the built-in cover Gallery; stable URLs keep page YAML cover paths valid after rebuilding |
| `server/` | Node vault assembly and filesystem adapters, server-side fetching and integrations, HTTP API and MCP |

Place new code in its feature directory first, keeping feature-specific CSS with the implementation. Only utilities actually shared by multiple features belong in `shared/`. Imports point directly to implementation files; do not add forwarding files at old paths or barrel exports. Handle existing cross-directory dependencies carefully: reusing a data model must not execute a browser entry point on the server.

<a id="测试与产物"></a>

## Tests and artifacts

- `tests/unit/`: Node tests, including pure model tests and service integration tests with temporary vaults. Run `npm test`.
- `tests/e2e/`: Playwright tests and their isolated test server. Run `npm run test:e2e`; use a separate Chrome instance without connecting to the user's browser.
- `npm run test:desktop`: Separate Electron test configuration in the same directory, with temporary vaults and an isolated user profile; `desktop-dist/` holds the desktop entry build, and `.run/desktop-release/` holds installers and unpacked artifacts.
- `npm run test:mobile`: Separate Chrome touch-preview tests with temporary browser storage, configured independently of ordinary browser tests. Mobile builds go in `.run/android-frontend/`, debug APKs in `.run/android-release/`, and native JVM tests in `tests/unit/android/`, as configured by Android Gradle.
- `docs/fixtures/`: Shared Markdown fixtures, attachments and manual acceptance-page generators.
- `docs/data/`: Version-controlled syntax-source snapshots and audit data.
- `.run/logs/`: Local execution logs; `.run/` can also hold temporary analysis and tooling files.
- `test-results/`: Playwright reports, traces, screenshots and isolated builds; `dist/`: the default production build.

Focused examples: `npx tsx --test tests/unit/markdown-engine.test.ts`; build first, then run `npx playwright test tests/e2e/markdown-lab.spec.ts`. Port and isolated-build settings are described in the [running and development guide](DEVELOPMENT.md#isolated-browser-tests).

`vault/` contains user data and must not be used for source reorganization, tests or cleanup. Rules for preserving unknown fields, original source and CAS conflicts remain defined by [AGENTS.md](../../AGENTS.md) and the [format contract](../FORMAT.md).

`src/vault/database-files.ts` manages the file contract, ownership and compatibility projections for `databases/*.json`; `databases.ts` manages database operations and resource revisions. `page-batch.ts` coordinates CAS and recovery across Markdown, databases and metadata; UI and HTTP routes must not construct canonical files directly. The legacy migration entry is `scripts/migrate-database-files.ts`; see [database storage](../features/DATABASES.md#individual-database-files).

<a id="文档"></a>

## Documentation

The root `README.md` is the English entry point and `README.zh-CN.md` its Chinese counterpart. Both introduce the product to new users with a brief description, main features, first-use steps, key limitations and documentation links. Maintenance rules are in [AGENTS.md](../../AGENTS.md#readme-maintenance). Ordinary fixes do not belong on the homepage. Detailed instructions, implementation notes and acceptance evidence belong in their topics; runtime configuration and test commands are collected in the [development guide](DEVELOPMENT.md). The current body contract remains in `docs/FORMAT.md`. Use `architecture/` for design, `reference/` for formats and APIs, `features/` for feature guides, `audits/` for audits, `verification/` for historical acceptance records, and `archive/` for superseded snapshots. Register new documents in the [documentation index](../README.md), and give historical results a date and scope.

English is the canonical documentation language. Default `.md` files contain English; Chinese translations use the same basename with `.zh-CN.md`. The indexes are `docs/README.md` and `docs/README.zh-CN.md`. Maintain both versions together, include a language switch, and keep ordinary links in the current language. Preserve commands, identifiers, code examples and fixture corpora. Run `npm run docs:check` for paired documents, local targets, heading anchors and language routing.
