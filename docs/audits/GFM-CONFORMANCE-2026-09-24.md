<a id="gfm-规范覆盖与补齐"></a>

# GFM specification coverage and implementation gaps

**English** · [简体中文](GFM-CONFORMANCE-2026-09-24.zh-CN.md)

Basis: [ GitHub Flavored Markdown 0.29-gfm ](https://github.github.com/gfm/) (2019-04-06, 2026-09-24 verification). Input and official HTML use the existing `docs/fixtures/dialect-audit/cases.json` and `gfm.md` in the warehouse, a total of 677 official examples, retaining the original expectations and permissions, without rewriting historical audit results.

<a id="修复内容"></a>

## Fixes

| range | Added in this change |
| --- | --- |
| Strikethrough | Single and two wavy lines, reject local misidentification of three waves; start and end marks of different lengths do not mix. |
| Extended autolinks | Use the source code location of GFM tokenizer to process domain names, punctuation, brackets, entities and email boundaries to prevent incorrect links to `abcwww.example.com`; support standardized `mailto:`, `xmpp:` and single-segment resource paths. Code, existing links and HTML attributes do not participate in naked link conversion. |
| Task item | Space, Tab, newline delimited, ordered, unordered and nested tasks; editing continues to use real task items. |
| Table | GFM header is projected to `th`, column alignment is preserved; cell escape pipes and `<br>` are rereadable after editing. |
| Disallowed HTML | Nine types of labels become visible text according to tagfilter, and their readable original text is not executed or deleted; it is only applied to HTML token, and the code fence is not rewritten globally. |
| basic rules | GFM 0.29 inline HTML comment syntax; malformed tags are parsed as normal text; null references use legal editable nodes; loose list writeback retains paragraph spacing; ordered lists starting from 0 and similar nested outer formats are retained after editing. |
| HTML preview / export | Core GFM uses the same token parser to generate a complete HTML, and then performs security filtering; this prevents block-by-block disinfection from closing containers such as cross-block `details` in advance. The top-level cross-block HTML container provides a recoverable block of source code edits. Safe export preserves relative links, explicit anchors, task boxes, and table semantics. |

The rules of GFM are installed in `src/markdown-engine/gfm.ts`, and the access page already has codec. There is no replacement of the ProseMirror document model, no migration of the vault, and no changes to the CAS/Conflict Preservation Agreement. Other dialects retain their own tilde, autolink, and HTML annotation rules.

<a id="677-个例子如何判定"></a>

## How the 677 examples were evaluated

`tests/unit/gfm-conformance.test.ts`Check for each case:

1. `parseNative`Produces legal ProseMirror schema .
2. `serializeNative`Returns the exact same original text for unedited documents.
3. The GFM token renderer used in production is compared with the specification HTML and DOM, retaining the structure, URL, table alignment, checkbox status and code blanks; only eliminating entity coding, attribute order and inter-block layout blanks.
4. Comparison of the actual security export and the DOM of the corresponding specification output after passing the same security policy.

The default complete GFM has **668 / 677** examples that directly match the written HTML . The following 9 examples are the differences between the specification inheriting the basic chapter and enabling the extension, which cannot be hidden by turning off the default GFM extension or modifying the original fixture:

- **611、617、620、621**:Basic auto-link chapters expect bare URL/emails to be text; links should be generated after enabling § 6.9. The tests verify both the written expectations when the naked link extension is turned off, and the explicit expectations of the default full GFM.
- **140、141、142、145、147**: Basic HTML chapter outputs raw script/style; § 6.11 tagfilter requires escaping. The test explicitly applies tagfilter and then compares, while still retaining the source code.

The above two configuration/extended overlay semantics have assertions, **677 / 677** pass. This number is regression coverage for a given corpus and is not an unconditional certification for any input, all editing operations, or all GitHub website functionality.

Additional checks include markup edits, list tightness, task whitespace, pipes in table code, table hard wraps, CRLF, adjacent edits, HTML source code edits, cross-block tags, and pseudo-closed tags in code/comments. Browser testing uses standalone Chrome and temporary vault, checking header editing, links, tasks, tab-safe previews, mode switches, saves, reloads, and HTML folding structures.

<a id="明确边界"></a>

## Explicit limitations

- Applying HTML security filtering still removes executable attributes, dangerous URL, and disallowed elements; the output is not a verbatim copy of any user's HTML. HTML is presented with source code editing and safe preview, and does not promise to turn all HTML tags into independent rich text controls.
- coreGFM of completeHTML Export paths with additional product extensionsschema renderer separate. After enabling formulas, alarms, footnotes, etc., use existing extension implementations; these combinations are not included in this677 Example certification scope.
- GitHub users/teams mention, Issue/PR/submit references, custom warehouse links, upload services, maps and website charts, etc. are website capabilities; this time they are not declared to be GFM standard functions or have all been implemented.
- Other dialects such as CommonMark, Typora, Obsidian, Notion, etc. did not receive full compliance statements due to this return of GFM.

<a id="最终验证"></a>

## Final validation

- `npm test`: 671 item, 670 passed, 1 skipped, 0 failed; log `.run/logs/gfm-all-unit-final.log`.
- `npm run build -- --outDir test-results/gfm-dist`:Passed (TypeScript check and Vite build), only bundle size prompt; logs `.run/logs/gfm-build-final.log`.
- Already run `npm run test:e2e -- tests/e2e/gfm-conformance.spec.ts tests/e2e/markdown-workspace.spec.ts tests/e2e/markdown-blocks.spec.ts`。The first time a return to association was sharedPlaywright trace The directoryENOENT，The first is the use of independent construction, port and`--output test-results/gfm-browser --reporter=list` Run again,**16 / 16 passed**;Log `.run/logs/gfm-e2e-final.log`. This includes the two new GFM browser tests this time and is not a statement of completion for the entire browser test set.

All tests use temporary vault; no user `vault/` or MyBase master libraries are written to.
