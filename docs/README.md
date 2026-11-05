<a id="文档导航"></a>

# Documentation

**English** · [简体中文](README.zh-CN.md)

Start with the project README ([English](../README.md) / [简体中文](../README.zh-CN.md)), the [Markdown body format v0.4: dialect configuration and Notion Enhanced Markdown](FORMAT.md) and the [Repository layout](architecture/REPOSITORY.md). Format rules follow the current contract and explicitly identified later revisions. Historical audits and acceptance results do not describe the complete current implementation.

<a id="使用入门"></a>

## Getting started

- [Knowledge bases](features/VAULTS.md): shared vault picker, remembered save location, and folder browsing.

- [List view](features/DATABASE-LIST.md): List layout and attribute display settings.

- [Writing and navigation](features/WRITING-AND-NAVIGATION.md): editor views, common actions, page management and the page graph.
- [Media and embeds](features/MEDIA-AND-EMBEDS.md): images, audio/video, PDF, HTML attachments and embedded web pages.
- [Early Android build](features/ANDROID.md): offline notes, images, vault ZIP backups and current mobile limitations.
- [Cross-device cloud sync (experimental)](features/CLOUD-SYNC.md): Supabase setup, desktop/Android sync, conflicts and current limitations.
- [Nutstore WebDAV sync](features/WEBDAV-SYNC.md): application passwords, separate remote folders, request limits and concurrency protection.
- [Development guide](architecture/DEVELOPMENT.md): vault paths, startup and restart, builds, tests and development tools.

<a id="架构与开发"></a>

## Architecture and development

- [Repository layout](architecture/REPOSITORY.md)
- [Native Markdown editing engine](architecture/MARKDOWN-ENGINE.md)
- [Content objects and node identity](architecture/OBJECT-IDENTITY.md)
- [Current foundation: ProseMirror documents and Markdown file storage](architecture/FOUNDATION.md)
- [Block semantics and their Notdown implementation](architecture/BLOCK-MODEL-REVIEW.md)
- [Notdown content object roadmap](architecture/CONTENT-OBJECT-ROADMAP.md)
- [Metadata and formats outside the source workbook](architecture/METADATA-AND-COMPATIBILITY.md)

<a id="格式和能力参考"></a>

## Format and capability references

- [Markdown body format v0.4: dialect configuration and Notion Enhanced Markdown](FORMAT.md), [Legacy body format contract](reference/FORMAT-LEGACY.md)
- [Block types, dialects and implementation limits](reference/BLOCKS.md), [Content capabilities](reference/CONTENT-CAPABILITIES.md), [Content object, dialect and extension catalog](reference/CATALOG-RELATIONS.md)
- [Native Markdown dialects](reference/NATIVE-DIALECTS.md), [Dialect conformance](reference/DIALECT-CONFORMANCE.md), [Notdown content superset and insertion menu](reference/NOTDOWN-SUPERSET.md)
- [Pandoc extension reference](reference/PANDOC-EXTENSIONS.md), [Pandoc extension switch matrix](reference/PANDOC-EXTENSIONS-MATRIX.md)
- [Extension provenance and defaults](reference/EXTENSION-PROVENANCE.md), [Notion reference](reference/NOTION-REFERENCE.md)
- [Notion MCP syntax and implementation boundaries](reference/NOTION-MCP-SYNTAX.md)
- [Supplementary local content objects](reference/LOCAL-OBJECTS.md), [Product syntax](reference/PRODUCT-SYNTAX.md)
- [Retained Notdown extensions and official alternatives](reference/NOTDOWN-EXTENSIONS.md)
- [Markdown vault API](reference/API.md), [MyBase integration](reference/MYBASE.md)

<a id="功能说明"></a>

## Feature guides

- [Local databases and Notion database import](features/DATABASES.md)

- [Meeting notes](features/MEETING-NOTES.md)

- [Local synced blocks](features/SYNCED-BLOCKS.md)

- [AI block configuration and generation](features/AI-BLOCKS.md)

- [Quarto dialect and multilingual notebooks](features/QUARTO.md), [Quarto integration validation (2026-09-25)](verification/QUARTO-2026-09-25.md)
- [2026-09-25 executable block and inline language selection](verification/EXECUTABLE-LANGUAGE-2026-09-25.md)

- [R Markdown](features/R-MARKDOWN.md)

- [Vault metadata](features/VAULT-METADATA.md)

- [Page and location links](features/INTERNAL-REFERENCES.md)

