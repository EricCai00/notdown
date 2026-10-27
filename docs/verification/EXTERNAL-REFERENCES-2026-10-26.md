# External references — 2026-10-26

## Scope

- Added a vault-owned external entity registry in `metadata.json.externalEntities`, with Notion identities separated into pages, users, databases, data sources and block locations.
- Imports retain source information and batch IDs. Current Markdown/properties, page origins and contacts provide live references and available local candidates.
- Later imports and contacts with matching source IDs can resolve existing references without changing note bytes or page revisions. Duplicate copies require an explicit choice. Trash, deleted contacts and unavailable explicit targets remain unresolved.
- Named complete API user objects can create local contacts once. Partial users remain unknown, and imports never replace or restore existing contacts.
- **Import → External references** supports search and explicit page/contact/database bindings. Saves use the library revision, byte-level metadata CAS and preserved conflict proposals.
- Editor references and Relation/People fields show non-clickable English unknown labels. Source URLs and saved labels remain recoverable in Markdown. Mobile initializes the same registry and refreshes it after synchronization.
- Registry records use the existing resource sync protocol. Unmapped Notion block anchors remain unavailable; no block identity or user profile is invented.

## Validation

All tests used temporary vaults, a simulated Notion API and independent Chrome profiles.

- `npm test`: 1,069 passed, 5 skipped, 0 failed (1,074 total).
- Targeted entity/import/sync unit run: 31 passed. The final entity-specific run passed all 8 cases, covering late targets, duplicate copies, explicit binding stability, conflicts, contact preservation, code/unknown-container boundaries, unknown metadata, HTTP/offline routes and resource sync.
- Desktop production build and mobile production build passed TypeScript and Vite. Vite reported its existing large-chunk warnings.
- 44 existing desktop regression cases passed across imports, v2 recovery, inline/full databases, contacts, internal references, node identity and inline context menus.
- The final 6-case desktop run passed all 4 new feature cases and both inline-database regressions: inert unknown labels and deferred navigation; manual association with unchanged source; live Relation/People updates while another table cell retains pending input; database rebinding and disabled navigation after target deletion.
- `npm run test:mobile`: all 37 existing cases passed. The final scoped run passed the additional mobile reference case and both inline/synced-database cases, checking English labels, reload, disabled navigation, preserved source URLs and shared database views.
- Desktop/mobile screenshots were inspected. Unknown page/user/database labels remain visible, gray and non-clickable; source labels and URLs are preserved. The new feature modules and tests contain no hardcoded Chinese text.
- `git diff --check` passed.

The full desktop suite is not claimed passing. A broader selected run reported two failures in existing slash-menu paths: `inserting new examples twice assigns unused labels and consecutive new numbers` and `slash Mention person opens a real chooser and preserves pending text`. Those paths were excluded from the final scoped regression; this change does not repair them.

No real Notion token, cloud service or Android device acceptance was performed. Foreground sync retains the limitations documented in [Cloud sync](../features/CLOUD-SYNC.md).

Local execution logs and screenshots are under `.run/logs/external-entities-*` and `test-results/`; they are not source files or user-vault content.

## Documentation

- [Notion import and external references](../features/NOTION-IMPORT.md#external-references-and-users)
- [People](../features/PEOPLE.md)
- [Vault metadata](../features/VAULT-METADATA.md)
- [External entity API](../reference/API.md#external-entity-library)

## Desktop installation

The updated Windows x64 application was built and installed on 2026-10-26. Notdown was quit through its normal application menu before installation. The final NSIS run returned 0; the installed `app.asar` SHA-256 matched the packaged build, and the saved vault-selection settings were unchanged by installation. The installed application launched, opened the existing Default vault and exposed **Import → External references**.

The first update attempts exposed old packaged Capacitor Android build files with paths up to 312 characters. The old updater could not rename that dependency tree. Desktop packaging now excludes `node_modules/@capacitor/**`; the final archive contained zero Capacitor entries and no unpacked native dependency tree. The old Android dependency directory was moved to a local temporary recovery folder instead of being deleted. No user vault directory was targeted by this recovery.

Installer output is `.run/desktop-release/Notdown-Setup-0.1.3-x64.exe`. Installation and recovery receipts are `.run/logs/external-entities-desktop-install.json` and `.run/logs/notdown-installer-recovery.json`.
