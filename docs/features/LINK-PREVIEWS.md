<a id="link-preview"></a>

# Link previews

**English** · [简体中文](LINK-PREVIEWS.zh-CN.md)

Enable `local_link_preview` (Notdown is enabled by default) and paste the GitHub / OneDrive / SharePoint HTTPS link in the text. The menu provides Link, Mention, and Preview; keyboard ↓ enters the menu, ↑/↓ moves, Enter selects, and Escape remains a normal link. Code blocks and dialects with extensions turned off do not pop up this menu.

GitHub PR / Issue cards use two lines of avatar, title, status and meta information; the warehouse displays the name and author; the code link displays the file name and code, with a maximum of 200 lines and 40, 000 characters. Links can contain `#L2-L8`. When the branch name contains `/`, use the encoded branch name (`feature%2Fbranch`), or use GitHub or commit permalink to avoid branch and file path ambiguity. GitHub Enterprise is not supported.

OneDrive / SharePoint cards are displayed with large thumbnails and a file information bar at the bottom. Expand preview opens the large image; View document requests the short-term preview address of Graph on demand and loads it in the restricted Microsoft iframe. This viewer only supports OneDrive for Business / SharePoint; the original link, fallback title, and Open original will be retained in case of service denial, no thumbnail, or unsupported file type. Personal OneDrive can read file meta information/available thumbnails, and cannot promise inline preview of Graph documents.

<a id="连接"></a>

## Connections

Settings → Link previews supports saving, replacing, and disconnecting individual token per provider:

- GitHub Public repositories can be read anonymously. Private warehouses use corresponding warehousesContents / Issues / Pull requests Read permissiontoken。
- OneDrive uses Microsoft Graph access token. `/shares` API The official minimum delegation authority is `Files.ReadWrite`; an account is also required to access the shared file. Notdown does not modify the source files, nor does it actively redeem permanent share access rights.
- token is only saved to the current vault `.notdown/link-connections.json` by the local service, API only returns whether it has been saved; pages Markdown, cards, browser local storage and error messages do not contain token. The file itself is a local clear text configuration and should be excluded before backing up/copying the entire vault. There is no OAuth login or automatic renewal, it must be replaced in settings after expiration.

Meta information is loaded when the page is opened and refreshed every minute while the page is visible. The successful result is cached in the server memory for 60 seconds, with a maximum of 100; for the same URL merge request, each service instance can have up to 4 parallel requests, each API request timeout is 15 seconds, and the response upper limit is 2 MB. Manual Refresh also respects the 60 second cache. Disconnecting/replacing credentials clears the cache and causes the current window card to be re-read. After URL changes, node deletion, and page switching, old request results cannot be written back to the new node; external data never dispatches text modification transactions.

<a id="编码与兼容"></a>

## Encoding and compatibility

```xml
<link-preview url="https://github.com/owner/repo/pull/42" title="Fallback title" custom="preserved"/>

正文 <mention-link url="https://github.com/owner/repo/issues/8">可选后备名称</mention-link> 后续文字。
```

`mention-link` This is the Notdown native inline encoding, not the Notion official export syntax. URL and hand-filled title / label / description / image are persistent content; real-time titles, status, short-term thumbnail addresses and code snippets only reside in memory. old `<link-preview>` The fields remained, and other sites still displayed static cards. Closed extensions, unknown fields, unclosed tags, and the same-named text in the code fences remained available for recovery.Mention Click on the details, includingEdit mention Can be editedURL and backup name; card suspension/keyboard focus display toolbar, editable backup attributes.URL、The backup fields and unknown properties are passed through the originalCAS Save the pathsMarkdown；The background refresh will not changerevision。

There is currently no general web page meta-information capture, OAuth, multiple accounts, automatic token renewal, external writeback, synchronization database, and cross-device synchronization. A real account is required to verify the access policy of the corresponding organization; automated testing uses simulated external responses and a temporary vault.

<a id="官方参考"></a>

## Official references

- [Notion Link previews](https://www.notion.com/help/link-previews)
- [Notion GitHub](https://www.notion.com/connections/github) / [OneDrive](https://www.notion.com/connections/onedrive)
- [GitHub Issues API](https://docs.github.com/en/rest/issues/issues)、[Repository contents API](https://docs.github.com/en/rest/repos/contents)
- [Graph shared file access ](https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0), [ thumbnail ](https://learn.microsoft.com/en-us/graph/api/driveitem-list-thumbnails?view=graph-rest-1.0), [ document preview](https://learn.microsoft.com/en-us/graph/api/driveitem-preview?view=graph-rest-1.0)
