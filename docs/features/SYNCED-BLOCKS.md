# 本地同步块

2026-09-27。同步块使用单一 ProseMirror 文档，Markdown 中保存本体与引用快照，不连接 Notion 云服务。

## 操作

- 使用插入菜单的 Synced block，或块 handle 菜单的 Turn into → Synced block。连续多选可以一起包入容器；已有同步块及其内部不再嵌套转换。
- 悬停或聚焦显示浅暖色细边框与右上方的浮动工具栏；工具栏使用浅灰描边和轻阴影，正文沿用页面字体，块上方不额外预留工具栏空白。
- 打开位置或更多菜单时，以浅蓝底标示当前操作的同步块。位置菜单按真实页面图标、名称和父页面列出使用位置，标记 Original 与 This page，支持页面跳转；没有父页面时不显示路径。底部 Learn more about Synced blocks 打开本地操作说明。菜单会在窗口边缘调整位置，也可用方向键、Home / End 和 Escape 操作。
- Copy synced block 先收取并保存当前页输入，再复制引用 Markdown。未命名本体在此时取得稳定 UUID；引用仍指向最初的本体，不创建引用链。复制失败或保存冲突会显示原因。
- 将内容粘贴到另一 Notdown 页。新引用启用自动同步。同页联动与编辑合为一个事务；跨页在编辑停止约 900ms 后发布，打开的干净副本约每两秒检查来源。
- 更多菜单保留手动 Refresh from source / Publish to source、旧的只读方向 live refresh 开关，以及新的自动同步开关。手动刷新明确以来源替换当前快照，可撤销；自动刷新不替换本地编辑。
- Unsync 解开当前副本容器并保留其富文本正文，可撤销。本体仍有副本时拒绝解开，需逐个取消副本同步，避免静默产生失效引用；暂不提供跨页批量取消同步。

## 存储与冲突

复用 `<synced_block>` / `<synced_block_reference>`，不引入新的正文标签。引用 URL 是 `#page/PAGE_ID#block=BLOCK_ID`。

仅 `syntax.variant: notdown` 赋予 `id`、`source-revision`、`snapshot-hash`、`auto-refresh`、`auto-sync` 本地行为。新复制引用写入 `auto-sync="true"`；旧文件不迁移，也不自动升级旧 live refresh 行为。官方 `notion-markdown` 将含补充属性的内容按原文保留，不受显式扩展开关越界启用。

来源正文通过现有 createVault 的页面 API 写入，携带已捕获的 `baseRevision`。冲突不强制重试，服务保留来源和提交内容；编辑器暂停该副本的自动同步并保留本地正文。异步响应检查文档、目标、编辑状态与视图生命周期，输入法组合中不发布或替换正文。未知属性和代码围栏由现有 Markdown codec 保留。

未打开页面保留上次保存的快照，打开后读取本地来源。Source 模式直接改动本体或引用会先保存 Markdown；自动同步只在可编辑的 Page 投影中运行。外部 URL、无权限 notice、无法定位的来源保留快照，不向 Notion 写入。此功能不是跨设备传输、协作或通用文件同步。
