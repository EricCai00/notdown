<a id="quarto-方言与多语言-notebook"></a>

# Quarto dialect and multilingual notebooks

**English** · [简体中文](QUARTO.zh-CN.md)

Notdown's `quarto` dialect builds on existing Pandoc Markdown editing capabilities, recognizing Quarto executable fences, inline expressions, and code block options. The `notdown` collection dialect also enables these syntaxes. The text is still `vault/pages/*.md`, and `.qmd` is not required; when importing `.qmd`, Quarto is selected by default, and the original file and unknown fields are retained. Select the dialect and do not rewrite the old text. Official `notion-markdown`, GFM and R Markdown do not therefore enable Quarto's Python/Julia/OJS syntax.

This is an integration of editing and interactive execution within Notdown, not a complete embedding of Quarto CLI. The source code can be handed over to Quarto for release; Notdown does not implement Quarto's complete website/book construction, PDF/Word output, shortcode/filter execution, cross-reference numbering and project configuration parsing. The existing Pandoc syntax is interpreted according to the current capabilities of Notdown, and the original text of unknown syntax is retained.

Notdown selects independent language sessions by block; Quarto CLI usually selects a main execution engine for the entire document, and can be combined with OJS. Notes that mix R, Python, and Julia need to be configured or split according to their engine rules before external Quarto is released. It cannot be assumed that the multi-session behavior of this article is exactly the same as Quarto CLI.

<a id="语法与操作"></a>

## Syntax and operations

During Page editing, **Ctrl/Cmd+Enter** runs the executable chunk or inline where the cursor is located; chunk also retains Ctrl/Cmd+Shift+Enter. Evaluated inline supports hover preview of results. Click the code language label or result to open the menu and use **Show result / Show code** to switch a single inline; the result view hides the code and language label, and the original code text is still saved by the document. Global **Inline: Code / Results** switches all inline on the current page and does not trigger running; the mixed status after a single switch displays Mixed.

Only displayed when the page has executable chunk or inline **Run all**The first step is to run all chunk in document order, then calculate all inline and cut inline to the result view. **Stop all**，Current requests and uninitiated calculations can be cancelled; edit the text, change the page or reset the session, and unfinished batches can be cancelled. Errors show that the rest of the items are still running.Markdown；The first is the lack of a good deal of information about the results of the tests.

2026-09-25 The test of the controls: unit testing746 I'm going to go through this.5 The Commission has also launched a new programme to promote the development of the European Union'sChrome of35 The return of the relevant items is all approved and contains realR/Python/Julia/OJS The entire page is running, suspended with two-level display switching,pending Enter, save source code, stop and release session.DELETE RequestedJSON body，Avoid continuing to occupy the core number after the request for release is rejected.`.run/logs/executable-controls-unit.log`、`executable-controls-final-build.log`、`executable-controls-final-e2e.log`. The full repository browser suite was not implemented in this round.

````markdown
```{python}
#| label: scores
#| echo: false
scores = [80, 90, 100]
sum(scores) / len(scores)
```

平均分是 `{python} sum(scores) / len(scores)`。

```{julia}
x = [1, 2, 3]
sum(x)
```

```{r}
#| label: r-example
x <- c(1, 2, 3)
mean(x)
```

```{ojs}
//| echo: false
viewof n = Inputs.range([1, 10], {value: 3, step: 1})
square = n * n
```

平方：`{ojs} square`
````

- fence use `{r}`、`{python}`、`{julia}`、`{ojs}`; Ordinary `python`、`r`、`js` The fence only shows the code. R's existing `{r label, option=value}` and `` `r expression` `` Continue to be available.
- Python, R, Julia use the `#|` and YAML options that start consecutively, and OJS uses `//|`; unknown options are reserved. Don't treat comments in the middle of the program as configuration. Supports backticks and tilde fences, and maintains the original fences and line breaks when the original text remains unchanged.
- `/` The menu is unified **Executable Chunk** and **Executable Expression**，Chunk withinline The first time I've ever seen a computer, I've seen it in a language that I can't remember.R），Language selection not popped up; newChunk Enter the code as a blank and a flashlight.Chunk The name of the language is to be opened and the list is to be pulled down, and the keys are to be moved up and down.Enter ConfirmedEscape Close and click the mouse. Language selection in the local memory;R Markdown Back to theR。The language name in the upper left corner of the block can be restarted by clicking;inline Language names can be selected for language or run expression.`Ctrl/Cmd+Shift+Enter` Run the current block. The upper right corner can run the current block or the block above it; within inline `Ctrl/Cmd+Enter` run.
- Language switching for both objects can be undone and standard Markdown syntax will continue to be used after saving. The switch only modifies the language fence/inline separator, and the code content remains verbatim, including comments, whitespace, and `#|` / `//|` option prefixes; the old R header comments are not added to the code. After changing the language, use the standard fence of that language. The original R exclusive header options can be restored by undoing. Whether the programs and options are suitable for the new language need to be adjusted by yourself. The language names of Chunk and inline do not have expansion arrows and can still be clicked. The old file's R header and inline delimiters remain intact without switching languages. The same selector for the R Markdown dialect is only available for R .
- Receive source code/editor input to be submitted before execution. Reading, switching dialects, saving or opening pages does not automatically run code. Buttons are explicit interactive evaluations: `eval`, `echo`, `include` and other publishing options do not prohibit evaluation and do not hide interactive results; these options are reserved for external Quarto publishing. The block on Python/Julia stops when it encounters an error, and `#| error: true` can continue to the next block.
- Text, tables, and images are placed below blocks, and inline results are placed near expressions; can be collapsed, cleared, stopped, and restarted. The results do not enter Markdown, metadata, undo records, or vault history. When only executing changes to the node's own code, language, or block header options, its old results are marked as expired; editing of ordinary text and other nodes does not trigger this prompt. Undoing the last executed source code will clear the expiration prompt.

