# Markdown 知识库 API

[English](API.md) · **简体中文**

## 浏览器知识库管理

浏览器服务状态包括 `vaultManagement: true`. `GET /api/vaults` 回报 `{ dataPath, vaults: [{ name, path, url }] }`. `POST /api/vaults/open` 接收 `{ mode: "create", name, path? }` 或 `{ mode: "open", path }`返回 `{ name, path, url }`路径是本地服务计算机上的绝对路径;一个自定义创建路径必须是新的或空的,现有知识库必须包含一个真实的 `pages/` 目录. 开放不会改变默认的保险柜或任何其他请求的绑定. 保护本地源和JSON写字保护也保护这些终端点. 电子和安卓不暴露它们.

每个返回的 URL 都是 `/v/<SHA-256 of canonical directory>/` 。其下方提供相同的 API 和附件路径（ `/v/<id>/api/pages` 、 `/v/<id>/assets/...` ）。未知或不可用的身份返回 404 ，而不是默认保管库。客户必须将所有特定于库的请求保留在该选项卡的前缀下，包括预览、源下载和附件。目录身份不提供身份验证；这些仍然是仅限本地的服务。打开的目录会记录在数据目录的`.browser-vaults.json`中，以便重启后恢复。

## 本地页面历史

`GET /api/history/settings`返回 `{ settings, revision, available, version?, repository?, latest?, error?, localOnly: true }` 。设置为 `{ intervalMinutes, idleSeconds, retentionDays, maxVersions, gitEnabled }`，默认为 `{5,120,30,100,false}`。  `PUT /api/history/settings` 需要 `{ settings, baseRevision }` 。冲突的配置保存会保留两个版本并返回 409 。 Git只运行在Node服务中；它不被 Android 本地传输公开。

`POST /api/history/checkpoint` 接受可选的不空 `message` 长达 160 需要启用Git历史记录,并返回 `{ created, id }`没有变化的投影返回 `created:false`这是一个本地检查站,而不是远程推送或附加备份.

`GET /api/pages/:id/history`列出 `{ id, createdAt, kind:"snapshot"|"git", message, protected }` 。  `GET /api/pages/:id/history/:kind/:revision` 返回历史 `{ source, metadata }` 。  `POST /api/pages/:id/history/:kind/:revision/restore` 需要 `{ baseRevision }` ；它在通过 `createVault` 仅恢复此页面之前保留当前版本。过时页面修订会返回 409，而不覆盖当前页面。当前的数据库成员身份和模式仍然具有权威性。历史内容是数据，永远不会被执行。

## 设备同步

`GET /api/sync/status`返回连接状态、上次同步时间和冲突计数，不带会话令牌。  `GET /api/sync/vaults` 列出了登录帐户的云笔记本。  `GET /api/sync/conflicts` 返回共享基础、本地和远程快照以供检查。

`GET /api/sync/progress`返回当前进程的 `{ running, progress?, error? }`，无需读取 Vault 文件或联系云。进度包括上传/下载/冲突计数、阶段、可选批次和阶段资源计数、当前资源、可选附件字节计数以及开始/更新时间戳。阶段总计描述的是当前步骤，而不是整个笔记本；他们可能不为人知。最后一个快照在完成或失败后仍然可用，并在下次运行（或断开连接）时重置。进度是可观察的，不会取代持久的同步状态。

`POST /api/sync/:action`支持 `sign-in` （url、密钥、电子邮件、密码）、 `connect` （vaultId 或新笔记本的名称）、 `run` 、 `pause` （已暂停）、 `disconnect` 和 `resolve` （id、选择、baseRevision 和用于选择合并的完整合并项目）。页面冲突也重用 `/api/conflicts/:id/resolve` 。 Android 本地传输公开相同的操作。这些路由控制本地客户端；云使用 `server/sync/supabase.sql` 中经过身份验证的 RPC。请参阅 [ 设置和边界 ](../features/CLOUD-SYNC.zh-CN.md) 。

对于 WebDAV， `sign-in` 接受 `{ provider: "webdav", url, folder, email, password }` ；  `email` 是帐户标识符，`password` 是其应用程序密码。它在存储连接之前验证临时诊断文件夹中的实际条件写入行为。  `vaults` 返回配置的远程文件夹中的笔记本，或者在不存在索引时返回空列表。  `connect` 创建一个新文件夹或加入列出的笔记本。 Status 还返回 `provider` 、 `folder` 、 `nextSyncAt` 和 `needsSignIn` ；它永远不会返回应用程序密码。 WebDAV 同步使用 HTTPS 和直接条件写入协议，无需 Supabase RPC。请参阅 [ WebDAV 设置 ](../features/WEBDAV-SYNC.zh-CN.md) 。

## 本地 R Markdown 执行

