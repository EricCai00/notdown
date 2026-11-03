<a id="windows-014-发布验证2026-10-27"></a>

# Windows 0.1.4 release validation (2026-10-27)

**English** · [简体中文](RELEASE-0.1.4-2026-10-27.zh-CN.md)

<a id="范围"></a>

## range

Summary of previously uncommitted Notion v2 import compatibility, text/background dual colors, verifiable desktop cache date addition, external reference library, inline object menu and attachment naming/cleaning changes. The new code language recovery only triggers Block API verification for non-empty tags that are not recognized by the language registry, retaining unique complete code matching, original archiving, and ambiguity protection; known languages, aliases, empty tags, and Mermaid do not increase language verification requests.

The version has been upgraded from 0.1.3 to 0.1.4; the program is still a Windows x64 Electron + NSIS installation package. Product, log, user data and installation backups do not enter Git.

<a id="验证结果"></a>

## Verification results

| Check | result |
| --- | --- |
| `npm test` | 1, 118 passed, 5 skipped, 0 failed |
| `npm run test:e2e -- tests/e2e/notion-v2-import.spec.ts tests/e2e/code-languages.spec.ts` | The build passed and 13 browser tests passed. |
| Extension browser returns for attachments, dates, external references, inline menus, meeting dates, contacts and selection menus | 46 passed, 1 failed, not all green |
| `npm run desktop:dist` | generate`Notdown-Setup-0.1.4-x64.exe` |
| `NOTDOWN_PACKAGED_EXE` pointing to `win-unpacked/Notdown.exe` The test is a desktop test. | The first round of 8 passed and 1 failed; the failed single-instance recovery use case passed separately when re-run. |
| Native installation | NSIS ends normally, exit code is 0, and the product version after installation is`0.1.4.0` |
| Installation file verification | `Notdown.exe` and `resources/app.asar` The SHA-256 is consistent with the packaging products tested; the library selection settings remain unchanged |

Browser and desktop tests both use independent temporary vaults; desktop tests also use independent user configurations. Back up the old program before installation, and the installation does not replace the vault directory.

<a id="未通过项与边界"></a>

## Fails and Boundaries

- Contact test `people.spec.ts` for `slash Mention person opens a real chooser and preserves pending text` Waiting for search box in People dialog to time out. Contact CRUD, `@` completion, conflict and external user testing passed; this record does not write the slash menu path as passed.
- In the first round of desktop single instance recovery, an additional window was detected after the second resumption; the single rerun passed, and the first round failure record was retained, and it was not claimed that the multi-round stability verification had been completed.
- The extension browser regression stays in the test server exit phase after all 47 results are output; the final report is generated after stopping the identified temporary test server. The user program is not terminated or the user vault is operated.
- This time, we did not rerun the end-to-end acceptance of all browsers, Android, real cloud synchronization or real Notion token, and did not expand existing capability guarantees. The installation package is still not signed.

The detailed records of this machine are in `.run/logs/release-0.1.4-*`; the code language special results are also in `.run/logs/code-language-unknown-only-*`. These paths are for development environment records and are not required for release.

<a id="015-空代码正文补丁同日"></a>

## 0.1.5 empty code-body patch (same day)

The unknown language check for 0.1.4 read the empty code block, but the matching step incorrectly skipped the empty string. 0.1.5 allows Markdown and Block API to restore unknown tags when the page has only one empty code block each; multiple empty blocks, missing or ambiguous text remains intact. Empty text remains empty, blank lines, unknown attributes, and the original archive remain unchanged; fences with no specified language still do not trigger verification.

- `npm test`: 1, 120 passed, 5 skipped, 0 failed; added empty text, empty rich-text array, nesting, CRLF and multi-empty block ambiguity regression.
- TypeScript、Vite Code languageNotion v2 of13 The browser test is passed; both imported dialects are validated.Shell Preview, submit, save and reopen the block.
- The construction of the 0.1.5 Windows installation package passed, and the two desktop tests of the packager's vault startup, shutdown and save, and tray recovery passed.
- The only blank sections on the current reporting page are those that are archived in the same batchBlock API The recovery isShell；Only one language tag changes through application interface savings and verification of files. Other pages are not scanned.
- This round only runs patch-related regressions; the failure of the contact menu recorded in the 0.1.4 extension acceptance and the failure of the desktop single instance in the first round will not be rewritten as resolved by this patch.

The native logs are `.run/logs/empty-code-language-*` and `.run/logs/release-0.1.5-*`.
