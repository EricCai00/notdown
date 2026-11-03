<a id="notion-ai-block-缓存恢复与-button-调查2026-10-28"></a>

# Notion AI block cache recovery and Button investigation (2026-10-28)

**English** · [简体中文](NOTION-AI-BLOCK-RECOVERY-2026-10-28.zh-CN.md)

<a id="已实现范围"></a>

## Realized scope

When the Notdown dialect is enabled with the desktop caching option, you can read only SQLite to recover the identified custom v3 AI block cue words and the full supported output subtree. `ai-block`The official Notion Markdown add-on, closed add-on, old cache or incomplete subtrees do not apply to custom recovery.

Public Block API provides the current block identity, type and editing time; the cache limit is the same as the account/workspace, and the child block requires the parent pointer to be consistent, with a maximum of 1, 000 blocks, 30 layers, and 10 MiB. When API only provides minutes, it can only check edit minutes and cannot prove atomic consistency across sources. Unknown configurations, prompt word mentions, unknown output nodes and missing sub-blocks are retained and the original public API sub-content is restored. The adopted original record and the available CRDT original data enter the batch archive and participate in the identity; the edited local copy is not overwritten, and the AI or button is not automatically executed.

Implementation: `server/notion-private-blocks.ts`, `server/notion-desktop-cache.ts`, `server/notion-block-import.ts` and `server/notion-import.ts`. For usage instructions, see [ Notion import ](../features/NOTION-IMPORT.md).

<a id="本机样本"></a>

## native sample

Rereading Test / Blocks : The AI configuration contains `ai_block_configuration_menu={type:custom,version:3,autofillInstructions:[["hi"]]}` , and `content` points to a subblock with text `Hi!` . The actual read-only cache and conversion function restore prompt `hi` and the result `Hi!`. This conversion validation uses simulated Block API times constructed from cache and is not a real cloud import acceptance of the new token. Connector reread still returns AI and button as unknown .

The original interface of Button can read the name `Insert block`, action `Insert blocks below button` and template `Inserted block`; SQLite only has `automation_id`, and the same ID is missing in `automation`, `workflow` and the checked `records`. After opening the settings, the cache definition is still not obtained, so the automatic action migration of ordinary button is not implemented. The source placeholder may not be described as a restored button.

This HTML export omits the button and the empty AI block at that time. There is no basis for judging the behavior of generated AI results in all HTML exports. The structured reading in subsequent pages still needs to be authentically verified; this time the Chrome debugging connection cannot be attached, the native development tool window control also timed out, and no action JSON that can be used for universal conversion was obtained.

<a id="验证与限制"></a>

## Authentication and restrictions

- Four new unit tests have been added, covering actual configuration shape, empty output, XML boundaries, old cache, missing/cyclic subtrees, unknown configuration/mark, account isolation, SQLite byte unchanged, CRDT reserved, dialect/off supplement, original archive, batch identity and existing local edit protection. A total of 9 passes with existing reminder tests.
- Full `npm test`: 1, 189 passed, 5 skipped, and an existing child-page-settings test had a Windows unlink error when cleaning the temporary directory; this file was rerun separately and 9 passed. This function has not been modified to circumvent cleanup errors.
- `npm run build`Passed. In the future, only the original data of CRDT on the server side will be retained and tested for refinement, and type checking and directional unit verification will be performed.
- Added isolation Chrome use case to verify prompt and output after preview/submit/reopen, no automatic generation and official dialect boundaries. The first related use case group times out in the context creation phase of the browser; a single new use case retry for 60 seconds still times out in the context creation phase and does not enter the assertion, so the browser acceptance cannot be considered passed. The available physical memory of the machine at that time was insufficient for 100 MiB; after terminating the browser started in this test, it was still insufficient for 500 MiB, and user applications or other task processes were not closed.
- Installed desktop programs have not been updated, user vault or Notion source content has not been modified. The complete migration of ordinary Button and the import of real cloud token have not yet been accepted.

The local logs are in `.run/logs/notion-private-*2026-10-28.log` and `.run/logs/notion-ai-live-conversion-2026-10-28.json`; the actual HTML export is in `.run/logs/notion-blocks-html-2026-10-28.html`. These logs are not used as input for warehouse testing.

<a id="016-发布复核"></a>

## 0.1.6 Release Review

When subsequent resources are available, the new AI import Chrome use case passes, and the verification cache prompt/output is still editable AI block after preview, submission, and reopening, and is not automatically generated; the official dialect continues to retain unknown. The full unit test also passed (1, 190 passed, 5 skipped), the 11 desktop test of the actual packaged program passed, and the installed version was updated to 0.1.6. The above restrictions are still retained for the whole chain acceptance of ordinary Button and real cloud token. For details, see [ Release Verification ](RELEASE-0.1.6-2026-10-28.md).

<a id="017真实连接的-ai-子块读取拒绝"></a>

## 0.1.7: AI sub-block read of real connection rejected

Then use the real connection saved on this machine to read-only preview Test / Blocks, and reproduce the 15 API request returning HTTP 400: AI block is marked as `has_children: true` in the public response, but `/blocks/<AI block ID>/children` returns `validation_error`, indicating that the current connection type does not support `ai_block`. 0.1.6 was aborted at the stage of discovering descendant pages and has not yet entered cache recovery; the original test sample incorrectly set `has_children: false`, and the browser use case also excluded descendant pages and did not cover the real request.

