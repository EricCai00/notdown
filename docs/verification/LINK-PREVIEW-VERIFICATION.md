<a id="link-preview-验证2026-09-22"></a>

# Link Preview validation (2026-09-22)

**English** · [简体中文](LINK-PREVIEW-VERIFICATION.zh-CN.md)

See [ LINK-PREVIEWS.md ](../features/LINK-PREVIEWS.md) for implementation and usage boundaries. The test uses a temporary vault and standalone Chrome, and does not write to the user `vault/` or MyBase main library.

- `npm test`: 389 item, 388 passed, 1 item skipped due to system symbolic link permission, 0 failed.
- TypeScript check and production build passes. To prevent other tasks from concurrently building replacement `dist/` , the browser returns to using the independent build directory `test-results/link-preview-build` .
- Link Preview browser use case 5 items pass: paste menu, keyboard, undo redo, Markdown save and reopen, connection settings, OneDrive viewer, fallback on failure, expansion switch, code block, expired request isolation, attribute editing, unknown fields and narrow screen.
- Full browser regression 184 item: 182 passes the first time, 2 fails. The sidebar drag conflict use case passed alone; the nested paragraph use case polled for the first time and read a page that did not have `syntax` before saving. The wait assertion has been allowed to allow this initial state, and the original final persistence and overload assertions have been retained. Both were passed in the final re-run together, without describing the re-run as a complete package, all green in one go.
- GitHub public repositories pass real API smoke checks; private GitHub and OneDrive permissions/organization policies have not yet been verified using real accounts, automated testing simulates these external responses.

Screenshots are saved in `test-results/link-preview-github.png`, `test-results/link-preview-onedrive.png`, `test-results/link-preview-narrow.png`. Browser testing verifies that real-time meta information is not written to Markdown and the text of revision is not changed. URL and hand-filled backup content continue to be saved through the original CAS path.

The original process of developing the backend has not yet loaded the new interface. Automatic approval rejected the restart operation (`blocked by policy`), and you need to restart the existing development service before using this function. No user vault content has been changed for this purpose.