`GET /api/runtimes/settings`返回 `{ settings, inherited, revision }` 。设置字段为 `rscript` 、 `python` 、 `julia` 、 `pandoc` 、 `pythonKernel` 、 `juliaKernel` 、 `jupyterDataDir` （字符串，最多 2,048 字符，无空/换行符）。空值继承启动配置或自动发现。  `PUT /api/runtimes/settings` 接受 `{ settings, baseRevision }` ，从 `createVault` 持续到 `.notdown/runtimes.json` ，保留未知的存储字段并重置现有的 R/Quarto 笔记本会话。过时的修订版本返回 409 以及包含两个版本的 `conflictFile`；没有强制重试。  `POST /api/runtimes/check` 接受 `{ language: "r" | "python" | "julia", settings }` 并返回 `{ available, detail }` ，在临时进程中探测未保存的设置（最多两个并发检查，60 秒）。此检查不会执行或保存任何页面内容。所有端点都使用与其他设置 API 相同的本地源/桌面令牌限制。

`POST /api/quarto/notebook` 接受 `{ session: UUID, source, variant: "quarto" | "notdown", extensions?: Record<string, boolean>, mode: "current" | "above" | "inline", index }`。索引遵循可执行块或内联表达式（包括旧版 R 节点）之间的文档顺序。 `above` 排除选定的块。退货 `{ outputs: [{ index, html?, text?, error? }], sessionStarted? }`;单元故障保留先前的输出并停止后面的单元，除非其支持的错误选项请求继续。源仅限于 128,000 字符，输出为 8 MB，请求为 60 秒。 Python 和 Julia 使用单独的 Jupyter 内核； R使用knitr。可执行路径和内核名称来自保存的运行时设置或启动环境配置，而不是文档源。 OJS由浏览器沙箱执行；它的服务器条目是占位符。 `DELETE /api/quarto/notebook/:session` 释放该窗口的 R/Python/Julia 工作线程。结果永远不会改变Vault版本。参见 [四开本](../features/QUARTO.zh-CN.md).

`GET /api/rmarkdown/capabilities`探测 Rscript、knitr/rmarkdown 和 Pandoc 并返回 `{ available, version, help, error? }` 。在运行时设置中或使用 `NOTDOWN_RSCRIPT` 选择 Rscript ；文档执行请求无法选择可执行文件或命令参数。

`POST /api/rmarkdown/run`仅接受 `{ source: string }` 并返回 `{ html, log }` 。这将使用新的 R 进程和临时工作目录，以本地帐户的权限显式执行受信任的 R Markdown。它不写入保管库内容或修订。限制：128,000 源字符、两个并发运行、60 秒、8 MB 控制台输出和 8 MB HTML。断开连接中止执行；错误返回 400（输入）、408（超时）、413（输出限制）、422（R 错误）、429（忙）或 503（Rscript 不可用）。 HTML 必须显示在沙盒框架中；该应用程序会阻止脚本和网络资源。请参阅 [ R Markdown ](../features/R-MARKDOWN.zh-CN.md) 。

# 页面存储修订（2026-09-24）

页面 `body` 现为完整 Markdown 文件（包括用户或旧文件已有的 YAML / Pandoc title block），不再剥离或生成应用 YAML。通用 metadata 保存在 `vault/metadata.json`；返回的页面字段包含文档覆盖后的有效值。`baseRevision` 同时校验正文及该页 JSON metadata。详见 [Vault metadata](../features/VAULT-METADATA.zh-CN.md)。


后端默认监听 `127.0.0.1:4318`。设置 `PORT` 和 `VAULT_PATH` 以更改端口和保管库位置。来自浏览器的请求仅限于配置的本地来源；  `ALLOWED_ORIGINS` 接受逗号分隔的列表。写入请求需要 JSON。此本地服务不是经过身份验证的公共同步服务器。

`createApp({ vaultPath, frontendDir?, allowedOrigins? })`返回 Express 应用程序。  `createVault(vaultPath)` 公开存储 API。当入口点从项目根目录启动时，会自动提供构建的 `dist/index.html`。前端开发服务器应将 `/api` 和 `/assets` 代理到端口 4318 。

仅在第一次启动时，当未设置 `VAULT_PATH` 并且默认 `vault` 目录不存在时，入口点会创建五个中文示例页面。现有的默认保管库（包括空保管库）和所有明确选择的保管库路径均不保留种子。内部初始化可以调用`vault.create(input, {id})`以获得稳定的样本ID； REST 客户端无法提供 ID，并且现有 ID 或文件名永远不会被创建的内容替换。

## Markdown 文件夹导入

`POST /api/import/preview`接受 `{ name, dialect: "gfm" | "obsidian" | "notdown" | "rmarkdown" | "quarto", files: [{ path, data }] }` ，其中 `path` 是相对 POSIX 路径，而 `data` 是 base64。它返回 `{ id, name, pages, attachments, files, errors, warnings }` 而不写入 Vault 文件。限制：500 文件、20 MiB 总解码字节数和每个 Markdown 页面 10 MiB。预览快照在 30 分钟后过期；每次服务最多保留三个。

