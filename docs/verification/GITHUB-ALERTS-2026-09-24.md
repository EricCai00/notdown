# GitHub-style Alert verification

**English** · [简体中文](GITHUB-ALERTS-2026-09-24.zh-CN.md)

2026-09-24. Scope: appearance, direct insertion, editable titles, type menu, folding and dialect boundaries in the existing editor.

## Behavior and sources

- Inserting GitHub-style Alert immediately creates Note, without a dialog. Its icon opens a nonmodal menu with colored icons, readable names and color swatches. The same menu changes existing alerts and enables Collapsible.
- Titles edit inline. Editing the title or opening the icon menu does not toggle folding. The hollow chevron follows the title: right when collapsed, down when expanded.
- [Obsidian callout documentation](https://obsidian.md/help/callouts), its official Publish CSS and JavaScript were checked for all 27 keywords/aliases, default light-theme colors, Lucide icons and chevron placement/rotation. Only Obsidian and Notdown accept additional keywords, custom titles and folding. Other alert-enabled dialects keep the five basic types; official Notion does not gain these extensions.
- Notdown keeps GitHub colors/Octicons for Note, Tip, Important, Warning and Caution. Additional types use Obsidian colors and icons. The Obsidian profile uses its own palette throughout. Unknown types preserve their names and source; the presentation profile is derived without adding Markdown or YAML fields.

## Visual QA

- Reference: user image `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-ccf641bf-9eda-4534-bcae-7a1f45472184.png`, 1440 x 909. The previous reference/implementation comparison remains at [comparison](../../test-results/github-alerts-comparison.png).
- Current evidence: [five types](../../test-results/github-alerts-desktop.png), [narrow editor](../../test-results/github-alerts-narrow.png), [type menu](../../test-results/github-alert-type-menu.png), [expanded](../../test-results/github-alert-title-expanded.png), [collapsed](../../test-results/github-alert-title-collapsed.png). The obsolete insertion-form screenshot is no longer representative.
- Independent Chrome, temporary vault, viewports 1440 x 1000 and 620 x 1000, scale factor 1. No user vault or browser was used.
- Inspected the rendered screenshots: plain background, square 4px colored borders, matching icon/title colors, compact body spacing and readable menu rows. The narrow editor has no horizontal overflow. Existing system typography is retained.
- Fixed P2: the title input's default intrinsic width left a large gap before the arrow. Its minimum intrinsic size now lets the mirror text determine width; the final collapsed screenshot shows the arrow immediately after the title.
- Focus outlines in the expanded/collapsed screenshots are the intentional keyboard focus state after finishing title editing. The menu scrolls for all 27 options and supports arrow keys, Enter, Escape and outside dismissal.

## Validation

- Focused alert unit tests: 5 passed, including every built-in keyword/alias, palette selection, dialect isolation, raw Markdown preservation and HTML export.
- Production build with isolated output `test-results/alert-interaction-dist`: passed (existing bundle-size warning).
- Six dialect boundary browser cases passed. The final interaction run passed all 8 cases (five Alert tests and three shared Callout/Typora regressions), for 14 distinct passing browser cases; see `.run/logs/alert-final-e2e.log`.
- Browser coverage includes immediate insertion without a modal, reopening the icon menu, changing to Success while retaining title/body/fold, keyboard type selection, inline title undo/redo followed by typing, source switches, persistence/reopening and mouse/keyboard folding.
- Fixed a history regression found by the tests: workspace undo can recreate a node view, so title focus is restored on the current node's input instead of the disposed input.
- Full `npm test`: 642 tests, 635 passed, 6 failed, 1 skipped. The six failures concern backend YAML expectations (2), interrupted import (1), HTML sanitization (1), page actions (1) and page order (1), outside the Alert changes. See `.run/logs/alert-final-unit.log`; full-suite status is not green.
- A shared Callout run initially lost trace files because another test process used the same output directory. It was rerun with isolated `test-results/alert-browser` output.

Visual and focused Alert checks pass. Full-suite failures above remain unresolved in this task.
