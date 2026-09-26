# Notion API Enhanced Markdown 单向导入

正文入口的图标和菜单直接读取 PM 类型，不按 parent 单独改显示。服务端只读 `.history/imports` 的原始 Block API 归档，恢复 child_page / link_to_page 证据；前端文档加载和 Source 重解析把证据明确且 parent 匹配的唯一入口构建为 `block.child_page`，其余保持 `block.link_to_page`。同样适用于已有完整归档的旧导入，不需要再次连接 Notion。

证据由归档重建为响应中的 `pageEntryEvidence`，不写入正文或修改用户文件；官方 Markdown 保存时不注入 `role="child"`。归档缺失、同一目标存在 link_to_page 证据或正文有重复入口时，保守保留 Link to page，不猜测每个入口的原始类型。底部 Child page 列表仍按资源层级生成，与正文节点类型独立。

侧栏 **Import from Notion API** 使用官方 `GET /v1/pages/{page_id}/markdown`，固定 `Notion-Version: 2026-03-11`。不经过 Notion 应用的 Markdown/CSV 导出，不通过 Block JSON 重新拼写正文，也不写回 Notion。

## 使用

1. 在 Notion 创建具有 **Read content** 权限的 connection / integration，把目标页面共享给它。
2. 打开 **Import from Notion API**，填入 integration token 和根页面链接或 ID。支持应用 Copy link 的 `app.notion.com/p/...`，以及 `notion.com`、`notion.so`、`notion.site` 页面链接；查询参数和锚点不会被误当页面 ID。默认勾选 **Include descendant pages**；取消后只取指定页面。
3. 点击 **Preview**。检查页面数、限制提示，使用下拉框逐页查看实际 API Enhanced Markdown。
4. 点击 **Import copies**。先收取并保存当前页输入；保存失败或冲突会阻止提交。导入后打开根页面。

Token 不写入配置、日志、预览或归档；输入框在请求完成及关闭时清空。服务端只向固定 Notion API 主机发送带授权的 GET 请求，禁止重定向，不接受自定义 API 地址。预览期间可 Cancel，关闭会取消客户端及服务端读取；提交期间禁止关闭对话框。

## 存储与恢复

Notion 未设置图标时使用 Notdown 原生 `file-text` 默认图标，不再自动填入 📄 emoji；明确设置的 emoji 保留。旧导入已保存的图标不批量改写。

- 正文使用 API 返回的 `markdown` 字符串原样写入 `pages/*.md`，包括 Tab、CRLF、XML-like 标签、代码、未知语法。页面方言固定为 `syntax.variant: notion-markdown`，不启用 Notdown 私有扩展。
- 标题、emoji 图标、实际父子关系、来源 page ID / URL / API version 写入 `metadata.json`。同名子页按不同 Notion ID 区分，不产生同名覆盖或额外目录页。
- 提交复用 `createVault.importBatch`。`.history/imports/<批次>/manifest.json` 把 API 原始 JSON 响应、原始 `.md` 映射到编号归档；API JSON 保留未知字段和页面属性，正文仍是 Markdown 真相。归档不保存请求头或 token。
- 预览只读，30 分钟有效，与文件夹导入共享最多三批内存快照。提交使用预览快照，不重新读取 Notion。
- 相同 API 响应快照产生相同批次身份，再次提交不会覆盖本地修改。API 响应或选择变化会创建新的副本，不增量更新已有页面。包含临时签名 URL 的响应可能自然变化，因此再次抓取不保证去重。
- 写入仅创建副本，不更新已有页面；后续编辑使用现有 `baseRevision` 和冲突副本规则。不是整批原子事务，中断后可用仍有效的同一预览重试；禁止以不同内容覆盖已有文件。

## 第一版边界

- 仅接受根**页面** URL/ID，不接受数据库 URL 作为数据源查询入口；数据库记录、视图、公式、关联执行语义、权限和评论不导入。数据库正文引用保留官方原文。
- 后代发现使用分页 Block children API，遍历普通嵌套块里的 child page，保留页面层级；不跟随普通链接、页面提及或同步块里的跨页引用。同步块只保留 Markdown 内容快照及来源。
- **附件不下载，页面链接不改写为本地链接**。API 返回的图片/文件 URL 原样保存，签名 URL 会过期，不能视为完整离线附件备份。封面、自定义 emoji 等仍可在原始页面 JSON 中恢复，暂不映射为本地资源。
- 官方不支持的内容可能仍是 `<unknown .../>` 占位；占位不等于导入完整块功能。不请求会议全文 transcript，不补造官方未定义的语法。
- `truncated: true` 或非空 `unknown_block_ids` 阻止整个预览，不静默导入残缺页。需检查共享权限或选择较小子页；当前不自动拼接截断子树。
- 任一页面读取失败、分页不前进或返回结构错误均中止预览，不跳过遗漏页。网络请求 30 秒超时，整批 15 分钟；串行读取间隔 350 ms，429 最多重试两次，尊重不超过 30 秒的 Retry-After。
- 每批最多 500 页面、1,500 请求、20 MiB（含原始 JSON 和 Markdown 归档），单页 10 MiB；超限需拆分选择。
- 若开头内容会被知识库识别成 YAML / Pandoc 元信息，则拒绝预览并说明原因，避免将正文误当应用属性。不自动注入 YAML 或改写正文来绕过这一边界。

## 来源和验证

- [官方 Retrieve a page as markdown](https://developers.notion.com/reference/retrieve-page-markdown)
- [官方 Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)
- 单元/服务测试：`tests/unit/notion-import.test.ts`，覆盖原文、分页、嵌套、同名页面、凭据隔离、异常响应、限流、取消、快照提交和重复导入。
- 浏览器测试：`tests/e2e/notion-import.spec.ts`。Chrome 与临时知识库，测试服务器注入模拟 Notion API；不访问真实账号或用户 vault。
- 尚未用真实 Notion token 做在线端到端验证。
