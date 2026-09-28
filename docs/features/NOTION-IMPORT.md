# Notion API Enhanced Markdown 单向导入

官方 `<page>` 专用于 Child page；Notdown 补充 `<page-link>` 表示 Link to page。两者可以指向同一个直接子页，块类型不根据 parent 推断。图标和菜单读取实际 PM 类型，`<mention-page>` 保持行内提及。

读取本地 Markdown 不需连接 Notion，也不依赖归档。新入口不写 `role`，旧属性保留原文；解析正文不会创建或修改父子关系。底部 Child page 列表仍按资源层级生成，与正文入口数量独立。旧导入不自动迁移；重新导入创建新副本。

侧栏 **Import from Notion API** 使用官方 `GET /v1/pages/{page_id}/markdown`，固定 `Notion-Version: 2026-03-11`，并可读取数据库、数据源、记录属性和视图 API。默认选择 Notdown，仅对已解析的 `<unknown>` 占位补取 Block API 数据，复用已有 child-block 响应并缓存重复读取；其余正文沿用 API Markdown。不经过应用 Markdown/CSV 导出，也不写回 Notion。

## 使用

1. 在 Notion 创建具有 **Read content** 权限的 connection / integration，把目标页面共享给它。
2. 打开 **Import from Notion API**，填入 integration token 和根页面、数据库或数据源链接／ID。支持应用 Copy link 的 `app.notion.com/p/...`，以及 `notion.com`、`notion.so`、`notion.site` 链接；查询参数和锚点不会被误当对象 ID。默认包括后代页面和数据库；取消后不跟随后代入口，指定数据库／数据源自身的记录仍会读取。
3. 选择 **Import dialect**：默认 **Notdown** 恢复支持的 unknown 块；选择 **Notion Markdown** 则保留官方占位符。点击 **Preview**，检查页面数、恢复数量与限制提示，下拉逐页查看实际将写入的 Markdown。更换方言会使旧预览失效。
4. 点击 **Import copies**。先收取并保存当前页输入；保存失败或冲突会阻止提交。导入后打开根页面。

Token 不写入配置、日志、预览或归档；输入框在请求完成及关闭时清空。服务端只向固定 Notion API 主机发送授权请求，数据库记录查询使用只读的 POST query，其余读取使用 GET；禁止重定向，不接受自定义 API 地址。预览期间可 Cancel，关闭会取消客户端及服务端读取；提交期间禁止关闭对话框。

## 数据库与数据源

数据库入口、数据源字段定义、记录页面和视图分别保存。记录正文仍是普通 Markdown，属性值写入页面 `properties`，字段与选项使用稳定身份。导入的数据库沿用原宿主页，在页面树中点击数据库入口打开本地表格，记录作为其子项展示；本地创建、编辑和存储细节见 [数据库](DATABASES.md)。

- 查询所有数据源记录并处理分页；长标题、富文本、联系人和关联等分页属性通过页面属性 API 补全，原始响应继续归档。
- 标题、文本、数字、勾选、日期、单选、多选、状态、URL、邮件和电话转为本地基础字段。文本属性的富文本结构在原始响应中保留，本地编辑的是文本值。
- Relation 在页面身份确定后再映射同批目标。未导入目标保留原始 Notion 引用和未解析标记，不跨批次匹配或按标题推断。
- People / Files 保留来源结构，界面暂为只读；不会自动建立本地用户账号、合并联系人或下载附件。
- Formula / Rollup 保存定义和导入时结果作为只读快照。分页 rollup 的源条目保留，无法计算的聚合不会伪造结果；本地编辑不会触发重算。
- 尝试读取远端视图列表与详情；不可读时给出提示。远端视图配置仅保留原始数据，每个数据源创建本地默认表格，不复现远端筛选、布局、分组或自动化。
- 数据库、数据源、字段和页面采用批次内稳定映射；相同快照提交幂等，不覆盖本地编辑。它们与页面一起归档和导入，但整批不是单个原子事务。

## 存储与恢复

