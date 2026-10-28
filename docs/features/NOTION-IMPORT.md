# Notion API 单向导入（Markdown v2）

侧栏 **Import → Import from Notion API** 将有权读取的页面、数据库和数据源导入为本地副本。新导入使用 `GET /v1/pages/{id}/markdown?markdown_version=v2&include_transcript=true`，API header 仍为 `Notion-Version: 2026-03-11`。不使用应用的 Markdown/CSV 导出，不写回 Notion。

## 使用

1. 为 Notion connection / integration 启用 **Read content**，并共享目标页面及后代。
2. 首次输入 token，之后在同一设备自动填充；清空 token 输入框可删除保存值。再输入页面、数据库或数据源 URL/ID。支持 `app.notion.com/p/...` 和 `notion.com` / `notion.so` / `notion.site` 链接；查询参数里的视图 ID 不当作页面 ID。
3. 默认包括后代页面、数据库，以及正文中 Folder 入口的后代；默认保存可下载的附件、封面和自定义图标。可分别关闭后代读取和附件下载。指定数据库/数据源自身的记录仍会读取。
4. 默认选择 **Notdown**，允许恢复模板按钮、面包屑等本地补充能力；**Notion Markdown** 也恢复官方 v2 可表达的内容，但不启用这些补充标签。
5. **Preview** 展示将写入的 Markdown 和警告。更改选择会使预览失效；**Import copies** 先保存当前页，冲突或保存失败会阻止提交。

公开 Markdown API 的日期标签不提供提醒配置。默认勾选 **Restore missing colors, Notdown reminders and AI blocks from this computer's Notion desktop cache**：在 Windows 本地服务上，只读打开 `%APPDATA%/Notion/notion.db`，补充可核对的双颜色，并为 **Notdown** 副本补充行内 reminder、已知日期显示格式和受支持的 AI block。导入前先在这台电脑的 Notion 桌面端打开来源页并等待同步；浏览器访问其他电脑运行的 Notdown 服务时，读取的是服务所在电脑的缓存。关闭该选项时不读取缓存；**Notion Markdown** 可补全既有嵌套颜色，但不添加提醒或 AI block 等自定义内容。

补充只使用 API 已读取的当前页块 ID，并限定同一缓存账户与工作区。要求块编辑时间、该块的日期列表和日期值一致，而且目标日期在页面 Markdown 和 API 块中都唯一；当 API 时间只有分钟粒度时比对编辑分钟，返回更细粒度时须精确相等。重复日期、旧缓存、缺失记录及未知提醒格式保持 API 原文并提示检查。分钟粒度的时间不能证明缓存与云端完全同步。当前范围为块正文 `rich_text` 中、缓存 `properties.title` 对应的行内日期；数据库 Date 属性、表格单元格、题注及同步引用内的提醒尚不恢复。代码和未知容器内的示例不触发补充。

读取采用 SQLite 只读事务，用后关闭；不读登录凭据，不写 Notion 数据库。实际采用的日期原对象、块版本及应用属性归档到 `.history/imports/<batch>/` 的 `desktop-cache/<pageId>.json` 来源条目，并参与批次身份。缓存不可读时 API 导入继续，预览明确提示；仅建立新副本，不覆盖已经修改过的本地日期。Notdown 日期面板仍提供完整 Remind、日期／时间格式、时间和时区设置；本地提醒不替代 Notion 云端通知。缓存更新机制、其他可取得字段和直接 SQLite 导入的限制见[SQLite 审计](../audits/NOTION-SQLITE-2026-10-26.md)。

AI block 仅恢复已识别的 custom v3 配置与完整可转换输出；当前支持不含提及或富文本 mark 的提示词，以及普通文本、标题、列表、待办、引用、Toggle、Callout、代码、公式与分隔线。按 `content` 读取同账户／工作区、父指针一致的存活子块，不跟随其他页面、数据库或同步引用。采用的原记录及可用 CRDT 原数据归档到 `private-blocks/<blockId>.json`，参与批次身份；CRDT 只保留，不解码或用来推断最新状态。不支持的配置或缺失输出保留来源占位，公开 API 可读的子内容仍按原流程恢复。缓存编辑分钟相同不等于跨来源原子快照。恢复的 AI block 使用本地已配置服务，只有显式 Generate 才生成；Notion 模型、凭据及自动更新不迁移。