`POST /api/import/commit`接受 `{ id, skipInvalid?: true }` 并返回 `{ id, pageIds, alreadyImported }` 。无效文件需要显式 `skipInvalid` ；过期或未知的预览返回 410 。提交通过 `createVault.importBatch` ，创建新身份并且永远不会覆盖现有的不同内容。相同的已完成导入是幂等的。原始文件和路径映射存档在 `.history/imports/` 下。可以使用相同的选择来恢复部分写入；没有批量回滚或强制覆盖选项。请参阅 [ 导入和恢复边界 ](../features/DESKTOP-AND-IMPORT.zh-CN.md) 。

`POST /api/notion/import/preview`接受可选的布尔值 `useDesktopCache`（省略表示 false；导入对话框明确将其默认为 true）。在 `notdown` 变体中，可以从服务主机的固定 Windows Notion SQLite 缓存路径补充经过验证的内联提醒/日期格式属性。客户端无法选择数据库路径。缺失、不明确、过时或不受支持的缓存记录会保留 API 输出并发出警告。应用证据被存档并包含在批次标识中；没有更新现有的保管库页面。这不是仅限 SQLite 的导入器。请参阅 [ 概念 import ](../features/NOTION-IMPORT.zh-CN.md) 。

`POST /api/notion/import/preview`并且 `POST /api/import/commit` 也接受 `Accept: application/x-ndjson` 以获取实时进度。请求正文仍为 JSON。响应发送换行符分隔的 `{type:"progress", phase, completed, total?, currentTitle?}` 事件，后跟 `{type:"result", result}` 或 `{type:"error", error}` 。预览阶段为 `reading` 、 `restoring` 、 `attachments` 和 `finalizing` ；  `completed` 计算读取的页数，而 `total` 被省略，因为在遍历过程中会发现后代。提交阶段是 `importing` 和 `finalizing` ；计数指的是同一完成批次中持续存在或已经存在的页面，并且 `total` 是已知的。在写入每一页后，最终确定可能会继续。发送流式标头后，失败使用错误事件；早期验证失败可能仍会返回带有 HTTP 错误状态的普通 JSON。断开预览会取消阅读；断开提交不会回滚写入。没有此 Accept 标头的调用者保留 JSON 响应格式。

进度事件还可能包括 `step`（可读操作、分页页面、响应等待/接收状态或速率限制重试）、`requestCount`（Notion API 尝试，包括重试）和 `discovered`（到目前为止排队的唯一页面/容器标识，不是最终总数）。 UI 在本地对当前步数和自上次事件以来的时间进行计时；计时器滴答声并不意味着上游进度。步骤消息省略授权标头、原始分页光标和签名附件 URL。

桌面 shell 提供 `createApp({ accessToken, allowedOrigins: [] })` 。它的本地 HTTP 服务在每个请求上都需要 `X-Notdown-Desktop`，包括静态文件；隔离的 Electron 会话提供令牌。这不会向独立浏览器服务添加身份验证或提供远程同步。

## 当地人地址簿

`createVault(...).people`拥有接触持久性。  `GET /api/people` 列出活动联系人；  `?includeDeleted=true` 包括可恢复的删除。  `GET /api/people/:id` 读取一个联系人，包括已删除的联系人。  `POST /api/people` 创建与必需的非空 `name` 和可选的 `email`、`phone`、`organization`、`notes` 的联系。  `PUT /api/people/:id` 更新这些字段并需要 `baseRevision` ；  `{ deleted: true, baseRevision }` 删除，`{ deleted: false, baseRevision }` 恢复。响应包括稳定的 `id` 、时间戳、 `deleted` 和内容哈希 `revision` 。

联系人是 `people/` 中的 YAML 文件，而不是页面 JSON 或工作区帐户。过时的修订版返回 409 以及 `current` 、 `proposed` 和 `conflictId` ；两个完整的 YAML 源都保留在 `.history/people/conflicts/` 中。未知的现有 YAML 字段和注释在编辑后仍然存在。提及编码和恢复边界： [ People ](../features/PEOPLE.zh-CN.md) 。

联系人还可以携带可选的 `notionUserId` ，这是一个规范的概念 UUID。创建/更新接受此字段（空字符串将清除它）。匹配使用 ID，而不是姓名/电子邮件。导入期间返回的命名完整用户对象创建本地联系人一次；部分用户不会，以后导入也不会覆盖或恢复现有联系人。

## 外部实体库

`createVault(...).externalEntities`拥有持久的 `metadata.json.externalEntities` 映射。记录使用 `notion:<kind>:<source ID>` 键，其中 kind 为 `page` 、 `user` 、 `database` 、 `data-source` 或 `block` 。导入观察结果保留标签、源 URL、可用的原始用户数据、批次 ID 和未知的现有字段。实时参考位置和候选可用性来自解析的 Markdown、属性和当前本地对象；阅读不会修改注释。

| 请求 | 身体 | 回应 |
| --- | --- | --- |
| `GET /api/external-entities` | — | `{revision,entities,warnings}` |
| `PUT /api/external-entities/binding` | `{key,localId:字符串|null,baseRevision}` | 更新了库 |

