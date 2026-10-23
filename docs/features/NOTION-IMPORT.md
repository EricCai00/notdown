# Notion API 单向导入（Markdown v2）

侧栏 **Import from Notion API** 将有权读取的页面、数据库和数据源导入为本地副本。新导入使用 `GET /v1/pages/{id}/markdown?markdown_version=v2&include_transcript=true`，API header 仍为 `Notion-Version: 2026-03-11`。不使用应用的 Markdown/CSV 导出，不写回 Notion。

## 使用

1. 为 Notion connection / integration 启用 **Read content**，并共享目标页面及后代。
2. 输入 token 和页面、数据库或数据源 URL/ID。支持 `app.notion.com/p/...` 和 `notion.com` / `notion.so` / `notion.site` 链接；查询参数里的视图 ID 不当作页面 ID。
3. 默认包括后代页面、数据库，以及正文中 Folder 入口的后代；默认保存可下载的附件、封面和自定义图标。可分别关闭后代读取和附件下载。指定数据库/数据源自身的记录仍会读取。
4. 默认选择 **Notdown**，允许恢复模板按钮、面包屑等本地补充能力；**Notion Markdown** 也恢复官方 v2 可表达的内容，但不启用这些补充标签。
5. **Preview** 展示将写入的 Markdown 和警告。更改选择会使预览失效；**Import copies** 先保存当前页，冲突或保存失败会阻止提交。

Token 只用于当前预览，完成请求或关闭对话框后清空；不保存到配置、归档、日志或预览。授权请求只发往固定 Notion API 主机，禁止重定向；只有只读的数据源 query 使用 POST。附件下载不携带 token，每次重定向重新校验公共地址并固定 DNS 解析结果。关闭预览会取消读取。

## 读取与恢复顺序

Markdown 是正文基础。页面/数据库 API 读取属性，分页 Block children API 确认真正的子页面和数据库归属。`<page>` 始终是 Child page，Notdown 的 `<page-link>` 始终是 Link to page；相同目标不会改变块类型。普通 Markdown 链接和行内提及不会触发无界页面遍历。

对语法扫描确认的 `<unknown>`，先验证其**源块** Notion URL/ID，再读取并核对 Block API 身份。可直接转换的块使用真实响应数据；其余尝试以 block ID 请求 v2 Markdown，递归补取缺失子树，仍不可用时读取分页 children。模板使用可读取的子块配置本地 Insert blocks 按钮；导入期间不执行按钮。

代码围栏、行内代码、未知容器、标签属性和提及的字面标签不会授权额外读取或被全局 URL 替换。重复读取使用缓存，循环和过深子树保留占位并提示。`unknown_block_ids` 非空仍允许预览；警告不代表所有缺失内容均已恢复。截断且没有恢复 ID 时阻止预览。

## 内容支持与剩余边界