<a id="语言与运行环境"></a>

## Languages and runtimes

2026-09-25 The following is the list of the most commonly used methods of measuring the results:Chunk/inline Adding language options that no longer pop up, along memory languages; newChunk The lighting is directly entered into the blank code./inline Edit the blankOJS The problem of sharing sessions and replacing the document sequence with a stable object-identity execution, avoiding the previously inserted block covering the existing definition.inline Last expression edited in the same eventpending DOM Input and run immediately, insert new blocks before the definition is run, and realR/Python/Julia/OJS Read the independent values of the variable of the same name separately.746 I'm going to go through this.5 Jump, build pass; relatedChrome Return to the country30 Pass and activate the machinePython/IJulia The four languages combined test another1 The document was approved.`.run/logs/executable-results-*`• Testing with independent temporary vaults.

2026-09-25 Set up verification: Full unit testing746 I'm going to go through this.5 A selectable environment test is skipped; built-in passes.Python/IJulia of17 The service integration test was passed.26 I'm going to go through this.1 The following:Python The test then enables environmental verification to be passed; setting, real session reset andQuarto The end of8 The following:Chrome All tests were approved. Tests were conducted using a temporary knowledge library, logs.`.run/logs/runtime-settings-*`。

in **Workspace settings → Code execution** Medium configuration **Rscript path、Python path、Julia path**• Enter executable file paths, without quotation marks or start parameters;**Check** Check the configuration of the form that has not been saved,R The inspection package andPandoc，Python/Julia The temporary start-upkernel Also display interpreter paths and versions. Check not to modify existing sessions. Save in the post-reset service.Notebook The next session is executed immediately using a new setting, without rebooting the backend.

**Advanced: Jupyter and Pandoc** Can be specifiedPython/Julia kernel The name,Jupyter data directory andPandoc File paths can be executed. Leave a space along the following start environment variables or automatic detection; the start value is already displayed in the input box position prompt.Python Not specifiedkernel Selected for use in the namePython The name of the author is "The Book of Mormon".kernel Use of thekernelspec The explanatory notes.Julia Path coverage installedIJulia kernel The executable files of the system, retaining the boot parameters and environment, are still required to be installed.IJulia。OJS The first is that the user can use the built-in system without the need for a path.

The configuration is stored in `.notdown/runtimes.json` of the current vault, not the text or page metadata, nor is it a global configuration across vaults. Save using vault atomic writes, locks and `baseRevision`; conflicts are returned when another window has been modified, the form draft is retained, and both versions are stored in `.notdown/runtime-conflict-*.json`, without forced overwriting. Startup environment variables are still compatible; only changing environment variables requires restarting the backend. The language selector only selects languages.

| Language | Execution path | Dependencies |
| --- | --- | --- |
| R | Existing persistent R / knitr session | R, rmarkdown, knitr, jsonlite, Pandoc; `NOTDOWN_RSCRIPT` can specify Rscript |
| Python | Jupyter of Python kernel | Python 3.9+, jupyter_client, ipykernel; it is recommended that `NOTDOWN_PYTHON` points to Python of the virtual environment |
| Julia | Jupyter of IJulia kernel | The above Jupyter client environment and Julia/IJulia; Julia are implemented `using Pkg; Pkg.add("IJulia")`Make sure kernel is installed where the client can be found |
| Observable JavaScript | Isolationiframe In the InteriorObservable Runtime | runtime, stdlib, Inspector, Inputs, Plot and Observable syntax interpreters packaged with the application; no Node/Python kernel required |