实体公开 `{provider,kind,id,key,label?,url?,data?,status,localId?,candidates,references,importIds}` 。状态为 `resolved` 、 `unresolved` 或 `ambiguous` ；引用包含保存内容中当前远程引用的 `{pageId,location}`。候选页面排除回收站箱和后代，用户排除已删除的联系人。数据源解析为唯一的导入数据库主机。未映射的块锚点仍未解决。手动绑定支持用户到联系人、页面到页面、数据库到数据库主机； null 恢复自动匹配。显式不可用的绑定保持未解决状态，而不是默默地选择另一个副本。

绑定需要当前的库修订版（包括当前候选可用性）。陈旧保存返回 409 并在 `.history/external-entity-conflicts/` 下保留当前/建议的元数据；文件写入使用字节级 CAS 并保留未知字段。不会发生强制重试或注释重写。外部记录是现有同步协议中的单独资源。离线移动传输实现相同的读取/绑定路由。

## 页面格式

```ts
type Page = {
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string; // Complete Markdown file, including document metadata
  revision: string; // Revision of complete Markdown and this page's JSON metadata
  updated: string; // ISO timestamp
  favorite?: boolean; // Sidebar Favorites; absent means false
  trashed?: boolean; // Soft deletion; absent means false
  dataSourceId?: string; // Database record membership, separate from parent
  databaseId?: string; // Native or imported database host page
};
```

页面文件是 UTF-8 Markdown in `vault/pages/<uuid>.md` ；应用程序元数据存储在 `metadata.json` 中。现有的 YAML/Pandoc 元数据保留在完整的正文中，并在读取时覆盖 JSON 默认值。未知字段和注释在元数据更新后仍然存在。仅元数据更新将正文字节保留为解码的 UTF-8，包括 CRLF 和尾随空白行。未知的主体语法保持不变。每次调用时都会重新读取文件，因此外部编辑器所做的编辑变得可见。无效的 YAML 和重复的页面 ID 会产生 422 并阻止突变，而不是覆盖不明确的数据。符号链接页面将被忽略。

## 路线

源文件操作从页面 ID 解析现有文件名（包括重命名的 `.md` 文件）；客户端无法提供文件系统路径。  `GET /api/pages/:id/source-file` 返回带有绝对路径的 `{path}`。  `GET /api/pages/:id/source` 以内联 UTF-8 纯文本形式提供完整文件，并带有 `no-store`、`nosniff` 和沙箱 CSP。  `POST /api/pages/:id/source-file/open` 仅接受 `{}` 并使用本地默认应用程序打开文件，如果操作系统启动程序失败，则返回 `{opened:true}` 或 503。这些端点不写入页面； UI 在打开之前会保存现有的修订检查更新。

Markdown Lab 使用 `GET /api/markdown/capabilities` 报告已安装的 Pandoc 阅读器以及直接 `multimarkdown-cli` 和 `markdown-pl` 渲染器的可用性。 Pandoc 阅读器变体通过 JSON AST 和 HTML 编写器使用本地 Pandoc 可执行文件；没有单独的 `pandoc-cli` 变体。  `POST /api/markdown/preview` 接受 `{source, variant, extensions?, plugins?}` 并返回 `{html, engine, blocks, mapping, warnings}` 。直接渲染器不接受实验室扩展或插件，并返回其程序的 HTML 标准输出；  `mapping` 是 `proportional`，因为这些工具不报告源位置。浏览器将原始 HTML 显示为文本或对其进行清理以供页面预览。请求无法选择可执行路径或参数；服务器启动环境变量配置受信任的安装。两个端点都不写入保管库。