| 内容 | 当前处理 |
| --- | --- |
| v2 正文 | 支持属性段落/标题、Toggle、列表、分栏、Tabs、表格、Callout、媒体和公式；普通正文按 CommonMark/GFM 结构解析。原文不变时保留字节，编辑后使用 v2 表示。 |
| v2 行内内容 | 支持格式标签、提及、日期/时间、讨论链接属性与 link-preview 标记。同批页面提及及普通页面链接本地化，未映射的块锚点保留远程。 |
| Bookmark / Embed / Link preview | 使用 v2 标签与真实目标恢复。富文本 caption 原文保留；当前 caption 编辑器编辑纯文本。Notdown 可保存额外卡片属性；官方模式仅编辑可表达的字段，抓取的网页详情用于预览。第三方服务仍可能拒绝嵌入。 |
| Template / Button | 可读取内容的旧 `template` 转为 Notdown 模板按钮。普通 Button 的动作/条件不由公开 API 提供时保留带类型的来源占位，不创建假动作。 |
| AI block | 尽量恢复可读取的结果和子内容；提示词、模型、自动更新等未公开配置无法还原。不自动调用本地 AI 代替 Notion AI。 |
| Meeting notes | 请求可访问的完整 transcript，保留 Notes、Summary、Transcript 分区。服务未返回的转录、音频、配置无法补造。 |
| Mail | 正文和邮件头属性保留；附件 URL 尽量本地保存，不发送邮件、不同步邮箱。 |
| Custom block | 独立引用节点保存 definition ID 和实例 URL；API 未提供的定义实现、bindings 和渲染结果不执行、不伪造。 |
| 外部集成 / Form / Drive | `external_object_instance` 保存集成名称、标题和来源。`unsupported.block_type` 返回的 form/button/drive 等显示真实类型；服务端未提供的内容和交互保留来源入口。 |
| Folder | 跟随正文 Folder URL，用 Markdown endpoint 读取其直接内容并继续遍历；本地保存为带来源类型的容器页面。根输入仍面向页面、数据库、数据源。 |
| 同步块 | Notdown 中仅当同批有唯一、明确 source URL 的原块时写入本地 ID 并连接引用，复用本地同步块功能；其他情况保留快照与远程来源。官方模式不写补充 ID。没有 Notion 云端同步。 |
| 评论、权限、历史、自动化 | 仅保留正文/API 响应内已有的引用或元数据，不导入评论线程、权限体系、完整历史或自动化行为。 |

## 附件与数据库

- 默认勾选 **Import files, media, covers and icons into Attachments**。图片、文件、音视频、PDF、可识别的 HTML 附件、邮件附件和数据库 Files 字段复制到 `assets/`，以内容 hash 命名并去重；提交成功后统一进入侧栏 **Attachments**，可预览、下载、查询引用页面或再次插入。预览阶段不写入知识库。
- 附件的可获取文件名、MIME 类型、字节数、登记时间与 Notion 来源写入 `metadata.json.assets`。名称优先使用 Files 字段的名称、下载响应中的文件名，其次使用 URL 中的文件名；不把题注或临时签名参数当成原文件名。无法取得名称时保留存储文件名并显示未记录。封面写入页面 `properties.cover`；下载成功的自定义图标使用本地图片。emoji 保留，未设置图标使用 `file-text`。
- 单个附件上限 10 MiB，整批仍受 20 MiB 限制。不可访问、非公共地址、超时或超限时保留远程 URL 并警告，签名 URL 仍可能过期。HTML 的相对依赖资源不递归打包，外部集成的实时内容不属于附件副本。
- 重复提交同一来源快照仍不覆盖本地页面。若该批文件先前已下载但未登记，重试同一批次会在校验文件内容后补充附件登记，保留现有附件元数据和未知字段；不会批量修改旧正文，也不会覆盖已在外部改动的附件。
- 数据库、数据源、字段、选项和记录使用稳定身份；完整查询分页记录及长属性。记录正文仍是普通 Markdown，字段值写入页面 properties。
- 标题、文本、数字、勾选、日期、选项、状态、URL、邮件、电话可编辑；Relation 映射同批目标，其他目标保留来源及未解析标记。文本字段的原始富文本留在归档。
- People / Files 保留来源结构，界面仍为只读；Files 下载成功会使用本地 URL 并另存来源 URL，不创建本地用户账号。
- Formula / Rollup 保留定义与结果，作为只读快照，不执行 Notion 公式。无法完整获取的聚合不伪造结果。
- 远端视图列表和详情尽量读取并归档。本地每个数据源提供默认表格，不复现远端筛选、排序、分组和其他布局。数据库引用只本地化到实际导入的数据库宿主页，保留 `inline`、`data-source-url` 和未知属性；数据源专属引用仍可能需要在 Notion 打开。

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
- API、分页、快照、数据库与引用回归：`tests/unit/notion-import*.test.ts`、`tests/unit/notion-database-import.test.ts`、`tests/unit/notion-inline-database-import.test.ts`。
- 浏览器：`tests/e2e/notion-v2-import.spec.ts` 及既有 Notion 导入、图片、数据库、Block 恢复测试。