- [Windows desktop and Markdown folder import](features/DESKTOP-AND-IMPORT.md)
- [One-way Notion API import (Markdown v2)](features/NOTION-IMPORT.md)
- [Code languages and highlighting](features/CODE-LANGUAGES.md)
- [Footnote interactions and body block types](features/FOOTNOTES.md)
- [Inline objects, captions and table editing](features/INLINE-OBJECTS.md)

- [Automatic symbol replacements](features/SYMBOL-REPLACEMENTS.md)

- [Markdown Lab: external renderers, dialects and HTML output](features/MARKDOWN-LAB.md)
- [Pandoc Citation Test Document](fixtures/pandoc-citations.md)
- [Link previews](features/LINK-PREVIEWS.md)
- [People: a local address book](features/PEOPLE.md)

<a id="审计与验证记录"></a>

## Audits and verification

- [Windows 0.1.15 database views and desktop release verification](verification/RELEASE-0.1.15-2026-11-05.md)
- [Windows 0.1.14: bilingual workspace and vault management](verification/RELEASE-0.1.14-2026-11-03.md)

- [Windows 0.1.13: inline databases, source menus and Trash](verification/RELEASE-0.1.13-2026-11-01.md)

- [Windows 0.1.12: database layouts and view menus](verification/RELEASE-0.1.12-2026-11-01.md)

- [Windows 0.1.11 release validation](verification/RELEASE-0.1.11-2026-10-31.md)

- [Windows 0.1.10 release validation](verification/RELEASE-0.1.10-2026-10-31.md)

- [Individual database file validation](verification/DATABASE-FILES-2026-10-31.md)

- [Windows 0.1.9 release validation (2026-10-28)](verification/RELEASE-0.1.9-2026-10-28.md)

- [Wiki creation, conversion and Undo validation (2026-10-28)](verification/WIKI-2026-10-28.md)

- [Windows 0.1.6 release validation (2026-10-28)](verification/RELEASE-0.1.6-2026-10-28.md)

- [Notion AI block cache recovery and Button investigation (2026-10-28)](verification/NOTION-AI-BLOCK-RECOVERY-2026-10-28.md)

- [Windows 0.1.4 release validation (2026-10-27)](verification/RELEASE-0.1.4-2026-10-27.md)

- [Current custom syntax and background-color migration](audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.md)

- [Dual-color recovery during Notion import (2026-10-27)](verification/NOTION-COLOR-RECOVERY-IMPORT-2026-10-27.md)

- [Notion v2 inline text and background colors (2026-10-27)](verification/NOTION-DUAL-COLORS-2026-10-27.md)

- [Notion v2 inline-code compatibility reading (2026-10-27)](verification/NOTION-CODE-TAGS-2026-10-27.md)

- [Notion v2 multiline child pages and reference blocks (2026-10-26)](verification/NOTION-MULTILINE-BLOCKS-2026-10-26.md)

- [Notion desktop SQLite and public API comparison (2026-10-26)](audits/NOTION-SQLITE-2026-10-26.md)

- [Attachment UUIDs, page-deletion cleanup and reminder import review (2026-10-26)](verification/ATTACHMENT-UUID-CLEANUP-2026-10-26.md)

- [Date and reminder display corrections (2026-10-26)](verification/DATE-PRESENTATION-2026-10-26.md)

- [External references — 2026-10-26](verification/EXTERNAL-REFERENCES-2026-10-26.md)

- [Inline-object context menus and source-section validation (2026-10-26)](verification/INLINE-CONTEXT-MENU-2026-10-26.md)

- [Original attachment names and consistent storage naming (2026-10-26)](verification/ATTACHMENT-NAMES-2026-10-26.md)

- [Settings interface and desktop 0.1.3 validation (2026-10-26)](verification/SETTINGS-0.1.3-2026-10-26.md)

- [Windows tray residence and single instance (2026-10-26)](verification/TRAY-AND-SINGLE-INSTANCE-2026-10-26.md)

- [Sidebar simplification and direct Android dialect selection (2026-10-26)](verification/SIDEBAR-AND-MOBILE-DIALECT-2026-10-26.md)

- [Tabs and integrated title-bar validation (2026-10-26)](verification/WORKSPACE-TABS-2026-10-26.md)

- [Mobile dialect and 0.1.1 build validation (2026-10-26)](verification/MOBILE-DIALECT-AND-RELEASE-2026-10-26.md)

- [Browser vault management, settings and sidebar validation (2026-10-25)](verification/BROWSER-VAULTS-AND-SETTINGS-2026-10-25.md)

- [Local history and multiple-vault validation (2026-10-25)](verification/LOCAL-HISTORY-AND-VAULTS-2026-10-25.md)

- [Android full-page / inline database validation (2026-10-25)](verification/ANDROID-DATABASES-2026-10-25.md)

