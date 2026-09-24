# Notdown

A local Markdown note-taking app with block editing and page-based organization.

**English** · [简体中文](README.zh-CN.md)

Notdown combines transparent Markdown files with a structured editing experience. The editor uses a single ProseMirror document and a custom Markdown codec; common page metadata lives in one vault-level `metadata.json`, and notes remain local Markdown files. Document YAML and Pandoc title blocks override JSON defaults; Source shows the complete file without a hidden application header.

**Status:** an actively developed prototype for local use. Revision checks and recoverable conflict copies are implemented; collaboration and cross-device sync are not. The application UI is currently English only.

[Quick start](#quick-start) · [Features](#features) · [Format and storage](#format-and-storage) · [Limitations](#limitations) · [Development](#development) · [Documentation](#documentation)

## Quick start

### Windows desktop

The desktop app opens with **Create new vault**, **Open existing vault**, and recent folders. Create in an empty folder, or open an existing Notdown vault containing `pages/`; then use **New page** to start writing. **Open another vault** opens a separate window and saves the current page first. Closing an editing window also saves pending input; a save error or conflict keeps it open.

To build and run from source:

```sh
npm ci
npm run desktop
```

`npm run desktop:dist` produces the Windows x64 installer at `.run/desktop-release/Notdown-Setup-0.1.0-x64.exe`. Installed users do not need Node.js or a development terminal. This is an unsigned local build; automatic updates and macOS/Linux installers are not implemented.

To bring existing Markdown into a vault, choose **Import Markdown folder**, select the dialect and folder, review the preview, then **Import copies**. Folder hierarchy, standard relative Markdown links and attachments are imported; originals remain unchanged and are also archived in the destination vault. Each import supports up to 500 files / 20 MB. Wiki links, HTML references and page anchors need review. See [desktop and import boundaries](docs/features/DESKTOP-AND-IMPORT.md).

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

To restart that background service after a backend or environment change, save any open edits and run `.\start.cmd -Restart` from PowerShell in the repository directory. The script checks the process on port 4318, keeps its current vault path, restarts the backend, and reuses the frontend. It also reads a user-level `MARKDOWN_PL_PATH` when the current shell does not have one. If you started with `npm run dev`, use Ctrl+C in that terminal and run `npm run dev` again.

### Choose a vault

The default vault is `./vault`. To use another directory, set `VAULT_PATH` before starting the service. For example, in PowerShell:

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

Demo notes are created only on the first launch of a new default vault. Existing vaults and explicitly configured directories are not automatically populated. Ordinary Markdown files can be read without application YAML; use **Import Markdown folder** to copy ordinary Markdown folders into a vault.

### Run a production build locally

```sh
npm run build
npm start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318), which serves both the built app and the API. Use one local service process per vault. The standalone service has no authentication. Desktop windows use an isolated local service and a per-service access token, but neither mode implements cross-process vault locking; do not open the same vault in a separate browser service and the desktop app concurrently.

## Features

**R Markdown:** select the R Markdown dialect, insert/edit `{r ...}` chunks and inline R, then click **Run R Markdown** to execute the draft with local R/knitr/rmarkdown and preview text, tables and plots. `.Rmd` folder imports select this dialect automatically. Requires R, the `rmarkdown` package and Pandoc; `NOTDOWN_RSCRIPT` can select an Rscript executable. Runs are explicit, use a fresh session and never save output into the note. Static HTML only; no persistent R console, Shiny, interactive widgets or PDF/Word export. See [setup, execution and boundaries](docs/features/R-MARKDOWN.md).

Page mentions, Wiki links and Markdown internal links share one reference model and one **Internal link** entry in Block Explorer. The slash menu offers **Page link** and **Location link**; location links target headings, existing Obsidian block/list-item IDs or anchors in the current or another page. Explicit labels and source syntax are preserved, and navigation/backlinks share target resolution. Missing block IDs are not generated automatically; full Obsidian path/alias indexing and rename repair are not implemented. See [internal references](docs/features/INTERNAL-REFERENCES.md).

Availability depends on the page's dialect and enabled extensions.

With `alerts` enabled, supported dialects retain basic `> [!NOTE]` alerts. Folding (`+` / `-`) and same-line custom titles use Obsidian syntax, accepted only by Obsidian and the Notdown superset. Other dialects preserve those spellings as ordinary quoted content.

In Notdown, insert **GitHub-style Alert** from Markdown blocks or `/github` to immediately create a Note. Click its icon to choose a type from a menu showing icons, colors and names, including after insertion. Edit the title directly on the page; enable **Collapsible** in the icon menu and use the chevron after the title (right when collapsed, down when expanded). Obsidian and Notdown support all 27 built-in Obsidian keywords and aliases. Notdown retains GitHub colors for the five standard types and uses Obsidian colors for additional types; the Obsidian profile uses Obsidian colors throughout. Other alert-enabled dialects retain the five basic types without extended titles, folding or keywords. HTML export retains the appearance. The separate **Callout** command continues to insert a Notion callout.

In the Notdown dialect, inline text and background colors can coexist: `<span color="red" bg_color="yellow">text</span>`. The color menu changes or clears each channel independently; legacy `color="yellow_bg"` remains readable. Both channels use the existing named palette and render in HTML output. This inline extension is not enabled in the official Notion dialect. See the [format contract](docs/FORMAT.md).

Notdown enables the **Symbol replacements** typing plugin by default: `->` → →, `<-` → ←, `<->` → ↔, `=>` → ⇒, `<=>` → ⇔, `<=` → ≤, `>=` → ≥, `!=` → ≠, `+/-` → ±, `...` → …, `(c)` → ©, `(r)` → ® and `(tm)` → ™. Disable it with `syntax.extensions.symbol_replacements: false`. It applies only to new visual-editor typing in the Notdown dialect, preserves formatting, and skips code and links. Backspace reverts the last replacement step; loading, pasting and source editing remain unchanged. This is a local rule set, not a claim of full Notion shortcut parity. [Details and boundaries](docs/features/SYMBOL-REPLACEMENTS.md).

When the page's `emoji` extension is enabled, typing a space followed by `:sm` in the visual editor opens a filtered emoji grid using the Markdown reader's shortcode names. Choose with the mouse, arrow keys and Enter or Tab; Escape dismisses it. Selection inserts Unicode text, preserves formatting and supports undo. Code, links, escaped colons, unsupported dialects and disabled emoji extensions do not trigger completion; source editing has no emoji menu.

| Area | Available today |
| --- | --- |
| Desktop and onboarding | Windows installer, native vault folder chooser, recent vaults, separate vault windows, save-before-close, and previewed Markdown folder import with recoverable originals. |
| Editing | Page, Source, and Split views sharing a draft and undo history; slash commands, inline formatting, nested lists, block selection and drag-and-drop. Drop hints use a full-width pale blue line at the target level; nesting adds an indented darker segment. List hints include the marker gutter and follow the actual subtree boundary. Equivalent before/after targets share one hint centered in the block gap, including list edges. All inline marks (code, color/background, emphasis, links and native spans) have explicit inside/outside input states. At padded boundaries the caret visibly crosses the padding; unpadded styles retain the native caret. Typing inside inline code adds no outline. |
| Page organization | Parent/child pages with a collapsible Child page list below the page (expanded for up to five children, collapsed by default above five; manual choices last for the session), sidebar reordering, favorites, search, backlinks, page links, and trash with restore. Sidebar titles use the available row width; action buttons take space only on hover or keyboard focus. Expand arrows replace parent-page icons on hover or keyboard focus and restore the icons when the pointer leaves after a click (always available on touch), with compact 10px child indentation. |
| Views and reading | Vault gallery, property list, tree, and force-directed graph (draggable nodes, pan/zoom, neighbor highlighting, force controls); page outline, mind map, collapsible headings, and a reading table of contents fixed at the vertical center of the viewport. |
| Markdown content | Multiple dialect presets, 87 Notion and 17 Custom code-language choices with local syntax highlighting, KaTeX math, Mermaid diagrams, citations, tables, and metadata editing. Footnotes support creating text or reusing a definition, hover previews, editable multi-block bodies, and undoable cleanup when the last reference is removed in page editing. Imported unreferenced definitions remain intact; source editing preserves explicit definitions. See [footnote scope](docs/features/FOOTNOTES.md). |
| Page appearance | Add/change page icons with searchable Unicode Emoji and the complete bundled Lucide library; Lucide icons also appear in the sidebar, breadcrumbs, and page links. Emoji styles and recent choices remain available. Add icon / Add cover actions appear only when needed, with a compact reserved action row below the icon on pages without a cover, keeping the title steady when actions appear; icon hover backgrounds fit the full glyph without overlapping the cover action. Built-in and uploaded covers can be changed or repositioned from the cover toolbar, shown on cover hover or keyboard focus (always available on touch and while repositioning); page metadata is editable. |
| Notdown extensions | Tabs, bookmarks, link previews, breadcrumbs, local buttons, HTML documents, and web embeds. |
| People and dates | Local contacts and person mentions; date editing and, in the Notdown dialect, reminders while the app is running. |
| Files and export | Local attachments, images and media playback, single-page HTML export, and MyBase metadata export. |
| Local data protection | Revision-checked saves, history snapshots, external-change detection, and recoverable conflict copies with explicit merging. Conflict comparisons and live merge previews show Git-style red/green line differences, with unchanged sections folded and full Markdown available for editing. |
| Integrations | A stdio MCP bridge; optional GitHub and OneDrive / SharePoint previews; configurable text-generation and transcription services. |

In Page and Split views, clicking below the document creates one empty body block, or focuses the existing empty tail block. Repeated clicks do not add more empty blocks, including when footnotes or a bibliography follow the body.

Citation definitions, image captions, inline object insertion/properties, links and equations use compact editing panels without a backdrop. The page remains scrollable while a draft is open; Save/Apply commits it, and Cancel, the close button or Escape in the panel discards it. Stale edits are rejected when their target changes. Larger settings and confirmation dialogs remain modal.

Code blocks use equal, compact top and bottom padding and a smaller toolbar that appears on block hover or keyboard focus (always available on touch).

Code blocks have separate **Notion (87)** and **Custom (17)** groups with shared search across names and aliases. Most languages use Prism; Lean, Wenyan and sed use TextMate grammars through Shiki; GNU Octave extends MATLAB rules, and Easy Programming Language has basic local lexical rules. Custom also includes SPARQL, Vimscript, Regular Expression and Excel Formula; Makefile remains in Notion. ASCII Art and Plain Text remain uncolored. Mathematica is displayed as **Wolfram Language**, retaining old fence IDs. Mermaid remains a Diagram. Highlighting does not evaluate code or validate proofs; unknown syntax and blocks over 32,000 UTF-16 code units remain editable plain text. [Language sources, aliases and boundaries](docs/features/CODE-LANGUAGES.md).

Raw Source is no longer a separate content object or insertion command. `{=html}` shares HTML block / Inline HTML previews and source editing while retaining its original fences or backticks. Other raw formats (including TeX and the MultiMarkdown wildcard) are classified as **Unsupported**, with recoverable, editable source and no target-format rendering or conversion. The `raw_attribute` and `raw_tex` switches and dialect defaults remain available; `raw_tex` is listed under **Outside Markdown scope**.

Line blocks share ordinary paragraphs' font and alignment without a quote border or extra indentation. Internal lines use normal line height without paragraph gaps; spacing between blocks stays unchanged. Enter adds a line inside the block; Enter on an empty line exits to a paragraph, preserving any following lines. A lone pipe line remains an empty line-block row when line blocks are enabled; MultiMarkdown tables require a nonempty separator with dashes or equals signs. Table header and body cells share visible grid borders, padding, and column alignment in Page and Split views: left by default, with explicit left/center/right Markdown alignment preserved. Complex tables, diagrams, mixed HTML, and some other structures use previews with source editing. Feature availability does not imply full visual editing or complete compatibility with every upstream format.

Line blocks preserve empty rows when edited and saved; disabled escaping rules do not insert replacement placeholders. Previously saved placeholder text is not automatically rewritten.

Block and inline comments are hidden in Page view, without a placeholder or source button. Use `/` → **Block comment** or **Inline comment** to enter a comment in a dialog (requires the comments extension); existing comments remain editable in Source view. Comments retain the existing `%%` syntax, and CriticMarkup comments are also hidden.

HTML blocks show a floating `</>` source button at the top right on hover or keyboard focus, without a reserved toolbar row. It opens an inline source pane with line numbers, HTML highlighting, live preview, and shared undo/redo; Escape closes the pane. Raw HTML fences remain editable and preserved.

Div containers have no visible frame or attribute label. They add no indentation or padding to their children. Whole-group controls sit 48px farther out than the normal child controls; each child retains its own add/menu/drag controls. Both HTML and fenced Div encodings retain their attributes and source format.

The block handle menu includes **View source**, a read-only Markdown snapshot of the current block (including its children), with copy support. It uses the page's dialect and preserves original block source where available; edited or nested blocks may use normalized syntax. Viewing does not change the document.

### Everyday controls

| Action | Control |
| --- | --- |
| Search pages | `Ctrl+P`; `Ctrl+K` also works outside the body editor. |
| Switch Page / Source | `Ctrl+E` |
| Save immediately | `Ctrl+S` |
| Insert content | Type `/` in the body or use a block's `+` button. |
| Move or manage blocks | Drag or click the six-dot handle. |
| Change list nesting | `Tab` / `Shift+Tab` |
| Exit inline formatting | At a mark's end, press `→` once to type outside, both mid-line and at line end, without inserting a space; `←` reenters. Reverse the arrows at its start. Nested marks continuing past the boundary remain active; co-ending marks exit together. Adjacent different styles have a shared/plain input slot between them. Closing backticks leave code automatically. Modified arrows retain normal navigation. |

View changes collect pending input before switching. Source navigation and Split scrolling map by block; complex or reordered content is not mapped character by character.

Source/Page projections and the reading outline refresh after a 500 ms typing pause, without dimming the page. Text and local drafts update immediately; switching views or saving collects pending input. Adjacent typing/deletion within one second shares an undo/redo step, including in documents with a trailing newline; separate edits and line breaks start a new step. This is pause-based grouping, not language-aware word segmentation.

The top-right **Open source file** menu shows the full on-disk Markdown (including YAML) in a new browser tab, opens it with the system's default Markdown app, or copies its absolute path. Opening first saves pending edits; save failures and conflicts stop the action. Copying the path does not require saving. Default-app opening requires a local desktop and a Markdown file association; it reports errors when unavailable.

Source and Split views use the wider editing area even on pages with a cover; Page view retains its reading width.

Source and Split share Markdown Lab's syntax colors, including fenced JavaScript, TypeScript, JSON, HTML and YAML. Click the arrow beside a line number to fold a heading section or a multiline Markdown block (including code fences, quotes, list items and tables); click the arrow or `…` to expand. `Ctrl+Shift+[` / `Ctrl+Shift+]` fold/expand the current region; `Ctrl+Alt+[` / `Ctrl+Alt+]` fold/expand all. Folding is local to the open editor and does not change saved Markdown. Highlighting and folding use a general Markdown grammar; dialect-specific custom structures do not all have dedicated support. Fold arrows use Markdown Lab's small, pale gray styling and darken slightly on hover.

Sidebar and body-column width handles use an outlined SVG resize cursor, with the system resize cursor as a fallback.

Page tree shows the first three levels by default (root is level 1). Click a branch chevron or focus its row and press Enter/Space to expand or collapse; click the page title to open it. Expansion choices remain while switching views in the current app session and reset on reload.

Graph: drag a node to move it and let connected nodes settle; drag the background to pan, scroll to zoom, and click a node to open its page. Hovering the node dot highlights its connections; hovering its title does not. **Fit graph** recenters the view; **Graph settings** adjusts forces, labels, and arrows. Keyboard: focus the canvas and use arrow keys to pan, `+` / `-` to zoom, `0` to fit; Tab to a node and Enter to open it. Reduced-motion mode settles the layout without automatic animation. Solid arrows run from the referencing page to the target, including block **Link to page** and inline page references; dashed arrows run from parent to child. Body links and hierarchy remain separate even between the same pages. The graph currently covers existing pages, page links, and hierarchy; attachment/missing-target nodes, color groups, saved layouts, and Obsidian's full filter set are not implemented.

## Format and storage

### Markdown dialects

Presets include Notdown, Notion-flavored Markdown, Typora, Obsidian, CommonMark, GFM, Pandoc Markdown, CommonMark X, Original Markdown, PHP Markdown Extra, MultiMarkdown, and legacy GitHub Markdown.

GFM now covers its five specification extensions, including single/double-tilde deletion, literal autolinks (including `mailto:`/`xmpp:`), task whitespace, semantic table headers and HTML tagfilter. All 677 published examples have syntax, valid editor-schema, unchanged-source and safe-export regression checks; nine inherited examples require explicitly documented extension composition. Edited loose lists and table line breaks retain their meaning. HTML containers spanning Markdown blocks have a combined source editor and safe preview. GitHub repository/account integrations are outside the GFM syntax specification; optional extras and HTML sanitization remain separate boundaries. See the [GFM audit](docs/audits/GFM-CONFORMANCE-2026-09-24.md).

Page syntax settings are stored in vault `metadata.json` under `syntax`. Changing a dialect reinterprets the same source rather than migrating the vault.

The Obsidian dialect leaves Notion extensions off by default. Supported optional extensions can still be enabled manually; existing source is preserved.

The editor's **Extensions** panel supports instant search by name, ID, and description, with result counts. It follows its button when editing views, sidebar width, or toolbar wrapping change, and stays within the window horizontally. Search only filters the list; extension settings change when you toggle a switch or reset defaults.

- **Notdown** combines supported Markdown dialect features and Notion content. Custom body syntax is limited to gaps in official Enhanced Markdown for Notion blocks, block attributes, inline content, and styles. Existing dialect syntax is reused wherever it can express the content.
- **`notion-markdown`** enables only syntax defined by official Enhanced Markdown. Notdown supplements are restricted to `syntax.variant: notdown`; explicit extension switches cannot bypass this boundary.
- Notion images are standalone media blocks. Inline images and autolinks stay literal; explicit links and page mentions work, while wiki source and automatic heading slugs are not enabled. Undocumented structures are preserved as source rather than silently converted. See the [Notion boundary audit](docs/audits/NOTION-BOUNDARY-2026-09-24.md) for the checked cases and remaining gaps.
- Unknown syntax, legacy content, and unknown fields are preserved for recovery. Unedited content retains its source where supported; edited structures may normalize whitespace or markers. Arbitrary input is not guaranteed to round-trip byte for byte.

See the [format contract](docs/FORMAT.md), [dialect compatibility](docs/reference/DIALECT-CONFORMANCE.md), and [current syntax boundary](docs/audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md).

### Vault layout and saving

```text
vault/
  pages/*.md          Complete Markdown source
  metadata.json       Shared page metadata (document YAML/Pandoc overrides)
  people/*.yaml       Local contacts
  assets/             Uploaded attachments
  .history/           Page snapshots and conflict copies
  .notdown/           Local integration settings
```

Markdown files are the source of truth, not cached block JSON. Plain files need no application YAML; unregistered files derive their title and identity from the filename. The explicit [legacy metadata migration](docs/features/VAULT-METADATA.md) moves old application YAML into the shared JSON, backs up every original and preserves the remaining body exactly. Document-authored YAML/Pandoc overrides remain in Markdown. Invalid JSON, YAML or duplicate IDs stop writes and preserve the original files.

Updates go through `createVault` with `baseRevision`. A stale revision preserves both recoverable versions; it is not silently retried as a forced overwrite. External refreshes do not replace unsaved text, and browser drafts are isolated per window. Unsaved drafts are not a complete recovery mechanism after a window is closed.

Optional integration credentials are stored locally under `.notdown/`, separately from page Markdown. Configured generation and transcription services receive the relevant text or audio when you invoke their actions.

## Limitations

Citation, abbreviation, glossary, metadata-variable and CriticMarkup insertion forms follow the active dialect. MMD citations have bibliography numbering separate from footnotes, backlinks and editable definitions. Footnote references navigate directly to their definitions, with individual return buttons for repeated references. Footnote and citation return arrows use fixed SVG icons independent of icon fonts. Task checkboxes show a focus outline for keyboard navigation only. Figure captions are editable; tables support rectangular/row/column selections, TSV copy/paste, row/column movement and selection merging. Existing extensions and encodings are reused and included in Notdown by default; unrelated dialects cannot force these grammars on. See [scope and dialect mapping](docs/features/INLINE-OBJECTS.md).

- **No collaboration or cross-device sync.** Local revision checks and conflict copies are not a synchronization service. Local synced blocks do not connect to Notion cloud sync.
- **No Notion databases, workspace membership, permissions, or full cloud automation.** People entries are local contacts, not user accounts; mentions do not send notifications.
- **Partial format compatibility.** Not all upstream rules or extension combinations are implemented. Table matrix pastes must match the selection size and merges require a compatible encoding; arbitrary block nesting and cross-page dragging remain incomplete.
- **Local execution only for reminders.** No closed-app system scheduling, email reminders, or recurring reminders.
- **Export and import are limited.** HTML export is for one page and keeps relative attachment links; it does not package the vault. Folder import creates copies with new page identities; it does not edit arbitrary folders in place or fully migrate Obsidian/Notion workspaces. A history rollback UI is not implemented.
- **Further interaction validation is needed** for system-level Chinese IME, touch, accessibility, and large documents. The Windows desktop build is unsigned; automatic updates, macOS/Linux installers and an offline mobile app are future work.

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
- **Markdown Lab:** open [`/markdown-lab.html`](http://127.0.0.1:4317/markdown-lab.html) for source and rendered-output comparisons. Official CommonMark.js, cmark-gfm and PHP Markdown Extra join the existing Pandoc readers, MultiMarkdown and Markdown.pl. Python/cmarkgfm and PHP/Markdown Extra require local installations; unavailable tools are disabled without parser substitution. Lab is separate from vault autosave. Setup is documented in the [Lab guide](docs/features/MARKDOWN-LAB.md).
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

Page metadata precedence, explicit legacy-header migration and interrupted-save recovery: [Vault metadata](docs/features/VAULT-METADATA.md). Cross-device synchronization is not implemented.
