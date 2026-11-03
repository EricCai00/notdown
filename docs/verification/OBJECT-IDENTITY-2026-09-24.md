<a id="内容节点-object-id-统一验证"></a>

# Content-node object ID unification validation

**English** · [简体中文](OBJECT-IDENTITY-2026-09-24.zh-CN.md)

Date: 2026-09-24. Scope See [ Content Object and Node Identity ](../architecture/OBJECT-IDENTITY.md). The comparison baseline is submitted `b51c57f`, running in independent temporary worktree; the browser uses independent Chrome and temporary vault.

<a id="通过的检查"></a>

## passed inspection

- Full unit/service test: 680 items, 679 passed, 1 skipped, 0 failed.
- TypeScript type check and production build pass; the build still has the original large chunk prompt.
- Added unit tests to verify that the actual schema name is equal to object ID, that the old node name is no longer registered, that properties are preserved with CRLF, undo and reopen, different edit representations of shared object ID, and structural constraints.
- The new browser test directly reads the real ProseMirror document, verifies the person, date, page link, link card, audio, title, paragraph and referenced node name, and checks saving and reopening.
- When the HTML source code is changed from `{=html}` to other formats, the node must change type simultaneously. The regression was discovered and fixed this time; the original two-way conversion, undo, save and restart tests passed the retest.

<a id="全量浏览器结果及限制"></a>

## Full browser results and limitations

`npm run test:e2e`Raw results: 370 passed, 26 failed, 28 did not run, total 424 items. The run was not recorded as all-green.

After checking the failed items one by one:

- 17 items also failed on the pre-modification baseline: block spacing 3 item, Callout icon selection 1 item, dialect expansion switch 3 item, old nesting/subpage syntax 2 item, extended source interface 3 item, manual acceptance page collection assertion 1 item, old Notion format use case 2 item, MMD metadata creation 1 item, GFM table cell positioning 1 item.
- The initialization assertion of the manual acceptance page collection failed, resulting in the subsequent 28 items not being executed; this restriction has not been modified in this naming reconstruction.
- 8 item loading/timeout, etc. failed retesting under the fixed build copy: code cursor, input batch processing, CRLF paste, PHP Extra, page operations, cover, reference definition editing and selection menu. During the full run, the shared `dist` was rebuilt, and the log recorded that `dist/index.html` temporarily did not exist; the retest used an independent build directory.
- The 1 item is the regression of the above HTML source code conversion and passed after repair.

Additional targeted retesting includes the full Markdown block, native dialect, source code workspace and selection menu test files. The new node identity browser test also passes using the fixed build.

The local complete log is located at `.run/logs/node-identity-*.log`; the full unit result is `node-identity-unit-complete.log`, the full browser result is `node-identity-e2e.log`, the repaired core retest is `node-identity-fixed-check.log`, and the baseline control is `node-identity-baseline-e2e*.log`.
