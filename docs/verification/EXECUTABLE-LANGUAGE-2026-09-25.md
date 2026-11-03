<a id="2026-09-25-可执行块与-inline-语言选择"></a>

# 2026-09-25 executable block and inline language selection

**English** · [简体中文](EXECUTABLE-LANGUAGE-2026-09-25.zh-CN.md)

R, Python, Julia, and Observable JS share two objects, `block.executable_chunk` and `inline.executable_expression`. The insert menu only has Executable Chunk and Executable Expression. After selecting the language, insert it in the original selection; click the language name of the existing object to switch. R Markdown dialect is provided in R and Quarto/Notdown is provided in four languages. Ordinary code fences remain for display purposes.

The old R Markdown text, unknown knitr header options, inline whitespace and flags are preserved. Explicitly switching languages ​​does not translate or execute the code, only the Quarto option comment prefix at the beginning changes with the language; R headers that cannot be converted remain as ordinary comments. The switch can be undone, but the result is still not written into the text.

Verification scope:

- `npm test`: 741 entry, 739 passed, 2 skipped, 0 failed; skips running test for Windows symlink capability and Julia not enabled. Log `.run/logs/unified-unit-all-runtimes.log`.
- After setting `NOTDOWN_TEST_JULIA=1`, post-test language model and real operation: all 13 items passed, including Julia, Python and mixed R/Python sessions. Log `.run/logs/unified-language-runtimes.log`.
- `npm run test:e2e -- tests/e2e/executable-language.spec.ts tests/e2e/quarto.spec.ts tests/e2e/rmarkdown.spec.ts tests/e2e/block-catalog.spec.ts`: The build was successful, and all 28 independent Chrome tests passed. Covers insert selection, language switching, undo redo, save reload, old R headers, dialect restrictions, real R/Python/OJS execution and catalog merging. Log `.run/logs/unified-browser-verified.log`. This is the return of relevant browsers, and it is not claimed that the full warehouse browser suite has passed.
- Check the insert language selector and inline overlay screenshot: `.run/logs/unified-insertion.png`, `.run/logs/unified-inline.png`.

Browsers and services test using temporary vault that are not written into user vault. The interpreter configuration is still a backend environment variable, and no pages are set up in-app, see details. [Languages and runtimes](../features/QUARTO.md#languages-and-runtimes)。