Notion 可能将 AI block 标为有子项，却在读取子项时返回 HTTP 400，说明该连接类型不支持此块。遇到这个明确的 API 限制时，预览会提示并继续使用可读 Markdown 和已核验缓存；缓存不可用时保留占位和不完整内容警告。其他必需读取的 400 或分页中途失败仍阻止预览，错误提示包含请求路径和已知 API 错误码，不显示上游原始错误正文。

### 从已复制的 Notion 块恢复 Button

公开 API、HTML 导出和 SQLite 未必包含普通 Button 的动作定义。桌面版可显式读取 Notion 复制块时附带的专用 v3 数据：

1. 在 Notion 中选中按钮块，或选中包含按钮的页面块，再按 **Ctrl+C**。不要点击执行按钮；只选中文字并复制不包含动作定义。
2. 在 Notdown 的 Notion 导入弹窗中选择 **Notdown** 方言，点击 **Read copied Notion blocks**。页面地址为空时会填入复制来源页；仍须提供有效 API 连接。
3. 点击 **Preview** 核对源码与警告，再导入新副本。**Clear copied blocks** 会清除补充并使旧预览失效。

目前只恢复完整可验证的静态 **Insert blocks below button** 动作、按钮名称与受支持模板内容；复用已有本地 Button 协议和可撤销执行，不迁移 Notion 云端自动化。包含未知步骤、位置、条件、变量、格式或缺失模板的按钮整体保留来源占位，不生成可部分执行的工作流。API 块 ID、类型、父级和编辑时间须匹配复制快照，自动化、动作及模板须在同一工作区且父指针一致。API 分钟时间仍不能证明跨来源原子一致，复制后修改按钮须重新复制并预览。

只在点击读取按钮时检查 Notion 专用剪贴板格式，不读取普通文字、HTML、图片、登录 cookie 或其他剪贴板格式。最多读取 5 MiB；快照只保留在当前弹窗，关闭即清除，不写入系统剪贴板。采用的源记录归档到 `copied-blocks/<buttonId>.json` 并参与批次身份；不覆盖旧副本或本地修改。此补充不依赖桌面缓存开关，也不为官方 Notion Markdown 添加自定义按钮。

### 双颜色补全

预览自动核对同批 Markdown v2 与 Block API 的互补颜色：一个输出保留文字色、另一个保留背景色时，合并成嵌套 `span color`。启用桌面缓存选项后，还可从同一块的已核验双颜色标记补缺；两种 v2 方言均不新写 `bg_color`。预览中的源码和警告显示补全结果，修改缓存选择会使原预览失效。

当前自动范围为顶层段落和标题中的纯文字及文字 mark，包括代码、普通链接和粗体等。要求完整块文字在 Markdown 与 Block API 中均唯一，代码、链接及其他行内格式一致，且源码边界精确。重复块、冲突颜色、未知语法、包含原子提及的段落、表格与分栏等嵌套内容不猜位置，保留原文并提示。缓存还须匹配块类型、完整文字、其他格式及编辑时间；API 为分钟精度时只能核对同一分钟，不代表云端原子快照。

颜色来源、应用范围及采用的缓存原标记归档为 `color-recovery/<pageId>.json`，参与批次身份。关闭缓存仍会进行公开 API 互补补全。只补全此次预览的新副本；旧副本不自动重写，相同快照重复提交不会覆盖本地编辑。HTML 导出未接入此流程。

