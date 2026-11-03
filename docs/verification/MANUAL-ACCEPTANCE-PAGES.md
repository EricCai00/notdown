<a id="tests-子页面验收样本"></a>

# Tests child-page acceptance fixtures

**English** · [简体中文](MANUAL-ACCEPTANCE-PAGES.zh-CN.md)

Generator: [ manual-test-pages.ts ](../fixtures/manual-test-pages.ts). It does not read or write the vault, and generates 27 texts: 11 dialect default configuration pages, 14 extended test pages, 1 local object/service pages, and 1 Outside Markdown scope reference pages. Overall coverage of 81 content objects and 103 registered extensions.

The installer additionally creates 1 navigation indexes and 1 references/Synced source targets, so a complete installation is **29 direct subpages** . The original Tests text and old comparison pages will not be modified. Page title numbers are used for index identification and do not force changes to the user's sidebar sorting preferences.

Each dialect explicitly sets syntax.variant and extensions is empty to test the actual default value; the extension page explicitly turns on the switch of the corresponding group. Line break rules, wiki link title order, literate Haskell and top of page Pandoc metadata are placed separately to avoid blocking each other. Each use case provides real input, expectations and operations, and manual record fields; the extension page also comes with a fence-protected source code comparison.

Resources are uploaded through the attachment API: existing control PNG, synthesis WAV, generated silent WebM, single page PDF, imported text and BibTeX. All are local resources and do not rely on external images or videos. Model calling, reminders, and synchronization are not automatically started; synthetic sounds are only used for playback and protocol testing, and are not used to judge speech transcription accuracy.

<a id="检查"></a>

## Check

`node --import tsx --test tests/unit/manual-test-pages.test.ts` Check the dictionary, extensions, object list coverage and all the schema in the original language, unmodified source code return and top-level headings for each use case. The unknown instruction sample in Unsupported that cannot be used will open Pandoc Div `:::unknown` Ending with invalid `:::endunknown`In case of default, the entire page is absorbed into Unsupported and is deemed to be passed if the original cannot be returned.

`npx playwright test tests/e2e/manual-test-pages.spec.ts`Install the entire set of samples in the independent temporary vault and Chrome, open them page by page, switch the source code and page view, and check whether the saved text remains unchanged and browser exceptions occur. User vault does not participate in automated testing.

This is a sample coverage and browser smoke validation, not a compatible validation for all upstream rules. The manual results on each page are initially Not run; editing, undoing, dragging, attributes, complex syntax and service behaviors are recorded according to use cases, and "not enabled by default" is not mistakenly reported as "not implemented".

<a id="明确指定知识库后安装"></a>

## Install after explicitly specifying the vault

When a user explicitly requests acceptance material to be placed into the vault, the running application API is used, and all writes go through the createVault queue. The command must also provide the address, parent page ID and expected vault path; the installer verifies / api/status, rejects incorrect vault and repeated installations of the same group, and does not overwrite the filled in manual acceptance results.

```powershell
node --import tsx docs/fixtures/install-manual-test-pages.ts http://127.0.0.1:4318 PARENT_PAGE_ID EXPECTED_VAULT_PATH
```

The installation list is saved in `test-results/manual-pages-installed.json`, including the new page ID, resource path, inspection statistics and index ID. No pages file is written directly, and the original parent page or existing test page is not modified.
