# Link Preview

[English](LINK-PREVIEWS.md) · **简体中文**

启用 `local_link_preview`（Notdown 默认开启），在正文粘贴 GitHub / OneDrive / SharePoint HTTPS 链接。菜单提供 Link、Mention、Preview；键盘 ↓ 进入菜单，↑/↓ 移动，Enter 选择，Escape 保留普通链接。代码块和关闭扩展的方言不弹出此菜单。

GitHub PR / Issue 卡片使用头像、标题、状态和元信息两行；仓库显示名称、作者；代码链接显示文件名和代码，最多 200 行、40,000 字符。链接可包含 `#L2-L8`。分支名包含 `/` 时使用编码后的分支名（`feature%2Fbranch`），或使用 GitHub 的 commit permalink，避免分支与文件路径歧义。不支持 GitHub Enterprise。

OneDrive / SharePoint 卡片以大缩略图和底部文件信息栏展示。Expand preview 打开大图；View document 按需请求 Graph 的短期预览地址，在受限的 Microsoft iframe 中加载。此查看器只支持 OneDrive for Business / SharePoint；服务拒绝、无缩略图或文件类型不支持时仍保留原链接、后备标题和 Open original。个人 OneDrive 可读取文件元信息／可用缩略图，不能承诺 Graph 文档内嵌预览。

## 连接

Settings → Link previews 支持保存、替换、断开每个提供方的单个 token：

- GitHub 公共仓库可匿名读取。私有仓库使用有对应仓库 Contents / Issues / Pull requests 读取权限的 token。
- OneDrive 使用 Microsoft Graph access token。`/shares` API 官方最低委派权限为 `Files.ReadWrite`；还需要账户能够访问该分享文件。Notdown 不修改源文件，也不主动兑换永久共享访问权限。
- token 仅由本地服务保存到当前知识库 `.notdown/link-connections.json`，API 只返回是否已保存；页面 Markdown、卡片、浏览器本地存储和错误消息不包含 token。文件本身为本地明文配置，备份／复制整个知识库前应排除此文件。没有 OAuth 登录或自动续期，过期后必须在设置中替换。

元信息打开页面时加载，页面可见时每分钟刷新。成功结果在服务端内存缓存 60 秒，最多 100 条；相同 URL 合并请求，每个服务实例最多 4 个并行请求，每次 API 请求超时 15 秒、响应上限 2 MB。手动 Refresh 也遵守 60 秒缓存。断开／替换凭据会清空缓存并使当前窗口卡片重新读取。URL 改动、节点删除、切换页面后，旧请求结果不能写回新节点；外部数据从不派发正文修改事务。

## 编码与兼容

```xml
<link-preview url="https://github.com/owner/repo/pull/42" title="Fallback title" custom="preserved"/>

正文 <mention-link url="https://github.com/owner/repo/issues/8">可选后备名称</mention-link> 后续文字。
```

`mention-link` 为 Notdown 本地行内编码，并非 Notion 官方导出语法。URL 和手填 title / label / description / image 是持久内容；实时标题、状态、短期缩略图地址与代码片段只驻留内存。旧 `<link-preview>` 的字段继续保留，其他网站仍显示手填静态卡片。关闭扩展、未知字段、未闭合标签、代码围栏中的同名文本保持可恢复。Mention 单击打开详情，其中 Edit mention 可编辑 URL 和后备名称；卡片悬停／键盘聚焦显示工具栏，可编辑后备属性。已有 URL、后备字段和未知属性通过原有 CAS 保存路径写入 Markdown；后台刷新不会改变 revision。

目前没有通用网页元信息抓取、OAuth、多账号、自动 token 续期、外部写回、同步数据库、跨设备同步。需要真实账户才能验证对应组织的访问策略；自动测试使用模拟外部响应和临时知识库。

## 官方参考

- [Notion Link previews](https://www.notion.com/help/link-previews)
- [Notion GitHub](https://www.notion.com/connections/github) / [OneDrive](https://www.notion.com/connections/onedrive)
- [GitHub Issues API](https://docs.github.com/en/rest/issues/issues)、[Repository contents API](https://docs.github.com/en/rest/repos/contents)
- [Graph 共享文件访问](https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0)、[缩略图](https://learn.microsoft.com/en-us/graph/api/driveitem-list-thumbnails?view=graph-rest-1.0)、[文档预览](https://learn.microsoft.com/en-us/graph/api/driveitem-preview?view=graph-rest-1.0)
