<a id="notion-v2-行内文字色与背景色2026-10-27"></a>

# Notion v2 inline text and background colors (2026-10-27)

**English** · [简体中文](NOTION-DUAL-COLORS-2026-10-27.zh-CN.md)

<a id="问题与修复"></a>

## Issues and fixes

Using `<span color="red"><span color="yellow_bg">Both</span></span>` reproduces the color coverage problem of Notion Markdown v2: the inner and outer layers share a color mark, and the original analysis will replace the inner layer with the outer layer, losing the background channel. The native inline adapter of Notdown has been merged by channel, but the saving results of different parsing paths and v2 are inconsistent. The color menu also only allows Notdown to retain two channels, with official mode clearing the first item when setting the second.

After repair, the nested span merges the text color and background color respectively. The same channel is given priority by the inner layer and unknown attributes are retained. Both modes of v2 can set and clear two channels respectively; transaction filtering and serialization boundaries accept internal dual-channel representation. Use nested existing `color` tags when saving, and do not add new custom attributes. `bg_color` source properties are still only interpreted in Notdown, and the official mode continues to be unsupported restorable source.

The unmodified original text continues to be reused; there is no batch rewriting of files, migration of old versions, or modification of the user vault. The official mode of untagged v2 retains the original single-channel editing restrictions, and the old Notdown custom dual colors continue to be compatible.

<a id="官方来源与能力边界"></a>

## Official sources and capability boundaries

- [Notion-flavored Markdown ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) defines `span color`, the `_bg` form of color, and label nesting rules. The native reader preserves nested semantics by two color channels.
- [Rich text](https://developers.notion.com/reference/rich-text) of `annotations` There's only one `color` The following is a list of the official languages of the Republic of Kazakhstan:[Block](https://developers.notion.com/reference/block) Block colors are also available. Thus, the block background is not the same storage structure with the same text color combined with the same line-inside range of independent pairs.

What is verified here is the display, reading and writing of local Markdown. The real Notion Markdown write interface is not used to verify whether the nested dual colors are fully accepted and returned. Local lossless saves cannot be expressed as Notion cloud round-trip guarantees, nor can colors that were not returned by the original API be remade.

<a id="验证"></a>

## Validation

- Directed unit testing: `notion-v2`, `inline-colors`, `notion-markdown`, a total of 48 items passed. Covering two nesting orders, same-channel coverage, local scope, unknown attributes, readback after editing, clearing and disabling extensions respectively; official mode explicit customization of `bg_color` still retains the source code.
- `npm test`Finally, 1 was run, 091 was passed, 5 was skipped, 1 failed. `browser-vaults` The temporary HTTP service is reported by Node fetch `bad port`The document was not published in color, and failed; both documents were passed separately.
- `npm run build -- --outDir .run/notion-dual-colors-frontend`: Passed, contains TypeScript check.
- The first is the independent Chrome with a temporary vault:`selection-menu`、`notion-v2-import`、`notion-boundary` 20 has been adopted. The red-light compute style, color modification, separately removal, revocation, retention and existing grammatical boundaries have been verified.
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-colors-x64.exe`:Passed. The fix package is located in `.run/desktop-release/Notdown-Setup-0.1.3-colors-x64.exe` (205, 176, 769 bytes) and includes the previous subpage and code-tag fixes; does not automatically replace the running installation.

The full browser suite is not implemented this time. The execution log is located at `.run/logs/notion-dual-colors-*.log` and the screenshot is located at `test-results/notion-dual-colors/`.