读取期间会实时显示已读取页数、当前处理的页面名称，以及内容恢复、附件下载等阶段。后代页面和数据库记录在遍历中逐步发现，开始时没有准确总数，因此预览使用不定进度条；此时内容尚未写入知识库。确认 **Import copies** 后总页数已确定，显示已导入页数 / 总页数、当前页面及写入进度条；完成页面写入后仍需完成数据库和归档收尾。页面标题尚未取得时暂以来源 ID 标识。

页数尚为 0 时也会显示具体步骤：检查本地已有副本、读取页面属性、识别数据库/数据源、分页查询记录、读取 Markdown、分页扫描子块、读取数据库视图等。每次请求区分等待 Notion 响应和接收响应；限流时显示等待秒数和重试次数。还显示 API 请求次数、已发现页数、总耗时、当前步骤耗时和距上次进度更新的时间。**Recent steps** 可展开查看最近八条步骤；这些信息只保留在当前对话框，不保存 token、完整请求地址或附件签名参数。计时持续增长表示仍在等待，不代表已经读取了更多内容；取消或结束后停止计时，失败时保留最后步骤供排查。

Token 输入后自动保存在当前设备，下次打开导入对话框时自动填充，预览成功或失败后均保留。替换输入会更新保存值，清空输入框会删除保存值。桌面版使用系统凭据加密能力保存到应用用户配置目录的 `notion-import-token.bin`，跨知识库及重启可复用，不受本地服务端口变化影响；加密不可用时提示保存失败，仍可使用本次输入。浏览器版保存在当前站点的 localStorage，仅同一浏览器配置和站点可复用，清除站点数据会删除。Token 不写入知识库、同步、导出、归档、日志或预览内容；关闭对话框会清空已移除的输入控件。授权请求只发往固定 Notion API 主机，禁止重定向；只有只读的数据源 query 使用 POST。附件下载不携带 token，每次重定向重新校验公共地址并固定 DNS 解析结果。关闭预览会取消读取。

## 读取与恢复顺序

Markdown 是正文基础。页面/数据库 API 读取属性，分页 Block children API 确认真正的子页面和数据库归属。`<page>` 始终是 Child page，Notdown 的 `<page-link>` 始终是 Link to page；相同目标不会改变块类型。普通 Markdown 链接和行内提及不会触发无界页面遍历。

v2 的 `<page>`、`<folder>`、`<database>` 同时接受单行和多行标签正文，分栏内也按原块类型显示。标题中的格式标签用于取得可读名称；未修改的原始标题、换行与未知属性保留。此前因多行形式显示为不支持的已导入页面，在使用修复后的应用重新打开时即可识别，不需要重新导入或批量改写正文。

v2 仍支持反引号行内代码。部分实际 API 响应也返回未列入当前官方语法文档的 `<code>…</code>`：**Notdown** 对无属性、单行的这种形式提供兼容读取，显示为行内代码，内部标签和链接保持字面文字。已有原文和相邻编辑保留原来的标签；直接编辑代码后使用标准反引号保存。**Notion Markdown** 模式不启用这项兼容，未知属性、缺失闭合及其他未知语法仍可恢复保留，不批量迁移已有文件。

对语法扫描确认的 `<unknown>`，先验证其**源块** Notion URL/ID，再读取并核对 Block API 身份。可直接转换的块使用真实响应数据；其余尝试以 block ID 请求 v2 Markdown，递归补取缺失子树，仍不可用时读取分页 children。模板使用可读取的子块配置本地 Insert blocks 按钮；导入期间不执行按钮。

代码围栏、行内代码、未知容器、标签属性和提及的字面标签不会授权额外读取或被全局 URL 替换。重复读取使用缓存，循环和过深子树保留占位并提示。`unknown_block_ids` 非空仍允许预览；警告不代表所有缺失内容均已恢复。截断且没有恢复 ID 时阻止预览。

### 页面链接与批次外目标

`<mention-page>`、v2 `<mention>`、Link to page 和普通 Markdown 页面链接共用来源 ID 映射：优先连接本批副本；目标不在本批时，连接当前知识库中具有相同 `notionImport.pageId` 的唯一可用页面。匹配不依赖标题，也不选取已删除页面或回收站内页面的后代。