| 请求                           | 身体                                                    | 回应                                                     |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/status`                 | —                                                       | `{status, vaultPath, storage:'markdown', sync:'local-only'}` |
| `GET /api/pages`                  | —                                                       | `Page[]`                                                     |
| `GET /api/pages?includeTrashed=true` | — | 所有页面，包括被丢弃的父母及其后代 |
| `POST /api/pages/:id/duplicate` | `{baseRevision}` | 201 `Page`;新身份证,同一个父母,确切的体格和未知的YAML保存;没有复发性子节点副本 |
| `POST /api/pages/:id/recycle` | `{baseRevision,baseRevisions:{[pageId]:revision}}` | `{recycled:string[],deletedAssets:string[],warnings:string[]}`;回收已废弃的子树和丢失最后引用的附件 |
| `POST /api/pages/:id/move` | `{baseRevision,parent,sidebarOrder,beforeId,afterId,baseRevisions}` | `Page`;验证源、父级和目标同级修订后设置父级和同级位置 |
| `GET /api/pages/:id`              | —                                                       | `Page`                                                       |
| `POST /api/pages`                 | `{title?,parent?,icon?,properties?,body?}`              | 201 `Page`                                                   |
| `PUT /api/pages/:id`              | `{baseRevision,schemaRevision?,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `GET /api/conflicts`              | —                                                       | `Conflict[]`                                                 |
| `POST /api/conflicts/:id/resolve` | `{baseRevision,schemaRevision?,title?,parent?,icon?,properties?,body?}` | `Page`                                                       |
| `POST /api/assets`                | `{name,contentType,data}`( `data` 是标准的 base64 )   | 201 `{path,name,contentType}`                                |
| `GET /api/assets/info?path=assets/...` | — | `{path,name,size}`;仅一个文件，原始名称/大小可为空，无页面/参考扫描 |
| `GET /api/assets`                 | —                                                    | `{assets,warnings}`;本地文件和引用的缺失路径 |

附件条目包含 `path` 、 `name` 、 `originalName` （对于未注册的旧文件为空）、 `contentType` 、 `kind` 、 `size` （可为空）、 `addedAt` 、 `modifiedAt` 、 `missing` 和 `references` 。每个引用都用 `pageId`、`title`、`trashed` 和 `locations` 来标识已保存的页面。检查当前Markdown、页面属性、封面、图标和数据库记录文件属性；历史记录和未保存的草稿不计算在内。警告标识无法完全检查的来源。零引用并不表明文件可以安全删除。

上传保留 `metadata.json.assets` 中的原始名称和资源元数据，由稳定的相对路径键入。元数据写入会比较先前的文件内容并保留冲突时的恢复建议。列出现有文件，但不会自动重命名或注册。本地资产服务支持嵌套目录并拒绝符号链接和遍历。

`title`创建时默认为无标题页面，`icon` 为 📄，`parent` 为 null，`body` 为空字符串。财产在提供时被替换；省略的属性保持不变。将 null 作为父级传递会使该页面成为根页面。父引用必须存在并且不能创建循环。 ID 是不可变的。

`PUT /api/pages/:id`还接受布尔值 `favorite` 和 `trashed` ，具有相同的必需 `baseRevision` 和冲突保留。正常列表不包括已删除的页面和已删除祖先的后代；  `GET /api/pages/:id` 仍然允许恢复读取。 Trash 保留原始 Markdown 文件、层次结构和子文件，而无需重写子文件。使用 `trashed:false` 恢复；先复祖。在被废弃的祖先下创建或移动会被拒绝。复制会复制一页，保留现有的参考资料和附件，并重置收藏夹/回收站标志。过时的复制修订版会返回冲突，而不是默默地复制不同的修订版。

`GET /api/status`包括 `capabilities: {pageActions:1,sidebarDrag:1,databases:1,systemRecycleBin:boolean}` 。前端在页面突变和回收站读取之前检查页面功能，因此较旧的运行服务器无法默默地忽略新的元数据字段并报告成功。它还根据请求的更改检查返回的元数据。来自数据库列表端点的 404 被视为较旧的后端：普通页面保持可用，数据库入口点解释如何重新启动和重新检查服务器。其他数据库错误仍然可见。

系统回收需要一个修订映射，覆盖当前的确切子树、已废弃的根，并且该子树中没有未解决的冲突。每个文件都会获得历史快照和修订重新检查。子节点优先被回收；操作系统错误会停止处理，返回带有完整 ID 的 503，并将剩余文件留在回收站箱中。成功进行页面回收后，仅检查该子树引用的候选附件。幸存页面（包括回收站箱、冲突建议、非页面元数据和静态 HTML/SVG/CSS 依赖项）可保护其文件。不确定的来源或更改的修订版会停止清理并返回警告。不相关的先前存在的孤儿不会被清除。回收的附件在 `.history/deleted-assets/` 中保留字节和元数据恢复副本；共享的附件和历史仍然存在。跨多个文件的操作不是原子的。 Windows shell `IFileOperation` 使用 [ RECYCLEONDELETE ](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags) ；不提供永久删除后备。在 Windows 中恢复文件会将其原始 Markdown 放回到 `pages/` 中，保留应用程序的回收站箱标志，直到单击“恢复”为止。浏览器测试注入一个私有的临时回收适配器；原生回收和恢复是单独验证的。

## 本地数据库

`createVault(...).databases`将每个数据知识库储在 `databases/<id>.json` 中，其中包含具有 `pageIds` 的自有数据源和具有 `{dataSource:{databaseId,dataSourceId}}` 引用的视图。外部引用是一个链接，而不是另一个源定义。旧版元数据资源映射在显式迁移之前保持可读。记录仍然是正常的 Markdown 页面，具有 `metadata.json` 中的通用属性。一个 `DatabaseSnapshot` 就是 `{ database, hostPage?, dataSources, views, pages }` ；  `pages` 排除了已废弃的记录和已回收站中的祖先页面的后代。  `hostPage` 是与 `databaseProxy:true` 的兼容性投影，适用于没有 Markdown 的数据库或真正的 Wiki Home。对于非托管遗留数据库来说，它不存在。资源读取包括内容哈希修订并使用 `Cache-Control: no-store` 。

| 请求 | 身体 | 回应 |
| --- | --- | --- |
| `GET /api/databases` | — | `Database[]` |
| `POST /api/databases` | `{标题，父级？：字符串|null,parentRevision?:string,kind?:"database"\|"wiki",dataSourceId?:string,sourceRevision?:string}` | 201 `DatabaseSnapshot`创建一个JSON数据库. `dataSourceId`通过它,验证了 `sourceRevision` 维基需要自己的源头,同时还创建了一个真正的首页和所有页面列表 |
| `POST /api/databases/:id/display` | `{inline:boolean,baseRevision,parentRevision}` | `Page`;返回更新的父级，验证数据库和父级修订并更改父级条目，保留数据库 JSON。需要一个活动的非 Wiki 数据库、一个支持数据库语法的父数据库以及最多一个匹配条目；必须从块菜单转换不明确的条目 |
| `POST /api/pages/:id/wiki` | `{baseRevision}` | `DatabaseSnapshot`;转换活动的独立页面，无需重写 Markdown 或页面标识 |
| `POST /api/databases/:id/undo-wiki` | `{baseRevision,hostRevision}` | `Page`;将主机恢复到普通页面，保留树和属性值，归档删除的 Wiki 资源 |
| `GET /api/databases/:id` | — | `DatabaseSnapshot` |
| `PUT /api/databases/:id` | `{title?,icon?,baseRevision,hostRevision?}` | 更新了 `DatabaseSnapshot` ；至少需要标题/图标之一 |
| `PUT /api/databases/:id/icon` | `{icon,baseRevision,hostRevision?}` | 更新了 `DatabaseSnapshot` ；仅图标别名 |
| `GET /api/data-sources/:id` | — | `DatabaseDataSource` |
| `PUT /api/data-sources/:id` | `{baseRevision,title?,properties?}` | 已更新`DatabaseDataSource` |
| `GET /api/data-sources?includeTrashed=true` | — | 源摘要，包括可恢复源，以及所有者修订和 `trashed` ；默认列表排除已废弃的来源 |
| `POST /api/data-sources/:id/move` | `{baseRevision,databaseRevision,targetDatabaseId,targetRevision}` | 原所有者更新的 `DatabaseSnapshot` ；将相同的源传输到活动的普通数据库，在一个 CAS 事务中更新记录父级和链接的所有者引用，保留 Markdown 字节 |
| `POST /api/data-sources/:id/trash` | `{baseRevision,databaseRevision,trashed:boolean}` | 所有者更新了 `DatabaseSnapshot` ；软删除或恢复源并获得页面可见性，而无需重写 Markdown。当所有者没有源视图时，恢复会添加表视图 |
| `POST /api/data-sources/:id/recycle` | `{baseRevision,databaseRevision,baseRevisions:{[pageId]:revision}}` | `{recycled,deletedAssets,warnings,databaseRevision}`;回收已废弃的普通源的精确记录子树，然后存档并删除其定义和拥有的视图。国外观点仍不可用链接。因冲突或操作系统错误而停止；已完成的文件仍可恢复 |
| `POST /api/databases/:id/views` | `{baseRevision,name?,dataSourceId?,type?:"table",propertyIds?,filters?,sorts?,rowOrder?}` | 201 更新了 `DatabaseSnapshot` ；修订版属于数据库 |
| `PUT /api/database-views/:id` | `{baseRevision,name?,type?:"table",propertyIds?,filters?,sorts?,rowOrder?}` | 更新了 `DatabaseView` ；源/数据库身份保持不变 |
| `POST /api/database-views/:id/delete` | `{baseRevision,databaseRevision,trashSource?:boolean,sourceRevision?:string}` | 更新了 `DatabaseSnapshot` ；仅查看删除不会留下任何视图，同时保留源/页面。最后源视图删除还可以软删除其拥有的具有匹配源修订版本的普通源。冲突保留恢复建议 |
| `POST /api/data-sources/:id/records` | `{baseRevision,title?,properties?}` | 201 `Page`;修改属于数据来源 |
| `PUT /api/data-sources/:id/records/:pageId` | `{baseRevision,schemaRevision,propertyId,value}` | 更新了 `Page` ；检查页面和数据源修订 |
| `POST /api/data-sources/:id/records/:pageId/remove` | `{baseRevision,schemaRevision}` | 更新了与其数据源分离的 `Page`； Markdown 和保留的属性 |

`Database`有 `{id,title,icon?,pageId?,dataSourceIds,viewIds,revision}` 。文件资源另外公开 `storage:"file"` 和 `ownedDataSourceIds` ；  `dataSourceIds` 包括自有源和链接源。  `pageId`和预计的`hostPage.id`等于现有导航的数据库ID；这并不意味着 Markdown 文件。数据库显示字段存在于其 JSON 中，并且列表读取排除了有效废弃的容器。  `DatabaseDataSource` 具有 `{id,title,properties,ownerDatabaseId?,revision}` 和不可变的所有者；缺少外部源会在快照中暴露 `unavailable:true` 并拒绝写入。视图公开计算的 `sourceDatabaseId` 和 `linked` ；这些字段和修订不存储在文档中。

`GET /api/database-storage/migration`返回 `{version:1,baseRevision,databases:[{id,title,path}],blocked}` 。  同一 URL 的 `POST` 需要 `{baseRevision}` 并返回 `{migrated,recoveryPath?}` 。在将任何遗留资源移动到单个文件中之前，Vault 会检查完整的预览；过时的预览返回 409 ，阻止的主机/所有权返回 422 ，并且原始字节和 ID 在 `.history/database-migration-<uuid>.json` 中仍然可恢复。打开保管库永远不会自动迁移它。  `/api/pages/:id/source` 返回数据库投影的实际 JSON； Markdown 历史恢复拒绝此类预测。

标题/图标更新需要数据库 `baseRevision` ；托管数据库还需要捕获的 `hostRevision` 。标题是最多包含 500 字符的非空字符串；图标最多是 100 字符的字符串，而 `""` 会删除自定义图标。 UI 将共享文档图标呈现为空值后备。托管更新通过正常的页面日志并保留准确的 Markdown 和未知元数据；过时的主机修订会产生正常的页面冲突，而过时的资源修订则使用数据库冲突存档。文档控制的标题/图标值返回 422 和 `source:"document"` 。无主机遗留数据库仅更新其资源字段，而不创建主机文件。更新仅接受标题、图标和两个修订字段。

省略 `parent` 或传递 null 会创建根数据库。非空父级需要其当前的 `parentRevision` ；陈旧的父母在创建孤儿之前会因 409 失败。父级必须是活动的普通页面，而不是数据库主机。数据库记录是使用等于其源规范主机的 `parent` 创建的。普通页面创建/直接移动到数据库主机、数据库记录的通用重定父级以及数据库主机的通用复制返回 422 ；使用数据库记录操作来获取成员资格。现有导入的主机身份将保留。没有主机的遗留数据库仍然可读，并且在读取期间不会获取文件；他们的新记录保留 `parent:null` ，层次结构仅投影在 UI 中。

每个属性都有 `{id,name,key,type,options?,readOnly?}` ；选项具有稳定的 `{id,name,color?}` 身份。正好有一个 `title` 字段绑定 `key:"title"` ；其他字段绑定 `Page.properties` 中的键。字段键无法重命名。填充类型转换和仍在使用的选项的删除将被拒绝，并且无法删除已保存视图引用的字段。保留未知的存储资源、字段和选项字段。

可编辑的基本类型有 `text` 、 `number` 、 `checkbox` 、 `date` 、 `select` 、 `multi_select` 、 `status` 、 `url` 、 `email` 和 `phone` ，以及页面标题。日期值为 `{start,end?,time_zone?}` ；选择/状态值是选项 ID，多选值是唯一的选项 ID 数组。非标题值可能为空。  `formula` 、 `rollup` 、 `unknown` 和明确的 `readOnly` 字段拒绝编辑。导入的关系、人员和文件当前是只读快照。文档控制的值拒绝使用 422 进行单元格更新；相反，编辑完整的文档源。

`DatabaseView`有 `{id,databaseId,dataSourceId,name,type:"table",propertyIds?,filters?,sorts?,rowOrder?,revision}` 。  `rowOrder` 是来自该视图数据源的页面 ID 的唯一有序数组；重复的和外国的身份证件将被拒绝。当前表格渲染支持过滤器 `{propertyId,operator:"contains",value}` 和排序 `{propertyId,direction:"ascending"|"descending"}` 。 UI编辑一种过滤器和一种排序；远程 Notion 视图定义单独保存，不作为本地视图配置应用。

更改数据库记录的标题或架构绑定属性时，通用 `PUT /api/pages/:id` 和冲突解决还需要数据源的 `schemaRevision`。客户端必须保留编辑开始时捕获的模式修订；过时的模式会产生可恢复的冲突，而不是自动重试。仅正文编辑保留通常的页面修订要求。数据源成员身份无法通过任意页面元数据补丁进行更改。

资源修订冲突返回 409 与 `current`、`proposed` 和 `recoveryPath`，并在 `.history/database-conflicts/` 下保留两个版本。资源写入会保留 `.history/database-transactions/` 中之前/之后的元数据，并自动替换元数据文件。页面冲突使用现有的页面冲突API。 `GET /api/conflicts` 不会返回数据库资源冲突档案，并且尚不存在资源冲突解决端点。请参阅 [ 数据库行为和边界 ](../features/DATABASES.zh-CN.md) 。

## 冲突和历史

每次更新都需要由编辑所基于的读取返回的修订版本。不匹配的修订版返回 HTTP 409 ：

```json
{ "error": "…", "conflictId": "uuid", "current": {}, "proposed": {} }
```

`current`和 `proposed` 是完整的 Page 对象。建议的源代码以可读的 Markdown 形式保存在 `.history/conflicts/<conflictId>.md` 中，并用 JSON sidecar 记录其来源。当前页面保持不变。  `GET /api/conflicts` 返回 `{id,conflictId,pageId,createdAt,baseRevision,currentRevision,current,proposed}` 。 `current` 对象反映了最新的源代码，而 `currentRevision` 则记录了创建 fork 时的修订版本。

通过显式发布新读取的 `baseRevision` 和预期合并字段来解决。省略的字段默认为建议的页面。成功的解决方案会将两个冲突文件存档在 `.history/conflicts/resolved` 下。过时的解决方案会造成另一场冲突，并使原来的冲突得不到解决。历史页面源保存在 `.history/<pageId>/<revision>.md` 下。

写入使用同一目录临时文件、文件刷新、重命名和进程内突变队列。该服务在替换前立即再次比较源。这是一个后端进程的乐观并发，而不是跨设备同步实现或针对任意外部写入器的文件系统锁定：外部程序仍然可以在最后一次检查和重命名之间的狭窄间隔内写入。每个保管库仅运行一个后端进程。

## 附件和错误

PDF 附件通过 `nosniff` 内联提供，并为浏览器 PDF 查看器提供限制性 CSP，并具有下载/打开链接后备功能。

新上传、Markdown 文件夹导入和 Notion 下载使用 `assets/<UUID>.<extension>`，使用从单独的附件身份前缀、内容 SHA-256 和标准化扩展名派生的连字符 UUIDv5 身份。页面 UUID 标识未更改。具有相同标准化扩展名的相同字节在验证其字节后重用一个新格式的文件；外部更改的目标会返回冲突而不是被覆盖。现有元数据和未知字段将被保留，上传响应将保留提交的原始名称以供插入。现有的哈希、UUID、批处理和 `notion-` 路径保持可读，无需迁移。公认的 MIME 类型提供扩展；否则，保留简单的字母数字原始扩展，回退到 `.bin` 。 HTML 通过无脚本沙箱提供；其他不受支持的格式使用附件配置和 `nosniff` 。上传最大为 20 MB；页面主体最大为 10 MB。

错误为 JSON `{error:string,...details}`，其中 400 表示无效输入，403 表示不允许的主机/源，404 表示缺少资源，409 表示修订冲突，413 表示输入过大，415 表示非 JSON 写入，422 表示存储数据不明确或格式错误。

## 本地对象服务

链接预览使用固定的 GitHub 和 Microsoft Graph API 主机；它们不会获取任意用户 URL。读取结果是暂时的，并且永远不会更新页面主体或修订。

| 请求 | 身体 | 结果 |
| --- | --- | --- |
| `GET /api/link-previews/settings` | — | `{github:boolean, onedrive:boolean}`;从不返回令牌 |
| `PUT /api/link-previews/settings` | `{provider:"github"\|"onedrive", token?, disconnect?}` | 令牌存在；省略/空白标记保留现有值，`disconnect:true` 删除它并清除预览缓存 |
| `POST /api/link-previews/resolve` | `{url}` | 提供商特定的标题、状态、元数据、代码或缩略图；  60 - 第二个内存缓存 |
| `POST /api/link-previews/viewer` | `{url}` | OneDrive for Business / SharePoint 的短期 Microsoft 文档查看器 URL，仅在打开查看器时请求 |

凭证是 `.notdown/link-connections.json` 中的本地明文，必须从共享保管库备份中排除。请求受到固定主机、拒绝的重定向、15 秒超时、2 MB 响应和四个并发提供程序操作的限制。身份验证错误不包括上游响应主体。未实现 OAuth 登录、自动令牌更新、多帐户支持或外部源写入。请参阅 [ 链接预览 ](../features/LINK-PREVIEWS.zh-CN.md) 。

| 请求 | 身体 | 结果 |
| --- | --- | --- |
| `GET /api/services/settings` | — | `{endpoint, model, transcriptionModel, hasKey}`;从不返回 API 密钥 |
| `PUT /api/services/settings` | `{endpoint, model, transcriptionModel, apiKey?, clearKey?}` | 公共场所；空白/省略的密钥保留现有密钥 |
| `POST /api/services/generate` | `{prompt, context?, model?}` | `{text}`来自配置的兼容 `/chat/completions` 端点 |
| `POST /api/services/transcribe` | `{path, language?}` | `{text}` 根据 `/audio/transcriptions`路径必须识别本地音频附件 |
| `POST /api/syntax/citations` | `{path, citations, style?}` | 使用本地 BibTeX/CSL 和沙盒 Pandoc 格式化引文 HTML 和参考书目 |

服务设置位于 `<vault>/.notdown/services.json` 中；这是一个本地明文秘密文件，与页面 Markdown 分开。这些调用不会保存页面。仅当块未更改时，编辑器才会合并结果，然后应用正常页面 CAS。最多两个外部请求同时运行，具有 120 秒超时和 2 MB 响应限制。转录最多接受 25 MB；上传仍限制为 20 MB。端点配置接受 HTTPS 或环回 HTTP，无需凭据/查询/片段。提供程序错误不会回显凭据或提供程序响应正文。

同步块刷新使用现有页面API读取源页面；发布使用其捕获的 `baseRevision` 和正常的冲突路径。当应用程序打开时，提醒安排是浏览器本地的。这两种机制都没有引入跨设备同步。
## 网络书签元数据

`POST /api/bookmarks/resolve`接受 `{ "url": "https://example.com" }` 并返回 `{ title, description, icon, image }` 。它读取公共 HTTP(S) HTML，具有 10 秒截止时间、2 MB 响应限制和最多四个重定向；它不写一页。私有/保留的 IP 目标、URL 中的凭据和非标准端口将被拒绝。客户端通过现有页面CAS更新来保存元数据。不可用的元数据会返回错误，并且编辑器会保留可用的仅 URL 书签。
