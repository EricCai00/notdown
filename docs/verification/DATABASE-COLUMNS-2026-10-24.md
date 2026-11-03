<a id="notion-数据库列序与按钮对齐2026-10-24"></a>

# Notion database column order and button alignment (2026-10-24)

**English** · [简体中文](DATABASE-COLUMNS-2026-10-24.zh-CN.md)

<a id="范围与修复"></a>

## Scope and Repair

- The universal content block button style of the embedded database has margins, causing **New** and the drop-down arrow to be separated and misaligned. The database button clears the default margins, unifies the height of both segments, and the box model.
- The import originally directly adopts the enumeration order of the data source `properties` object. Now read the `configuration.properties` of the first available table view of the same data source, and map the column order according to the source attribute ID (including URL encoding) or name; when it cannot be obtained, the title column is placed first, and other fields maintain the interface order. Duplicate, unknown, or missing fields will not cause existing fields to be lost, and hidden fields will remain accessible.
- The default view in earlier imports where the header was not first and the column order was still equal to the full schema order was corrected for display with the archived view when reading. metadata or body is not automatically rewritten; custom column order and visible column set remain intact.
- Keep the current column order when saving view settings, filtering or sorting to avoid rearranging by schema.

The original Notion schema and view configuration remain. No remote writing, batch data migration or new text syntax has been added; remote record sorting, filtering, grouping and other layouts have not been reproduced. The API field is based on the [ Notion official view description ](https://developers.notion.com/guides/data-apis/working-with-views#property-configuration).

<a id="验证"></a>

## Validation

- `npm test`: 996 item, 990 passed, 5 skipped, 1 failed. The only failure was that the random listening port tested by R API was rejected by Node fetch (`bad port`); after independent retesting of `tests/unit/rmarkdown.test.ts`, all 10 items passed. The R code was not modified for this purpose.
- `npm run build -- --outDir .run/database-columns-frontend`: Passes TypeScript check and Vite build; still has existing large chunk prompt.
- Isolate Chrome and temporary vault, run `database-inline.spec.ts`, `databases.spec.ts` and `notion-inline-database-import.spec.ts`: all 13 items passed. Covers two dialect imports, remote column ordering and fallback for missing remote views, New button segment alignment and menu expansion, saved views and refreshed column order, old import read-only fixes and revision unchanged, and existing edit, conflict, draft and record panel behaviors.
- I have checked the generated screenshot and confirmed that the title column in the embedded database is on the left and the New segments are connected and of equal height.
- `npm run test:e2e -- tests/e2e/database-hierarchy.spec.ts tests/e2e/database-icons.spec.ts tests/e2e/database-server-compat.spec.ts tests/e2e/notion-import.spec.ts --output test-results/database-columns-related --reporter=list`: Browser regression via standalone build and additional 18 items. Use port 4360 and front-end directory `.run/database-columns-e2e-final/`; together with the above 13 items, a total of 31 items are all passed.

The local log is `.run/logs/database-columns-*.log`, the build is `.run/database-columns-frontend/`, and the screenshot is `test-results/notion-inline-databases-{variant}.png`. All verifications use temporary data and do not read or modify the user vault; these results do not represent passing of the full browser suite.