Unimported targets retain their Notion URL in the source and their source ID in preview warnings. Multiple available copies remain ambiguous. The editor shows unresolved internal mentions and object references as gray, non-clickable “Unknown page”, “Unknown user”, “Unknown database”, “Unknown data source” or “Unknown location” labels. Ordinary URL hyperlinks, including Notion URLs, retain their text and normal web navigation without checking whether the destination exists. Mentions and Link to page do not recursively import destinations or change ownership. Notion block anchors in semantic mentions without a local block mapping appear as unknown locations; their original addresses remain available in source mode.

Localization changes only new copies in the current import. When a target is imported later, the external reference library resolves existing remote references by source identity. A unique available target restores local navigation without rewriting the original note or changing its revision. Titles alone never establish a match. Trash and its descendants are excluded; multiple copies remain unavailable until a target is explicitly chosen.

### External references and users

Open **Import → External references** to search names, types and source IDs, inspect resolution status, import batches and current remote references in note bodies/properties. Pages, users, databases, data sources and block locations have separate identities keyed by `notion:<kind>:<source ID>`. `metadata.json.externalEntities` stores source information, batches and explicit local bindings. Reference locations and availability are recomputed from current Markdown, properties, page origins and contacts. Imports extend the registry; existing notes also participate without a bulk content migration.

The panel defaults to unresolved internal references (including ambiguous matches). Enable **Include resolved references** to also see linked references. Local Wiki, Markdown page and location links participate; ordinary web URLs and registry entries with no current references are omitted. **Go to reference** opens the note containing the reference and selects that occurrence in the body, or opens its properties for a property reference. Repeated occurrences have separate buttons. The action goes to the referring text, rather than the linked target. Local link status is computed from current notes without changing their content or adding identity bindings.

Complete user objects with actual names returned by the API create local contacts with `notionUserId`. ID-only partial users remain unknown; no names, emails or permissions are invented, and no user-directory request is made. Later imports with complete profiles, or a new contact carrying the same Notion user ID, can resolve existing mentions. Later imports never overwrite or restore existing contacts, including deleted contacts.

The library can bind source users to existing contacts and source pages/databases to local objects of the same kind. Select **Match source ID automatically** to clear an explicit binding. Matching names never merge objects. Later copies cannot replace an explicit binding; deleting its target makes it unavailable, while restoring the target makes it available again. Saves require the library's `baseRevision`; conflicts preserve both versions without a forced retry. Records use the existing resource sync protocol, with the same experimental foreground-sync limitations.

If an inline database has pending edits when its external target changes, its draft remains intact and its reference becomes disabled with an explanation. Finish saving the table, then reopen the note to load the current target. A new target never replaces a table with pending input.

## 内容支持与剩余边界

有序列表的显式重新编号由来源决定。例如 `2、4、5` 可能由 Notion Markdown 接口返回为 `2. ...` 加上 `<ol start="4">` 的两项；这表示第二项重新从 4 起算。本地读取、编辑和重新打开均保留 `start`，不自动合并或改为连续编号。带颜色、子内容和未知属性的列表仍保留完整载体与属性，原始响应可在导入归档中核对。

代码围栏仅在出现语言注册表无法识别的非空标签时，才与同批 Block API 核对；菜单中的语言 ID、显示名及别名均视为已知，空标签及 Mermaid 也直接保留。已观察到 Markdown 接口把 `shell` 返回为 `shen`：仅在完整代码文本唯一匹配时修正未知围栏语言，保留代码、未知属性及原始归档，并归档修正依据。重复、歧义或缺失匹配时保留原文；不将所有 `shen` 围栏当作 Shell，也不批量修改已有笔记。此核对适用于 Notdown 和官方 Notion Markdown 两种导入方言，无需桌面缓存。

