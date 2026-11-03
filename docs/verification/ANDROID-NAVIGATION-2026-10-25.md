<a id="android-页面切换优化2026-10-25"></a>

# Android page-switching optimization (2026-10-25)

**English** · [简体中文](ANDROID-NAVIGATION-2026-10-25.zh-CN.md)

<a id="范围"></a>

## range

Optimize the page reading, ordinary note saving, attachment display and page list refreshing of the mobile private vault. There is no migrating user files, changing the Markdown dialect, or relaxing version checks. The desktop vault still uses full scan reading; the shared scanner only changes the process of repeatedly retrieving metadata file by file to building a lookup table once, retaining the original sorting, rename recognition, and duplicate identity checks.

- Mobile phone as of now `metadata.json` The file mapping reads the target Markdown and every time revision is re-generated, the file is not properly cached as a truth storage. When the file is missing an index, an old identity, a renaming or an unclear file mapping, the full scan is returned.
- The title, text and dialect of a normal page are saved and read from the current page and parent link. Hierarchy, recycle bin, database, YAML and other updates involving hierarchies retain full validation paths. The input collected before saving, `baseRevision`, historical snapshot, pre-submit review, original byte CAS and conflict copy remain unchanged.
- Local media is loaded after the main text is displayed, path merge requests are repeated, and up to four attachments are read simultaneously. Attachment display reading does not occupy the mobile phone navigation and saving queue; after clearing the cache or switching vaults, old requests cannot publish old results. The display address only updates the non-editable media view, and the links in the text and Markdown retain the original paths.
- Reuse rows and icons when the page list has not changed, and save state changes without rebuilding the entire list. Selecting an open page saves only the current input and closes the list.
- After the first synchronization, complete the local page assembly and then remove the synchronization panel.

<a id="性能对照"></a>

## Performance comparison

Use Windows Node file adaptation, 200 page in the temporary vault, total 425, 890 byte text. Each path was measured seven times, and the following is the median and number of single file calls. The complete scan path also includes this lookup table optimization, so it is not a complete machine comparison between the old APK and the new APK. There were other build loads during the test, and the time consumption is only for local reference. The number of reads is more suitable to illustrate the scope of optimization.

| Operations | full scan path | Mobile phone private copy path |
| --- | ---: | ---: |
| Read the target page text | 200 times | 1 times |
| Median time taken to read the target page | 225.25 ms | 12.06 ms |
| Text reading when saving normal root page | 403 times | 5 times |
| Median saving time | 644.78 ms | 130.84 ms |

The above time consumption does not include editor DOM assembly, touch screen response and real phone storage overhead. When the parent page is deep, parent chain reading will increase; database and hierarchy modifications still require a complete scan.

Script and local results: `.run/mobile-navigation-benchmark.ts`, `.run/logs/mobile-navigation-benchmark.json`. The script only uses the temporary directory and cleans it up when finished.

<a id="验证内容"></a>

## Verify content

Unit verification covers the number of target page reads, external body and attribute changes, old revision conflicts, parent page recycle bin protection, restoring the default parent page after removing level YAML, external modifications during saving, interrupted transaction recovery, unknown field retention, attachment concurrent deduplication, old vault request isolation and missing attachment retries.

Mobile browser verification covers unchanged list reuse, unfinished source code input before page switching, reopening and reloading, conflicts between two windows, and continued editing and page switching when attachment reading is actively paused. After the attachment is restored, it displays normally, and the source code still contains the relative path but does not contain the `blob:` address.

Desktop directed regression runs page navigation, page tree, complete source code files, shared workspace, vault metadata and conflict comparison; 26 item passed. Android front-end build, Capacitor synchronization, Gradle `assembleDebug` and `testDebugUnitTest` successful.

The full set of mobile phones is approved by the 27 clause, see `.run/logs/mobile-navigation-mobile-verified.log`The list caches updated other special use cases for changes to the source level, see results. `.run/logs/mobile-navigation-hierarchy.log`• Special storage protection 8 is adopted, see `.run/logs/mobile-navigation-safety.log`• new use cases connected `sync.test.ts` The 25 was passed, see `.run/logs/mobile-navigation-unit-focused.log`See the results of the desktop orientation `.run/logs/mobile-navigation-desktop-targeted.log`The result of the final APK buildup is `.run/logs/mobile-navigation-android-final.log`。

full amount `npm test` The final round of 1 is over, 014 is over, 5 is skipped, 1 is failed; failed synchronized use cases are reported when the Node file is read. `UNKNOWN: unknown error, read`The above synchronization with the new storage test file was then run again. The full execution of the full amount was not recorded as full green. The earlier round of the Pandoc subprocess exit was also run again separately, see `.run/logs/mobile-navigation-pandoc-recheck.log`。

Not all 682 tests on the desktop were declared passed: a full set of attempts was aborted after a failure in the attachment/directory use case, followed by the directed regression described above. The mobile phone has disconnected USB before this round of real machine timing, so there is no real Android page switching time comparison, and this time APK is not installed. The product is the development and debugging package `.run/android-release/Notdown-Android-navigation-2026-10-25.apk`.