Fix only for first subchunk requests in which this explicit type is not supported error downgraded to warning, continues readable Markdown with verified cache recovery. 400 does not expand to other required reads and does not allow sub-block pagination of 400 midway through generating a partial preview. The error text reads at most 16 KiB and only extracts whitelist error codes and strictly matching block types; ordinary failure prompts the request path and does not display upstream messages, URL or credentials. For the meaning of the API error code, please refer to the [ Notion status code document ](https://developers.notion.com/reference/status-codes).

The same real connection preview after repair was successful, 2 pages were returned, AI prompt words and output were restored from the matching cache, and ordinary Button continued to retain the source placeholder; a verified reminder was also restored. This real preview closes attachment downloading and does not submit a copy to the user vault. It does not constitute acceptance of attachments, entire database migration, or all AI configurations.

Verification: Testing of the whole unit1,192 I'm going to go through this.5 The following is a list of the most common types of cell phones.Chrome Use groups10 The bill passed, containing the actual imported bullet window in theAI The sub-neck is still reached after being rejectedReady、The first is the warning, the permission to submit, and the second is the warning.AI prompt／Reserved after the output is restarted, official language boundaries and preserved failure protection. Test samples are now backed up with a clear, consistent response.AI Sub-headingsHTTP 400。0.1.7 ofTypeScript、Vite、Electron withNSIS The first is to build a real, real packaging program that11 The test was passed on the desktop.

After exiting 0.1.6 normally through the application menu and backing up the original program, the silent upgrade exit code of NSIS is 0 and the installed product version is 0.1.7.0. The installed exe and `app.asar` SHA-256 are consistent with the products that have been tested on the desktop. The token hash of the vault selection configuration and encrypted saved connection remains unchanged. The imported copy was not submitted to the user vault through this diagnosis.

The local evidence is located in `.run/logs/notion-http400-*` and does not enter the source code Git; the clear text connection token is not saved.

<a id="018button-的专用块复制数据"></a>

## 0.1.8: Private block copy data of Button

After reading the survey, the public connector still returns to Button unknown, the automation in SQLite, the action template and the associated records are still missing; Button's CRDT has only empty headings, no action definition. The new find is a block of Notion duplicate path: the selected source button is added to the Ctrl+C and Windows clips. `text/_notion-blocks-v3-production` Includes full `blockSubtree`and `automation`、`automation_action` and template blocks; normalHTML The source is only partly marked.HTML The conclusion that early screws did not achieve a motion-defining screws was only applicable to the interfaces and caches that were inspected at the time.

The actual sample's automation name is `Insert block` , the trigger is button , the only action is `duplicate_blocks` , and its empty text container holds a template subblock of text `Inserted block` . Compared with the editing interface of Notion, the action position is below button, and the template only displays this text. The Notion source button has not been implemented, nor has its action been modified.

Added explicit **Read copied Notion blocks** in the desktop pop-up window, which only extracts the copied Notion special format; does not collect the clipboard or login credentials in the background, and does not write back to the clipboard. Only the current pop-up window exists in the snapshot. Clearing, re-reading, and switching inputs will invalidate the old preview. Closing the pop-up window will clear it. Restore only works with Notdown dialects and is independent of the SQLite supplementary switch. API identity, type, parent and edit time, as well as workspace, automation and template parent-child chains in copied data must be checked.

The current conversion scope is a complete static "insert block below button" flow, which preserves the action sequence and full supported templates; unknown actions, positions, conditions, variables, formats, missing/looping templates, or conflicts remain placeholders overall. Adopt existing local `button` and `actions` protocols, do not automate or migrate cloud automation services; adopt record archiving to `copied-blocks/<buttonId>.json` and participate in batch identities. The maximum number of page copy snapshots is 5 MiB, the maximum number of templates is 1, 000 blocks, and 30 layers, and the maximum number of actions is 50 steps.

Perform read-only preview with actual copied data and real local connection, successfully return to 2 page, restore Button, template and source archive, AI block remains restored at the same time. Attachment downloading is closed for this real preview, and no copy has been submitted to the user vault. Automated testing uses isomorphic fixture with real identity removed.

Verification results: Full unit test1,196 I'm going to go through this.5 The following is a list of the countries of the world:Chrome Return to the country15 The following are the steps taken to complete the process: copy, add, read/remove, preview, fail, click execution after import, unstep withdrawal, save and restart, andAI、The first is the connection and the import and the return.0.1.8 ofTypeScript、Vite、Electron andNSIS The actual packaging process is12 The tablets are approved and addedIPC In the test process, the scrapboard is replaced by the example, verifying that only explicit reading is required to call the bridge, the source page is automatically filled, the bullet window is closed, the snapshot is removed, and the system scrapboard is not changed.

After the old version normally withdrew and backed up, the installer withdrew code to 0 and the native product version to 0.1.8.0; exe and `app.asar` The SHA-256 is consistent with the product tested, and the vault selects the configuration and encryption of the token hash. The program update does not replace the existing notes; it is necessary to read the duplicate data and re-preview it and import new copies.

The local investigation and verification log is `.run/logs/notion-button-*`, and the real replication data does not enter Git.