Block API 按页面、嵌套容器分页读取，不为每个代码块单独请求，并复用同批层级、样式和附件扫描已读取的响应。只有已知语言的页面不会为语言核对增加请求；含未知标签的页面可能产生额外分页或容器请求。为减少导入等待，不主动纠正被误标成另一种已知语言的围栏。

空语言标签与空代码正文分开处理：未指定语言的围栏不核对；正文为空但带有 `shen` 等未知标签的围栏仍核对。当 Markdown 和 Block API 在该页各有且仅有一个空代码块时可以恢复标签；存在多个空块、缺失或歧义时保留原文，不按顺序猜测，也不合并空行或填入占位内容。

| 内容 | 当前处理 |
| --- | --- |
| v2 正文 | 支持属性段落/标题、Toggle、列表、分栏、Tabs、表格、Callout、媒体和公式；普通正文按 CommonMark/GFM 结构解析。原文不变时保留字节，编辑后使用 v2 表示。 |
| v2 行内内容 | 支持格式标签、提及、日期/时间、讨论链接属性与 link-preview 标记。页面提及及普通页面链接优先连接同批副本，也可连接已有的唯一来源副本；未映射的块锚点保留远程。 |
| Bookmark / Embed / Link preview | 使用 v2 标签与真实目标恢复。富文本 caption 原文保留；当前 caption 编辑器编辑纯文本。Notdown 可保存额外卡片属性；官方模式仅编辑可表达的字段，抓取的网页详情用于预览。第三方服务仍可能拒绝嵌入。 |
| Template / Button | 可读取内容的旧 `template` 转为 Notdown 模板按钮。桌面版显式读取已复制的 Notion 块后，可恢复完整核验的静态“在按钮下方插入块”动作和模板；其他普通 Button 动作、条件或不完整配置保留来源占位。 |
| AI block | Notdown 开启桌面缓存补充时，按 Block API 的块 ID、类型和编辑时间核对缓存，恢复已识别的 custom v3 提示词和完整的受支持输出子树，写入现有 `ai-block`。空块同样可恢复。缺失子块、未知内容、带提及的提示词、未知配置或旧缓存保留占位与公开 API 可读内容。模型、Notion AI 运行服务、自动更新不迁移，不自动生成。 |
| Meeting notes | 请求可访问的完整 transcript，保留 Notes、Summary、Transcript 分区。服务未返回的转录、音频、配置无法补造。 |
| Mail | 正文和邮件头属性保留；附件 URL 尽量本地保存，不发送邮件、不同步邮箱。 |
| Custom block | 独立引用节点保存 definition ID 和实例 URL；API 未提供的定义实现、bindings 和渲染结果不执行、不伪造。 |
| 外部集成 / Form / Drive | `external_object_instance` 保存集成名称、标题和来源。`unsupported.block_type` 返回的 form/button/drive 等显示真实类型；服务端未提供的内容和交互保留来源入口。 |
| Folder | 跟随正文 Folder URL，用 Markdown endpoint 读取其直接内容并继续遍历；本地保存为带来源类型的容器页面。根输入仍面向页面、数据库、数据源。 |
| 同步块 | Notdown 中仅当同批有唯一、明确 source URL 的原块时写入本地 ID 并连接引用，复用本地同步块功能；其他情况保留快照与远程来源。官方模式不写补充 ID。没有 Notion 云端同步。 |
| 评论、权限、历史、自动化 | 仅保留正文/API 响应内已有的引用或元数据，不导入评论线程、权限体系、完整历史或自动化行为。 |

## 附件与数据库

