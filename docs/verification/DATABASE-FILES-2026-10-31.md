<a id="独立数据库文件验证"></a>

# Individual database file validation

**English** · [简体中文](DATABASE-FILES-2026-10-31.zh-CN.md)

Date: 2026-10-31. This record corresponds to the shared vault core and isolated browser stages, and does not migrate the actual user vault. For subsequent desktop packaging, installation and verification, see [ 0.1.10 release record ](RELEASE-0.1.10-2026-10-31.md).

<a id="实现契约"></a>

## realize the contract

- The new database writes `databases/<id>.json` one by one, and ordinary databases no longer generate empty Markdown . Owned data sources contain fields and `pageIds`; views hold explicit database/source references, external sources show Link.
- The page body is still in `pages/*.md`, and the general page attributes are still in `metadata.json`; the host and member API fields are compatible projections. Wiki Home retains the true Markdown, and the container and page source remain independent.
- The old format is read-only compatible and the original edits continue to be valid; CLI / HTTP migration has passed the preview version verification, and the complete files before and after are archived. Aborts with text, independent old host identity, or source ownership cannot be determined, no guesswork mapping.
- Database JSON incorporates the combined files CAS, batch recovery, recycle bin, ZIP and Git checkpoints. Synchronization handles structural conflicts as a complete database file, and the record body is still synchronized independently.

<a id="自动验证"></a>

## Automatic verification

- `npm test`: 1223 passes, 5 skips, no failure. Log `.run/logs/database-files-unit-accepted.log`.
- After the final addition of cover removal and migration protection for different host identities,`tests/unit/database-files.test.ts` The 18 item is all approved; log `.run/logs/database-files-final-regression.log`• Cover file layout, unique membership relationships, cross-repository references, unknown fields, external editing/file additions, disruption recovery, conflict handling, recycling and recovery, migration, Notion retesting, backup and file-level synchronized conflicts.
- `npm run test:e2e -- tests/e2e/database-icons.spec.ts tests/e2e/notion-wiki-import.spec.ts tests/e2e/database-recycle.spec.ts tests/e2e/database-sources.spec.ts tests/e2e/database-hierarchy.spec.ts tests/e2e/wiki-shell.spec.ts`: All 21 items passed, including `npm run build`. Log `.run/logs/database-files-browser-accepted.log`.
- Last time `npm run build` passed; log `.run/logs/database-files-build-accepted.log` . The original larger chunk prompt still exists.
- Additional directed runs verified database cells, inline records, five layouts, and the view menu. The initial assertion differences involved the old empty host assumption and the sidebar hover operation. After the correction, the relevant use cases passed the retest.

The browser uses standalone Chrome and a temporary vault. Wiki Home/Collection compares the positions of cover, title, icon and view entry under 1920 and 1440 px; the test output is at `test-results/browser/`.

<a id="边界"></a>

## Boundaries

The actual user database is not bulk rewritten, newly created/newly imported using independent files.[Database documents](../features/DATABASES.md#individual-database-files)The multi-end version of this format requires support from all endpoints; no authentic cloud, Android real-time or database history rolling interface is accepted.

The local service has been started through the warehouse startup script, the status of 4317 / 4318 is `ok`, and the new migration preview interface returns version 1. Read-only preview of Default library for 5 legacy databases, 0 blocked items; no migration performed.