- [Mobile text styles and Notion v2 Markdown persistence (2026-10-25)](verification/MOBILE-FORMATTING-MARKDOWN-2026-10-25.md)

- [Android page-switching optimization (2026-10-25)](verification/ANDROID-NAVIGATION-2026-10-25.md)

- [Android touch block operations (2026-10-25)](verification/ANDROID-TOUCH-2026-10-25.md)

- [Android keyboard dismissal and page hierarchy (2026-10-24)](verification/ANDROID-KEYBOARD-TREE-2026-10-24.md)

- [Sync batch-write optimization (2026-10-24)](verification/SYNC-BATCH-2026-10-24.md)

- [Mobile sync progress and repeated-scan optimization validation (2026-10-24)](verification/SYNC-PROGRESS-2026-10-24.md)

- [Notion database column order and button alignment (2026-10-24)](verification/DATABASE-COLUMNS-2026-10-24.md)

- [Android initial cloud sync setup validation (2026-10-24)](verification/ANDROID-CLOUD-ONBOARDING-2026-10-24.md)

- [Nutstore connection failure fix validation (2026-10-24)](verification/WEBDAV-FIX-2026-10-24.md)

- [WebDAV integration validation (2026-10-23)](verification/WEBDAV-2026-10-23.md)

- [Multi-device cloud sync validation (2026-10-23)](verification/CLOUD-SYNC-2026-10-23.md)

- [Initial attachment library validation (2026-10-23)](verification/ATTACHMENTS-2026-10-23.md)

- [Android offline preview validation (2026-10-23)](verification/ANDROID-2026-10-23.md)

- [Database table and side peek — 2026-09-28](verification/DATABASES-DESIGN-QA-2026-09-28.md)

- [Meeting notes design QA — 2026-09-27](verification/MEETING-NOTES-DESIGN-QA-2026-09-27.md)

- [HTML / Web embed validation (2026-09-27)](verification/EMBED-DESIGN-QA-2026-09-27.md)

- [AI block design QA — 2026-09-27](verification/AI-BLOCK-DESIGN-QA-2026-09-27.md)

- [Content-node object ID unification validation](verification/OBJECT-IDENTITY-2026-09-24.md)

- [GFM specification coverage and implementation gaps](audits/GFM-CONFORMANCE-2026-09-24.md)

- [GitHub-style Alert verification](verification/GITHUB-ALERTS-2026-09-24.md)

- [Review of official Notion syntax boundaries](audits/NOTION-BOUNDARY-2026-09-24.md)

- [Desktop and Markdown import validation (2026-09-23)](verification/DESKTOP-IMPORT-2026-09-23.md)
- [Notion Enhanced Markdown import validation (2026-09-26)](verification/NOTION-IMPORT-2026-09-26.md)
- [Markdown test document guide](fixtures/README.md), [Official Markdown dialect test corpus](fixtures/dialect-audit/README.md)
- [Upstream Markdown dialect corpus and HTML comparison audit](audits/DIALECT-HTML-AUDIT-2026-09-23.md)
- [Repository reorganization validation](verification/REPOSITORY-REORGANIZATION-2026-09-23.md)
- [Audit and remediation of Notdown custom body syntax](audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)
- [Extension classification review](audits/EXTENSION-CLASSIFICATION-AUDIT-2026-09-22.md)
- [Block Explorer syntax descriptions and mappings](audits/SYNTAX-CATALOG-AUDIT-2026-09-22.md), [Review of the 62 additional syntax requirements](audits/SYNTAX-AUDIT-2026-09-15.md)
- [Acceptance: dialect parsing errors and input rules](verification/VERIFICATION.md), [Tests child-page acceptance fixtures](verification/MANUAL-ACCEPTANCE-PAGES.md)
- [Block selection verification — 2026-09-22](verification/BLOCK-SELECTION-VERIFICATION.md), [Button validation record](verification/BUTTON-VERIFICATION.md), [Date / reminder interaction validation](verification/DATE-VERIFICATION.md), [Link Preview validation (2026-09-22)](verification/LINK-PREVIEW-VERIFICATION.md)
- [Page header spacing matched to Notion references — 2026-09-23](verification/design-qa.md)

<a id="历史存档"></a>

## Archive

- [Notdown](archive/README-2026-09-23.md): historical feature and interaction records, including descriptions superseded by later revisions. Use the root English and Chinese READMEs for the current overview.

`data/` holds syntax-source snapshots and audit data; `fixtures/` holds test corpora and acceptance-page generators; `archive/` holds superseded document snapshots. All three are version-controlled. Keep execution logs, screenshots and temporary builds in the repository's `.run/` or `test-results/`, separate from reference documentation.