- Notion 导入中的图片统一转换为独立图片块，包括列表、引用和容器内的行内图片；图片前后的文字按原顺序拆分并保留文字格式，题注、URL 和 title 继续保留。代码和未知语法中的图片示例不转换，原始 Markdown 归档不变。
- 默认勾选 **Import files, media, covers and icons into Attachments**。图片、文件、音视频、PDF、可识别的 HTML 附件、邮件附件和数据库 Files 字段复制到 `assets/`，与上传和 Markdown 文件夹导入统一使用 `<带连字符的 UUID>.<扩展名>`，不添加 `notion-` 前缀。UUIDv5 由内容 SHA-256 与规范扩展名确定，保留去重；旧文件名仍兼容读取。提交成功后统一进入侧栏 **Attachments**，可预览、下载、查询引用页面或再次插入。预览阶段不写入知识库。
- 附件的可获取文件名、MIME 类型、字节数、登记时间与 Notion 来源写入 `metadata.json.assets`。名称优先使用 Block API 的文件名、正文已有的 name 属性或数据库 Files 字段名称，再使用下载响应中的文件名、URL 中的文件名；File 卡片和 HTML embed 从附件元数据读取名称，包括打开已登记原文件名的旧附件。关闭后代导入仍会扫描当前页的块容器以读取文件名，不因此导入子页面。不把题注或临时签名参数当成原文件名。无法取得名称时保留存储文件名并显示未记录。封面写入页面 `properties.cover`；下载成功的自定义图标使用本地图片。emoji 原值保留；省略 emoji 显示标记的图标（如 `⚗`）在页面、侧栏、面包屑、标签页和页面链接中以 emoji 形式显示，显式的文字／emoji 显示标记仍遵循原值，无需重新导入。未设置图标使用 `file-text`。
- 单个附件上限 10 MiB，整批仍受 20 MiB 限制。不可访问、非公共地址、超时或超限时保留远程 URL 并警告，签名 URL 仍可能过期。HTML 的相对依赖资源不递归打包，外部集成的实时内容不属于附件副本。
- 重复提交同一来源快照仍不覆盖本地页面。若该批文件先前已下载但未登记，重试同一批次会在校验文件内容后补充附件登记，保留现有附件元数据和未知字段；不会批量修改旧正文，也不会覆盖已在外部改动的附件。
- 数据库、数据源、字段、选项和记录使用稳定身份；完整查询分页记录及长属性。记录正文仍是普通 Markdown，字段值写入页面 properties。
- Title, text, number, checkbox, date, options, status, URL, email and phone fields are editable. Relation values map same-batch targets; other targets retain their origin and unresolved marker, with later imports or manual bindings resolved at display time. Original rich text remains in the archive.
- People / Files preserve their source structures and remain read-only. People fields show linked contacts or non-clickable unknown users through the external reference library. Downloaded Files use local URLs and retain their source URLs. No local user accounts are created.
- Formula / Rollup 保留定义与结果，作为只读快照，不执行 Notion 公式。无法完整获取的聚合不伪造结果。
- 数据库容器、数据源和视图分别保存。一个数据库可以包含多个数据源；每个可读取的远端视图单独保存名称、身份和数据源绑定，同源视图共享字段及记录，不复制数据。链接视图引用的可访问数据源也按身份去重；直接输入数据源 ID 时，只导入该源及其视图。
- 视图列表和详情尽量读取并归档。Table、Board、Gallery、List、Calendar 映射到对应本地视图，保留属性顺序及明确隐藏的非标题字段；其他类型回退为表格并提示。能映射的标题／文本 contains 条件（AND）和标题、文本、数字、复选框排序会应用到视图。无法完整映射的筛选／排序整组停用并显示提示，不用部分条件冒充原视图。源没有可用视图时创建默认表格。原始字段、筛选、布局和视图 JSON 保留在归档中。
- 新布局沿用本地视图的能力边界：Select、Status 选项及 Checkbox 分组和 Date 日历字段按身份绑定；无法映射的 Board／Calendar 保留类型并提示在 View settings 选择字段。Notion 状态组、二级分组、手工组序、子条目显示和精确卡片排版不模拟；页面正文图片预览显示为本地文字预览并提示差异，文件属性图片预览保留配置。列宽等尚未映射的原始设置仍可从归档核对。
- Wiki 查询返回的子数据库 `data_source` 按其 `parent.database_id` 归并为独立子数据库；不会当成 Wiki 自身的数据源或普通记录。Wiki、子数据库及其记录保留层级，子数据库的多个数据源和视图继续分别处理。子数据库显示在页面树和可恢复的 Home 引用中，不伪装成 Wiki 表格中的页面记录。
- Wiki Home 优先尝试官方 Markdown；不可用时从可读 Block API 内容恢复，无法恢复的块保留占位与原始 JSON。恢复的正文保存为数据库下可编辑的 **Home** 页面，并在数据库视图栏提供 Home 入口。它是本地正文页面，不创建虚假的远端 page 身份或数据源记录。API 不暴露 Home 时明确警告，仍导入可读取的记录；不将空白页宣称为恢复成功。未通过真实 Wiki token 验证各工作区的 Home 可读性。
- 数据库引用只本地化到实际导入的宿主页，保留 `inline`、`data-source-url` 和未知属性；内嵌引用的 `collection://` 数据源绑定用于首次选择对应本地视图。远端视图手工行序、权限、Owner 当前用户筛选和 Verification 工作流不在本地模拟；无法读取的子数据库与数据源保留来源和警告。