Python environment example:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install jupyter_client ipykernel matplotlib
$env:NOTDOWN_PYTHON = (Resolve-Path .venv\Scripts\python.exe).Path
npm run dev
```

`NOTDOWN_PYTHON` It is also used for connectingJulia kernel，Not meant to be usedPython ImplementationJulia。Try when not configuredPython launcher、PATH、Virtual environments andWindows CommonPython Installation location; not used for non-compliance with version requirements or missingjupyter_client The environment.kernel The following is a list of`NOTDOWN_JUPYTER_PYTHON_KERNEL` / `NOTDOWN_JUPYTER_JULIA_KERNEL` Select by defaultkernel spec oflanguage It matches.`NOTDOWN_JULIA` CoveredIJulia ofJulia The document can be executed.`JUPYTER_DATA_DIR` Additional kernel data directories can be specified,`PANDOC_PATH` Choose R Markdown to Pandoc. Environmental failure will show installation prompt in the result view.

The first is the "Special Meeting" in the following sections:R、Python、Julia No variables are shared between. Single window requests are executed in sequence, up to fourJupyter kernel And twoQuarto R Meetings, running overtime60 Seconds, empty space15 The process tree ends and resets the session. The process workbook is a temporary directory for an independent system, and does not automatically deliver knowledge base files to the executor.R/Python/Julia The program still has system permissions for current users.

All of the blocks in OJS already run share a responsive module, with each block's output and interaction controls displayed directly below the block, no longer opening separate panels. Dependencies can be defined first; definitions or changes to the slider are then recalculated depending upon dependencies. The normal or inline editor retains the defined execution, with only the execution node of its own source code changes showing an expired prompt. Modification code will not be executed automatically, and the corresponding block will be manually re-run after the update; block deletion or switching the block language removes its OJS definition. Each executable object has independent stability status, and the front inserting of other blocks does not cover the already defined or send the results to the wrong object. Rebooting or leaving the page releases the module. OJS sandbox only enables scripts, and does not allow co-source permissions; the parent application does not expose the API vault when running. Third-party HTTPS modules/data networks and CORS support. The block displays the use of isolated DOM mirrors and the forwarding of input/change/click/submit events, supports regular Inputs controls and static Plot; arbitrary custom keyboard/pointer events, file uploads, animations or cross-domain restrictions of Canvas do not guarantee full interaction. Locally `FileAttachment`The R/Python `ojs_define` The bridge is not yet accessible.

Currently only these four primary languages are enabled. Ordinary JavaScript/Node, SQL and other Jupyter kernels will not automatically become executable fences because of the existence of an interpreter; subsequent addition of languages ​​requires registration of grammar, kernel selection and output contracts. Persistent result caching, interactive stdin, ipywidgets, Shiny, debugger and statement-by-statement running are not supported yet.

<a id="验证与参考"></a>

## Validation and references

History record (the automatic expansion behavior has been replaced by the current "insert without popping" requirement): 2026-09-25 Chunk Insert interactive revision: the empty block inherits the last language, and the anchored drop-down list is expanded after insertion; the up and down arrow keys, enter, Escape, click, language memory after reloading and direct input after selection are all verified by Chrome. Language switching now strictly preserves code content, replacing the previous behavior of switching option comment prefixes and inserting old R header comments. Chunk/inline's expand arrow has been removed. `npm test` 741 passed, 4 skipped, 0 failed; `npm run test:e2e -- tests/e2e/executable-language.spec.ts tests/e2e/quarto.spec.ts tests/e2e/rmarkdown.spec.ts` was built successfully, 22 passed, 1 skipped (Python environment variable was not configured), new interactions and related use cases were retested, and all 7 items passed. Log `.run/logs/chunk-dropdown-*`, interface screenshot `.run/logs/chunk-dropdown.png`; all tests use temporary vault.

The results of this operation and the regression of all failed browsers can be found in [ 2026-09-25 verification record ](../verification/QUARTO-2026-09-25.md).

- `tests/unit/quarto.test.ts`: Dialect isolation, original text round-trip, retention after editing, option boundaries, import, request validation and variables/images/stop/isolation of real kernel. `NOTDOWN_PYTHON` enables the actual measurement of Python, and additionally sets `NOTDOWN_TEST_JULIA=1` to enable the actual measurement of IJulia.
- `tests/e2e/quarto.spec.ts`: Independent temporary vault and Chrome; interactive entrance, real Python output, OJS responsive control and sandbox, and the results are not saved on the disk.
- Official: [ Quarto language support ](https://quarto.org/docs/faq/), [ inline code ](https://quarto.org/docs/computations/inline-code.html), [ execution options ](https://quarto.org/docs/computations/execution-options.html), [ Observable JS ](https://quarto.org/docs/interactive/ojs/), [ Julia ](https://quarto.org/docs/computations/julia.html).

Result revision within 2026-09-25 block: inline R label changed to `r`. Result expiration is judged based on the source code of the execution node itself, covering asynchronous results during ordinary text editing, only changing one block, undo, and unrelated editing. OJS removes independent panels, and responsive results and common Inputs controls are located directly below each block; verify native keyboard adjustment slider, cross-block update, collapse, clear, rerun and isolation permissions. All unit tests passed 746, skipped 5, and passed the build; 38 items passed Chrome regression, including real R/Python/Julia/OJS sessions. The test uses a temporary vault, logs `.run/logs/ojs-embedded-unit.log`, `.run/logs/ojs-embedded-regression.log`, and screenshots `.run/logs/quarto-ojs.png`.
