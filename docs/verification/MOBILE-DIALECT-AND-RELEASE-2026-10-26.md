<a id="手机方言与-011-构建验证2026-10-26"></a>

# Mobile dialect and 0.1.1 build validation (2026-10-26)

**English** · [简体中文](MOBILE-DIALECT-AND-RELEASE-2026-10-26.zh-CN.md)

<a id="范围"></a>

## range

- Mobile phone normal page and database records: Notebook options displays the current dialect. After opening Page dialect, you can select the same 14 dialects and four groups as those on the desktop; R Markdown and Quarto are reserved.
- Collect and save pending input before switching; stop switching when a conflict occurs and keep two recoverable copies. Switch to reset known extensions and unknown configurations will remain.
- Desktop and mobile sharing configuration links: only updates to existing ones in YAML `syntax` / `bodyFormat` Cover fields, retain unknown fields, comments, BOM, CRLF, other name definitions, retain the changed YAML metrics and the following text. Do not automatically add YAML applications. Source code sync, withdraw, save and re-cover the same configuration changes.
- Repair from the normalMarkdown Cutting throughNotdown The timeJSON The default dictionary may not match the configuration of the original text.Markdown Importing the valid dialect of prioritizing document declarations.
- This source code submission includes the accumulated synchronization, database, import, history, multi-vault and mobile interaction changes in the current workspace according to user requirements. The verification scope of this article does not replace the existing capability boundaries of each topic.

<a id="版本与产物"></a>

## Versions and products

- npm / Windows：`0.1.1`；Android：`versionName 0.1.1`、`versionCode 2`。
- Windows x64 NSIS：`.run/desktop-release/Notdown-Setup-0.1.1-x64.exe`。
- Android debug APK : `.run/android-release/Notdown-Android-0.1.1-debug.apk` ; while retaining `Notdown-Android-debug.apk` of the build script.
- The installation package and local logs do not enter Git; publishing the source code does not mean publishing GitHub Release.

<a id="自动验证"></a>

## Automatic verification

| Validation | result |
| --- | --- |
| `npm test`, the final source code | 1, 044 passed, 5 skipped, 0 failed |
| Complete Chrome touch screen returns for mobile phones | 37 passed |
| The dialect source code retention, unknown settings and conflict regression of the final mobile phone build | 2 passed |
| The final desktop front-end editing workspace with Block Explorer | 14 passed |
| Isolated vault regression for packaged Windows applications | 4 passed |
| Android build and JVM file storage test | Gradle success |
| Windows installation package | NSIS was built successfully and packaged EXE version 0.1.1 |

The screenshot of the mobile phone dialect panel has been viewed, and there is no horizontal overflow; the selector can display Quarto, and the source code and save status are consistent with the menu value. Testing uses a temporary repository, a standalone browser, or an isolated Electron configuration without connecting to the user browser or user repository. Packaged application tests explicitly set the temporary data directory to avoid reading the actual local vault list.

<a id="浏览器全量限制"></a>

## Full browser limit

It cannot be claimed that the browser passed all the tests. The 690 item suite built earlier in this round stopped after completing the 158 item (151 passed, 7 failed) and the remaining use cases were not completed. Failures include:

- `dialect-boundaries.spec.ts` Three things are still expected in theCommonMark、GFM or officialNotion ActivatedNotdown Additional plugins; the current language boundaries do not allow this.
- `editor.spec.ts`Two nested text old structure assertions, as well as one item each for long outline and page mention; the latter two are not fixed in this round of positioning.

The next extension to the targeted browser was 26 through, 2 failed; the failure was a failure to make the browser run as a standard. `notdown-boundary.spec.ts` The official Notion controller claims,`notdown-dialect.spec.ts` The expansion of the distribution controls claimed that these failures were not circumvented by the language boundaries of the language. The newly added desktop YAML language switching, source code synchronization and cancellation use cases were adopted.

See `.run/logs/release-0.1.1-browser.log` and `.run/logs/release-0.1.1-dialect-browser-final.log` for the local original logs; see `release-0.1.1-unit-final.log`, `release-0.1.1-mobile-final.log`, `release-0.1.1-mobile-dialect-final.log`, `release-0.1.1-workspace-final.log`, `release-0.1.1-desktop-test.log` in the same directory and `*-final-build.log` at both ends for the final checks that passed.

<a id="设备边界"></a>

## device boundaries

The Windows of this machine has been silently upgraded through NSIS, the installer exit code is 0; the EXE after installation is `0.1.1.0`, and the uninstall item version is `0.1.1`. The installation directory `resources/app.asar` and SHA-256 are consistent with the packaged product that passed the test. Install packages and APK's SHA-256 remain in `.run/logs/release-0.1.1-artifact-hashes.json`.

This round of ADB does not detect the connected device, so it only generates and checks APK, and does not claim to have been installed on the phone or complete the real Android WebView acceptance. The execution of R, Python, Julia, and Pandoc still requires desktop services; cloud synchronization is still an experimental front-end function, and there is no background synchronization guarantee.