## 存储、兼容和限制

正文真相是 `vault/pages/*.md`，页面属性和 `syntax.notionVersion: "v2"` 写入 `metadata.json`。原始 Markdown、API JSON 和未知字段继续归档到 `.history/imports/<batch>/`；恢复、链接及附件修改只应用到新副本，原始归档不变。来源 ID、API/Markdown 版本及批次保存在 `notionImport`。

没有 v2 标记的旧页面继续按原有语法读取，不批量迁移旧正文。旧的 Tab 嵌套与代码围栏兼容逻辑继续保留；围栏内代码、实际 Tab 和未知内容不能被当作父子边界。页面树、正文 Child page 和 Link to page 的身份独立，不根据标题或外观推断。

导入沿用 `createVault.importBatch`，只创建副本。页面 ID 使用标准 UUID：普通新页为 UUIDv4，导入页为批次内稳定 UUIDv5；同名页面不会覆盖。旧 ID 的显式迁移见[知识库元数据](VAULT-METADATA.md#页面-uuid-迁移)。相同选择、恢复数据、附件和来源快照产生相同批次；重复提交不覆盖本地修改。临时签名 URL 的变化可能产生新快照。后续编辑使用 `baseRevision`，冲突保留双方内容。整批不是原子事务，中断后可重试同一有效预览，不强制覆盖已有文件。

预览 30 分钟有效，最多保留三批内存快照。每批最多 500 页面、1,500 API 请求、20 MiB（原始响应、Markdown、附件合计），单页 10 MiB。API 请求 30 秒、附件 20 秒、整批 15 分钟超时；API 串行间隔 350 ms，429 最多重试两次，接受不超过 30 秒的 Retry-After。无权限引用可以保留；必需页面读取失败、响应身份/结构错误或分页不前进会阻止提交。

会被知识库识别成 YAML/Pandoc 元信息的正文开头仍拒绝导入；不注入应用 YAML 或偷偷改写正文规避此限制。未用真实 Notion token 完成在线端到端验证；自动化测试使用独立模拟 API、临时知识库和 Chrome。

## 来源与验证

- [官方 Markdown 版本和恢复接口](https://developers.notion.com/guides/data-apis/working-with-markdown-content)
- [官方 Notion-flavored Markdown v2](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)
- [官方 Block API](https://developers.notion.com/reference/block)
- 语法与恢复：`tests/unit/notion-v2.test.ts`、`tests/unit/notion-v2-import.test.ts`、`tests/unit/notion-block-import.test.ts`。
- API、分页、快照、数据库与引用回归：`tests/unit/notion-import*.test.ts`、`tests/unit/notion-database-import.test.ts`、`tests/unit/notion-inline-database-import.test.ts`、`tests/unit/notion-wiki-import.test.ts`。
- 浏览器：`tests/e2e/notion-v2-import.spec.ts` 及既有 Notion 导入、图片、数据库、Block 恢复测试。