嵌套代码块兼容 API 的「围栏有 Tab 层级、代码正文无层级缩进」输出，也兼容整体缩进的围栏。解析子块范围时完整跳过代码围栏，代码中的标题、标签、空行和实际 Tab 不作为父子边界；同样适用于 toggle heading、列表和标签容器。未编辑时保留原文，修改后继续使用已有围栏语法，不改写旧导入文件。缺少闭合围栏时保留可恢复源码。

页面 ID 统一为标准 UUID：普通新页与副本使用 UUIDv4，Notion 与文件夹导入使用由批次和条目身份确定的 UUIDv5，仍支持同一快照幂等导入及不同快照隔离。来源与批次放在 `notionImport.pageId` / `notionImport.batchId`，不拼进页面 ID。旧 `notion-` / `import-` ID 可通过[页面 UUID 迁移](VAULT-METADATA.md#页面-uuid-迁移)转换；迁移同步维护父关系、引用及导入清单，保留旧链接兼容映射和恢复备份。

Notion 未设置图标时使用 Notdown 原生 `file-text` 默认图标，不再自动填入 📄 emoji；明确设置的 emoji 保留。旧导入已保存的图标不批量改写。

- 正文基于 API `markdown`，将已导入目标的实际 `<page>` / `<page-link>` URL 本地化为 `#page/<UUID>`。Notdown 还原地替换可恢复的 unknown 标签；其他字节（Tab、CRLF、邻近正文、代码和未知语法）保留。页面使用所选方言；省略 API 请求的 `variant` 参数仍默认 `notion-markdown`，保持既有调用兼容。
- 标题、emoji 图标、实际父子关系、来源 page ID / URL / API version 写入 `metadata.json`。同名子页按不同 Notion ID 区分，不产生同名覆盖或额外目录页。
- 提交复用 `createVault.importBatch`。`.history/imports/<批次>/manifest.json` 把 API 原始 JSON 响应、原始 `.md` 映射到编号归档；API JSON 保留未知字段和页面属性，正文仍是 Markdown 真相。归档不保存请求头或 token。
- 预览只读，30 分钟有效，与文件夹导入共享最多三批内存快照。提交使用预览快照，不重新读取 Notion。
- 相同方言和 API 响应快照产生相同批次身份，再次提交不会覆盖本地修改。方言、恢复数据或选择变化会创建新的副本，不增量更新已有页面。包含临时签名 URL 的响应可能自然变化，因此再次抓取不保证去重。
- 写入仅创建副本，不更新已有页面；后续编辑使用现有 `baseRevision` 和冲突副本规则。不是整批原子事务，中断后可用仍有效的同一预览重试；禁止以不同内容覆盖已有文件。

## 第一版边界

普通 Markdown 超链接也按 Notion 页面 ID 转换，包括标题、列表、分栏、表格和 span 中的 `[文字](/p/<页面ID>?pvs=25)` 及完整 Notion HTTPS 地址。只映射本批导入目标，不按标题猜测、不跟随链接额外抓取页面。未导入目标的 `/p/` 地址补全为 Notion HTTPS 地址；Notion block 锚点保持远程并提示，因为本地块没有原 Notion block ID。链接文字、样式、title、代码/公式/未知块和原始归档保留。此修复仅应用于新的导入快照，重新导入创建新副本；不会修改旧页面，也不跨批次自动匹配。`<mention-page>` 暂不在本次普通链接转换范围内。

Notdown 当前支持以下 Block API 恢复映射，严格按响应 `type` 判断，不按 `alt` 猜测：

| Block API type | Notdown 编码 | 说明 |
| --- | --- | --- |
| `link_to_page`（`page_id`） | `<page-link url="…">标题</page-link>` | 目标来自 `link_to_page.page_id`；已导入页面本地化，其他目标保持远程。目标标题不可读时保留链接并提示。 |
| `bookmark` | `<bookmark url="…" caption="…"/>` | caption 使用现有纯文本字段；富文本样式和其他 JSON 字段保存在归档。 |
| `embed` | `<web-embed url="…"/>` | 沿用现有沙箱嵌入；不下载文件，不保证第三方允许嵌入。 |
| `link_preview` | `<link-preview url="…"/>` | 保留目标 URL，使用已有预览实现。 |
| `breadcrumb` | `<breadcrumb/>` | 使用本地导入后的页面层级呈现。 |

unknown 的 URL 指向**源块**，可能用 fragment 携带 block ID；先验证 Notion 域名与 UUID，再读取 `GET /blocks/{id}` 并核对响应身份。代码围栏、行内代码和未知容器里的示例不触发请求。403/404、响应身份不符、带子块的占位、模板或尚无映射的类型保留原占位并提示；不会把 `unknown.url` 当作目标页面。原始 JSON（含未知字段）与原始 Markdown 完整归档。网络故障、限流超过重试次数、取消和体积限制仍会中止预览。

- 接受根页面、数据库或数据源 URL/ID；后代遍历可发现 child database 并导入记录。数据库正文引用使用已有官方语法，本地资源通过 metadata 绑定；尚不恢复权限、评论、公式计算或远端视图行为。
- 启用后代导入时，分页 Block children API 遍历普通嵌套块里的 child page，建立实际父子关系；实际 `<page>` 块的 Notion 目标也导入以支持本地导航，但标签本身不授予归属。发现完成后统一确定层级，避免先导入引用目标导致父关系遗漏。不跟随普通 Markdown 链接、行内提及或代码示例；同步块不遍历 Block children。
- **附件不下载**。API 返回的图片/文件 URL 原样保存，签名 URL 会过期，不能视为完整离线附件备份。未导入目标的页面 URL 仍保留远程地址。封面、自定义 emoji 等可在原始页面 JSON 中恢复，暂不映射为本地资源。
- 官方模式以及无法恢复的内容仍保留 `<unknown .../>`；占位不等于完整块功能。Notdown 补充标签不宣称与官方 Markdown API 互通。不请求会议全文 transcript，不执行模板或按钮动作，不恢复数据库云端操作。
- 非空 `unknown_block_ids` 产生包含页面 ID 和缺失块数量的警告，仍可预览和导入；同时标记截断时也放行。Notdown 尝试恢复正文中有有效源块 URL 的支持类型，其他占位保留。警告不代表全部缺失内容已恢复；没有 unknown block ID 的截断仍阻止预览，尚不递归拼接缺失子树。
- 任一页面读取失败、分页不前进或返回结构错误均中止预览，不跳过遗漏页。网络请求 30 秒超时，整批 15 分钟；串行读取间隔 350 ms，429 最多重试两次，尊重不超过 30 秒的 Retry-After。
- 每批最多 500 页面、1,500 请求、20 MiB（含原始 JSON 和 Markdown 归档），单页 10 MiB；超限需拆分选择。
- 若开头内容会被知识库识别成 YAML / Pandoc 元信息，则拒绝预览并说明原因，避免将正文误当应用属性。不自动注入 YAML 或改写正文来绕过这一边界。

## 来源和验证

- [官方 Retrieve a page as markdown](https://developers.notion.com/reference/retrieve-page-markdown)
- [官方 Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)
- [官方 Markdown 块支持与 Block API 恢复建议](https://developers.notion.com/guides/data-apis/working-with-markdown-content#unsupported-block-types)
- Block API 恢复测试：`tests/unit/notion-block-import.test.ts`、`tests/e2e/notion-block-import.spec.ts`，覆盖同目标子页与链接、五种映射、原始归档、方言隔离、权限降级和代码保护。
- 单元/服务测试：`tests/unit/notion-import.test.ts`，覆盖原文、分页、嵌套、同名页面、凭据隔离、异常响应、限流、取消、快照提交和重复导入。
- 数据库导入单元测试：`tests/unit/notion-database-import.test.ts`，覆盖数据库／数据源入口、字段和记录分页、关联映射、只读快照、来源保留与重复导入；本地数据库交互见 `tests/e2e/databases.spec.ts`。
- 浏览器测试：`tests/e2e/notion-import.spec.ts`。Chrome 与临时知识库，测试服务器注入模拟 Notion API；不访问真实账号或用户 vault。
- 尚未用真实 Notion token 做在线端到端验证。
