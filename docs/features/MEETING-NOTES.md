# Meeting notes

**English** · [简体中文](MEETING-NOTES.zh-CN.md)

2026-10-27: The old attribute title/transcript is edited to use the official title text and Transcript partition; audio/language is merged into the existing meeting-config, retaining local transliteration capabilities and unknown configurations. For details, see [ reserved extensions and reasons for ](../reference/NOTDOWN-EXTENSIONS.md).

Use dedicated NodeView for meeting notes: title and date, participant entrance, Notes / Summary / Transcript tags, Settings and Start transcribing, bottom summary instructions and consent prompt. Empty notes display placeholder notes, and the text still belongs to a single ProseMirror document; the label only hides the partition and does not move or copy the text. Titles can be double-clicked or renamed from settings; new meetings use today's explicit date value and won't drift when reopened.

date using existing `mention-date` Title syntax, directly reuse the text mention `DateMentionView` with `date.css`, there is no independent meeting calendar. The monthly calendar, date range, time, format, time zone, reminder, keyboard operation and viewport positioning are shared under Notdown; the meeting title reminder enters the existing local reminder service. With the official independent date/time field, the menu is no longer restricted: Notdown provides a complete local menu, the official dialect opens native date, time and IANA time zone, the format is only displayed in the current node session, and does not write Notdown extensions or local reminders. Modify access to existing unified undo history; clearing, re-adding, view switching, and external title updates all clean up the old panel. The participant portal adds existing character mentions of People local contacts and does not send invitations. Old attributed titles retain their original encoding and can still be edited from settings.

Summary commands include Auto, Candidate Interview, Customer Call, and Stand-Up. You can edit prompt words, set default items for the current meeting, hide or add custom items from the menu. The language menu provides choices such as Chinese and English. The menu supports keyboard operation, Escape and external click closing. Default items and menu customizations apply to the current meeting and do not modify global settings.

<a id="语法与保存边界"></a>

## Syntax and persistence boundaries

The official `<meeting-notes>` retains the title-first header and `<summary>`, `<notes>`, and `<transcript>` partitions. Unknown attributes and code fences are retained in the original text, and existing user files will not be migrated.

Only `syntax.variant: notdown` interprets and writes the block attribute `meeting-config`. It is a JSON string, escaped by the XML attribute, and the fields include `language`, `audio`, `selected`, `default`, `hidden`, `custom`, and `prompts`. Unknown fields are merged and retained; existing configurations that cannot be parsed are refused to be overwritten and a prompt is displayed. This attribute supplements the conference UI attribute that is not provided in the official format and does not add a new text block protocol. The interface configuration under `notion-markdown` is only valid in the current node view session. The imported content containing this attribute remains the original text, the extended semantics are not activated, and the explicit extension switch cannot bypass the boundary.

Set changes using document transactions, undo and existing createVault / baseRevision CAS save links. Copying the text does not modify the document. Copying a block or label link under Notdown reuses the Obsidian block anchor point; if there is no anchor point, a new anchor point will be added and needs to be saved with the page. When the official dialect has no available position anchor, copy the page link and clearly prompt it, and do not forge unresolved positioning URL.

<a id="服务边界"></a>

## Service boundaries

- Start transcribing requires confirmation of the consent of all recording participants before selecting audio and video or using uploaded files; the files are saved through the existing `/assets` upload interface.
- Transcription calls compatible services configured in Settings; there is no live microphone recording, system audio capture, or speaker recognition yet.
- The transcription result of the official partition container is written to Transcript and does not overwrite Notes / Summary. The old local container keeps its Markdown encoding and the result is appended to the original body.
- Generate summary sends the current notes and transcribed content to the configured text service according to the selected command, and explicitly generates Summary without automatically executing it in the background.
- If the meeting has changed when the request returns, the results are only displayed as resumable text and new edits are not overwritten; the old view is not written back after removing a node or leaving the page.
- The consent prompt can be read aloud; does not include Notion presentations, feedback, cross-page Move to, or online membership invitations.

Verify using a temporary vault with standalone Chrome , see `tests/e2e/meeting-notes.spec.ts` and `tests/unit/meeting-notes.test.ts` .
