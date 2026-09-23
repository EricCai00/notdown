# Block selection verification — 2026-09-22

## Behavior

Marquee selection uses full container bounds independently of drag-handle positioning. List items and plain nested text parents retain head-only hit testing so a child can be selected independently; highlighting a parent includes its subtree. List highlights extend into their list's marker/checkbox gutter. Dividers get a visible 12px selection target without changing document spacing.

The blue overlay lives outside the editable document and above block backgrounds. It uses `rgb(46 116 216 / 13%)`, producing `#e4edfa` on white, sampled from the supplied Notion reference. Node-view updates preserve ProseMirror's selection classes; native node selection is not painted a second time on marquee-selected blocks. Overlays follow resize, load and scroll events and are removed on cancellation, document changes, replacement and editor destruction.

## Evidence

- User's original problem screenshot: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-7bcb9f25-afc2-4d4a-a4ee-e2820ddf7458.png`.
- User's Notion reference: `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-f4663732-e161-4ee8-a18c-323b7c209d6a.png`.
- Final rendered component crop: `test-results/block-selection-preview.png` (720 × 963).
- Full coverage screenshot: `test-results/block-selection-all.png` (1440 × 3000).
- Independent Chrome, deviceScaleFactor 1, newly created temporary vault. Fixture content differs from the reference; comparison covers selection coverage/color, not unrelated app typography or layout.

The screenshot confirms full-width page links, checkbox/bullet coverage, complete Callout/Tabs/bookmark/column surfaces, and a single blue tint. The earlier native-selection double tint on the first block was fixed before the final capture.

## Checks

- `npm test`: 388 passed, 1 skipped, no failures.
- TypeScript/Vite build passed for both isolated output in `.run/block-selection-dist` and the final regular `dist` build.
- 47 Chrome tests passed across block selection, block spacing, editor interactions, callouts, tabs and text-selection menus.
- After final color adjustment, all 6 selection/spacing tests passed again.
- Coverage includes continuous selection across node-view updates, exact overlay bounds, container-bottom hits, independent nested children, closed toggles, empty blocks, window resize, unchanged Markdown, delete/undo and Escape. Existing regressions cover marquee from both sides and grouped dragging.
- The test server logs missing-resource requests; new selection tests assert no uncaught page exceptions, not an error-free network log.
- A current-workspace bookmark input's autocomplete assignment failed TypeScript during the final build. Writing the same `autocomplete="url"` attribute through `setAttribute` preserves behavior and allowed the build to pass.

## Boundaries

Hidden tab/toggle content belongs to its visible container, not a separate visible hit target. Marquee edge autoscroll and cross-page dragging remain unimplemented. The user vault was not modified.
