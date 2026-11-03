<a id="符号自动替换"></a>

# Automatic symbol replacements

**English** · [简体中文](SYMBOL-REPLACEMENTS.zh-CN.md)

Notdown's `symbol_replacements` Editor plugins are enabled by default and can be turned off in the page extension settings **Symbol replacements**The code is YAML. `syntax.extensions.symbol_replacements: false`- It's just that... `syntax.variant: notdown` The other dialects, even if explicitly set `true` It's not enabled.

This is an input aid for text visual editors, not the new Markdown syntax. Replace when entering the last character and save the normal Unicode; source code view, loading files, pasting and importing will not execute this plug-in. Original text retention, unknown fields and CAS saving still use the existing mechanisms.

| input | result |
| --- | --- |
| `->` | → |
| `<-` | ← |
| `<->` | ↔ |
| `=>` | ⇒ |
| `<=>` | ⇔ |
| `<=` | ≤ |
| `>=` | ≥ |
| `!=` | ≠ |
| `+/-` | ± |
| `...` | … |
| `(c)` | © |
| `(r)` | ® |
| `(tm)` | ™ |

Press Backspace immediately after replacement to restore the characters before the last replacement. The double-headed arrow input is replaced twice: `<-` → `←`, then enter `>` → `↔` (`<=` → `≤`, then enter `>` → `⇔`); immediately backspace to restore to `←>` / `≤>`, or turn off the switch and enter the complete ASCII. `←>`/`≤>` themselves also serve as input aliases for bidirectional arrows.

The plug-in avoids code blocks, inline code, link formats, backslash escapes, URL , long operators, and prepending with unparsed backticks or dollar signs. Formulas and original source code nodes are not involved in replacement. Retain the original bold and other formats, do not cross inline atomic substitutions, and do not preempt the `---` separator line. Rules are case-sensitive; smart quotes, dashes, and emoji are outside the scope of this plugin and existing `smart`/`emoji` extensions continue to be controlled independently.

<a id="notion-参考与边界"></a>

## Notion references and boundaries

As of 2026-09-23, the consulted [ Notion official shortcut document ](https://www.notion.com/help/keyboard-shortcuts) lists bold, italic, inline code, strikethrough, list, to-do, title, fold, quote and emoji input shortcuts, but does not provide a complete ASCII → Unicode symbol replacement table. Therefore, the above table is a clearly implemented rule of Notdown and cannot be regarded as the official complete rules of Notion or Enhanced Markdown specification.

Verify coverage: `tests/unit/symbol-replacements.test.ts` and `tests/e2e/symbol-replacements.spec.ts`. Browser validation uses isolated temporary vault and Chrome.
