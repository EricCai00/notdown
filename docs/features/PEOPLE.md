<a id="people-本地通讯录"></a>

# People: a local address book

**English** · [简体中文](PEOPLE.zh-CN.md)

People is the contact directory of the current vault and does not create accounts, collaborators, guests, permissions or notifications.

<a id="使用"></a>

## Usage

- The People shortcut entrance is hidden by default; it is opened in **Workspace settings → Sidebar → People**. Contact mentions and management portals in the text are still available.
- Sidebar **People → New person**, fill in the name, and optional email, phone number, organization and remarks, select **Save person**.
- The search supports the above fields, is not case sensitive, and multiple words can match different fields. Contacts with the same name retain different ID, and organization or mailbox help is displayed when selected.
- Page / Split Input into the rich text area `@` After searching for contacts, mouse or direction key/Enter option, Esc is deleted. **Manage people…** New build, click again **Mention person** Return to the original input.
- `/Mention person`Open the same contact selection interface. Tags are written in the source code area through the insert menu; the source code does not provide @ automatic completion.
- Click on an existing mention to open the contact details. After renaming, the text will not be migrated in batches; after deletion, it will no longer appear in the mention suggestions, and existing mentions will still be displayed and marked for deletion; **Show deleted people → Restore person** restore the original ID.
- Date suggestions continue to appear in the same @ menu. Completion will not occur after disabling `notion_mentions`; code blocks, inline codes, and mailboxes will not be triggered.

<a id="文件"></a>

## Files

Each contact is stored in `vault/people/<uuid>.yaml` with `id/name/email/phone/organization/notes/deleted/created/updated` and an optional `notionUserId`. Names are required; other text fields may be empty. Existing `.yaml` / `.yml` paths, unknown fields and YAML comments survive updates. Ordinary contacts use independent UUIDs; imported Notion users use UUIDs derived from their source identity. No MyBase IDs are assigned. The API-only `revision` is the complete file's SHA-256 and is not written into YAML.

The text still uses `vault/pages/*.md` as the truth:

```xml
<mention-user url="person://550e8400-e29b-41d4-a716-446655440000">Eric Cai</mention-user>
```

`person://`It is a local contact identity; external `user://`, unknown attributes and original text will not be automatically migrated, nor will the contact with the same name be associated by name. Names in text tags are displayed as fallback; remain readable when contacts are missing or exported to external Markdown/HTML. The editor displays the current name after reading the directory; directory changes only refresh the contact view, and do not generate text transactions or use new pages revision.

Notion `user://` mentions match contacts by `notionUserId`, or through an explicit binding in **Import → External references**. Unmatched users appear as gray, non-clickable “@Unknown user” labels. Later imports with complete user profiles or manual bindings reveal the contact's name and allow opening its details. ID-only partial users never create invented contacts. Complete named users may create local contacts during import; existing contacts are never overwritten or restored. See [External references and users](NOTION-IMPORT.md#external-references-and-users).

<a id="并发与恢复"></a>

## Concurrency and recovery

`createVault.people`Shared queue with page writes. Editing, deletion, and recovery must carry the `baseRevision` when reading, and if there is a mismatch, 409 is returned; retry is not forced. Save original YAML to `.history/people/<id>/<revision>.yaml` before updating. The conflict saves the disk version and the written version as `.history/people/conflicts/<conflict-id>.current.yaml` and `.proposed.yaml` respectively, and saves the JSON index.

The form retains the original revision and background updates do not overwrite the fields being edited. The conflict interface can compare each field and explicitly load the disk version; to restore your own version, you can view the conflict files and merge them manually. Contact conflicts are independent of the page conflict list, and a universal contact history browser is not yet provided. Close/reopen People to retain unsaved forms in the current window; contacts should be saved before refreshing the entire page.

The test uses a temporary vault and independent Chrome, does not write user `vault/`, and does not connect to the user's browser.
