<a id="html--web-embed-验证2026-09-27"></a>

# HTML / Web embed validation (2026-09-27)

**English** · [简体中文](EMBED-DESIGN-QA-2026-09-27.zh-CN.md)

The scope is Notdown embedded containers and operations, based on six Notion screenshots provided by the user. The first four pictures are HTML, and the last two pictures are web pages. Trademarks, images and text embedded in web pages are external content and are not reproduced by the container. Use existing Notdown fonts, Lucide icons, Markdown codec and temporary test vault.

<a id="视觉对照"></a>

## visual contrast

- Source: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-dd91a72e-bfbe-4da8-84cd-e3960c8b89b0.png` (1057 × 285, HTML hover), `codex-clipboard-a965d0d2-8db0-4d29-b9fa-2578c0bb4fce.png` (1146 × 496, HTML menu), `codex-clipboard-c5255006-8e1a-4e62-9e27-5846b15621be.png` (1435 × 481, web page hover), are all user attachments in the Temp directory.
- Independent Chrome, desktop viewport 1440 × 1000, narrow screen 390 × 844, deviceScaleFactor 1. Preview HTML container 708 × 261 CSS px, web page container 708 × 433 CSS px; page content width follows Notdown, and drag height is determined by the text attribute.
- Implementation: `.run/logs/embed-preview-html-hover.png`, `embed-preview-html-active.png`, `embed-preview-web-hover.png`, `embed-preview-page.png`; screenshots of the automation menu are `test-results/embed-html-menu.png`, `embed-web-menu.png`, `embed-mobile-menu.png`.
- Side-by-side comparison: `.run/logs/embed-compare-html-hover.png` , `embed-compare-html-menu.png` , `embed-compare-web-hover.png` . Arrange them side by side with original pixels; the menu crops out the editing content area and does not scale the source image. Different page widths/external text are not used for pixel consistency judgment. Containers and menus are readable in these images, and no enlarged details are required.

<a id="发现与复查"></a>

### Discovery and review

1. First round [ P1 ] Interact The white text is covered by the editor's general button color, and the contrast is insufficient. Improve the priority of the local selector and rebuild and take screenshots; the second round of buttons has clear white text, and uses browser assertions to verify `rgb(255, 255, 255)`.
2. The first round of web page screenshots stayed in iframe and did not show the toolbar hover state. Change to hovering the toolbar and wait for its opacity to be 1 before taking a screenshot again; the floating buttons and the side/bottom/corner drag handles are all clearly visible.
3. Second round of P0/P1/P2 unresolved issues without container scope. HTML has a file name, thin border, mask, and black interaction buttons; when activated, you can select content and use forms; the web page has no HTML file title or mask. The description is located below the outside of the box, and the selected background is light blue.

Five surface checks: fonts should be used as application fonts, menu 16px, description 14px; spacing should be maintained as separate file headers, preview boxes and descriptions; colors should be gray controls, white menus, light blue selections and black and white Interact; there is no need to add new image assets, external web pages have built-in images to maintain iframe content; button copy should correspond to actual capabilities. The menu directly presents full screen/open and alignment options, and reuses the original block handle menu to provide source code, attributes and type conversion. No fake Notion comments, suggested changes, AI or cross-page mobile entries. Official Notion `<embed>` does not add custom layout and retains its native caption.

<a id="功能与数据验证"></a>

## Function and data validation

- `npm test`: 841 passed, 5 skipped, 0 failed (new attribute use cases will be executed separately).
- `npx tsx --test tests/unit/embed.test.ts`: 4 passed, covering description escaping, multiline/Chinese, layout and unknown attributes, undoing, and dialect boundaries.
- `npm run test:e2e -- tests/e2e/embeds.spec.ts`: The build is successful, 7 passed; after adding the download check, run the same group independently again, 7 passed.
- Test coverage: upload/drag/drop/cancel/failure/external refresh race, script isolation, URL verification, replacement, description real-time saving, drag/keyboard size, cancel drag, alignment, full screen, HTML download, search menu, copy/delete/undo, refresh recovery, narrow screen border, official caption and Typora original coding.
- Temporary preview of independent Chrome checks: `pageerror` number 0 . The preview uses a temporary vault and does not write user `vault/`.
- Extended regression: embedding, selection menu, dialect boundary total 15 passed / 2 failed. The failures were that `notdown-boundary.spec.ts:17` could not find the table Merge right button, and `selection-menu.spec.ts:244` could not find the narrow screen Text and background color button; the two failed use cases did not contain embed. The related table/text selection implementation has not been changed. Details are reserved to `.run/logs/embed-final-e2e.log` and no claims are made that the entire browser test suite passes.

<a id="实现清单"></a>

## Implementation Checklist

- [x] HTML / Web page view separation and actual interaction.
- [x] Layout, description into PM transaction and existing CAS save path.
- [x] The original carrier, unknown fields and dialect boundaries are preserved.
- [x] Directed browser verification, original screenshots and review records.
- [x] Chinese and English README and FORMAT boundaries updated.

<a id="用户反馈后的修订独立入口菜单差异与居中缩放"></a>

## Revisions after user feedback: independent entrance, menu differences and centered scaling

This section covers the previous first-round conclusions. Two practical issues were missed in the first round: HTML and Web share the insertion entrance; the universal `.pm-document > * { margin: 0 }` overrides the default centered automatic margin, causing the narrowed back to the left. The results of a previous check of only attribute values ​​cannot be used in place of actual location verification.

- [ P1 , fixed] Insert menu offers both HTML embed and Web embed, using different icons, search terms, empty states and forms. HTML newly reuses native `<embed>` and only uploads/replaces HTML files; Web only accepts URLs. Old HTML `web-embed` files are still saved in the original carrier. An empty HTML block will not become a Web insertion form after being saved, reloaded, or canceled.
- [P1, fixed] HTML top bar only retains full screen and more; menu provides Turn into → File, Download, Align submenus, and More options → Full screen / Open in browser. The Web floating bar provides alignment, description, opening and more, and the menu directly lists full screen/open/original links without HTML file operations. HTML only has bottom/corner drag handles; Web also has two side drag handles.
- [P1, fixed] Increase selector priority for center/left alignment rules, scaling is calculated based on parent container content width. The browser verifies that boundingClientRect is read directly: the center points of HTML and Web are less than 1px from the center of the parent container during dragging, after letting go, and after saving and reloading; the keyboard zoom in the column also keeps the center unchanged.
- [P1，Repaired] First edition of the sub-menuhover I'm going to go again.click When triggered by the nativesauto popover The sub-menu is changed tomanual，The parent menu is united; the mouse is retested;Escape、The transfers and withdrawals were approved.

The latest screenshots: `test-results/embed-distinct-insertions.png`, `embed-html-menu.png`, `embed-web-menu.png`, `embed-html-centered.png`, `embed-web-centered.png`; desktop 1440 × 1000, density 1. The latest preview screenshot is still `.run/logs/embed-preview-*.png`, HTML is 566.39 × 261 CSS px, and Web is 637.19 × 413 CSS px (80%/90% centered width). Regenerate the side-by-side diagram `.run/logs/embed-compare-*.png` from the same source reference diagram and the latest implementation and check that: the file header, gray interactive mask, toolbar, menu level, corner drag handle and outer description are consistent with the reference of the corresponding type. Apply fonts, different widths and test iframe text for clear product/sample differences. Unimplemented Notion comments and AI functionality do not display fake buttons.

Latest verification:

- `npm test`: 846 passed, 5 skipped, 0 failed, log `.run/logs/embed-split-unit.log`.
- Last revised directional unit tests for labels and menus: 14 passed, log `.run/logs/embed-split-final-unit.log`.
- `npm run build -- --outDir .run/embed-frontend`: Passed, log `.run/logs/embed-split-final-build.log`.
- Independent port 4347, independent build and run `playwright test tests/e2e/embeds.spec.ts`:10 passed, log `.run/logs/embed-split-final-e2e.log`. The default port of the original `npm run test:e2e` conflicts with another set of tests in the repository, so the final browser run of this round isolates the port and product.
- Preview uses a standalone temporary vault; standalone Chrome checks `pageErrors: []` . The user vault is not operated.

After the revision, there are no P0/P1/P2 unresolved within this scope.

final result: passed
