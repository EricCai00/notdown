# 多设备云同步（实验性）

Notdown 可以把桌面和 Android 的本地知识库连接到同一个云端知识库，支持 Supabase 和[坚果云／WebDAV](WEBDAV-SYNC.md)。编辑先写本地 Markdown；断网仍能使用，联网后在应用打开期间同步。Supabase 需要配置自己的项目，WebDAV 使用自己的网盘账号；目前没有内置的公共 Notdown 云服务。

## Supabase 配置

1. 在 Supabase 项目 SQL Editor 执行[同步服务迁移](../../server/sync/supabase.sql)。它创建私有同步表、带账号校验的 RPC 和私有的 `notdown-sync` 附件桶；可重复执行，不重置已有笔记。
2. 在项目 Authentication 中创建自己的用户，启用邮箱/密码登录。客户端使用项目 URL 和 **publishable key**；旧版项目也可使用 `anon` key。不要使用 secret key 或 `service_role` key。
3. 桌面打开 **Workspace settings → Cloud sync**，Android 打开 **Notebook options → Cloud sync**，输入项目地址、公钥和用户账号并登录。
4. 第一台设备选择 **Create a new cloud notebook**；其他设备使用同一账号，选择刚创建的云端知识库。现有本地内容会加入该云端知识库；相同身份的不同版本保留为冲突。

生产项目使用 HTTPS，HTTP 仅允许本机回环地址。账号之间的知识库、变更记录和附件隔离，客户端不能绕过同步 RPC 修改版本表。

此版本没有端到端加密，正文与附件在云端可读取。Supabase 登录密码不落盘，仅保留会话令牌；WebDAV 为后续请求保留应用密码。凭据存于设备的 `.notdown/sync/connection.json`。整个 `.notdown/sync/` 是设备状态，不应复制到其他设备；应用 ZIP 导出排除此目录，导入也忽略它。增加设备应通过应用连接云端或导入 ZIP 备份。

## 使用与范围

- 应用打开时，编辑后、恢复联网、回到前台及定期检查触发同步，也可以点击 **Sync now**。本地保存状态与最近同步时间分别显示。
- **Pause sync** 暂停当前设备同步；本地保存继续。**Disconnect** 保留本地和云端笔记；未解决同步冲突需先处理。
- 登录会话无法刷新时，使用 **Sign in again** 登录同一账号，保留当前知识库关联、待上传内容和冲突。
- 页面正文、属性、数据库、数据源、视图、联系人和 `assets/` 附件参与同步。原始 Markdown、BOM、换行及未知 metadata 字段保留。
- `.history/`、解释器路径、运行设置与其他未列出的文件不参与同步；未知文件仍保留在本地及 ZIP 备份中。同步不能替代独立备份。

## 冲突

同步保存共同基线、本地版本与云端版本。不同页面独立同步；同一资源并发修改时停止该资源上传并保留双方，不采用“最后写入获胜”，也不刷新版本强制重试。

正文冲突复用 `.history/conflicts/`、历史快照、差异显示和桌面 **Conflicts and versions** 的合并入口。Cloud sync 同时提供桌面和安卓共用的冲突界面：选择 **Keep this device**、**Use cloud version**，或编辑合并后的正文和完整属性。保存时检查本地版本，上传时再次检查云端版本。共同基线和双方原始内容保留在历史中。

删除与编辑、联系人、附件或数据库资源冲突也在 Cloud sync 中处理；删除版本明确标记为 deleted。保留本地可将其恢复到云端。永久删除通过删除标记传播；长期离线设备不会仅因文件缺失而自动复活旧内容。

## 存储与恢复

- [共用引擎](../../src/sync/engine.ts) 使用云端游标取增量变更，按资源保存基线。JSON 指纹稳定排序，兼容 JSONB 键顺序变化。
- 正文仍在 `pages/*.md`，属性仍在 `metadata.json`。传输按资源拆分，写回通过 `createVault` 的锁、版本校验、恢复日志与原子替换。
- 离线改动在规范文件中持久保存。上传前保存完整操作与唯一操作 ID；请求成功但响应丢失后，以相同 ID 和内容重放，由云端返回原结果。
- 同步事务的前后内容存于 `.history/sync/`；恢复时如遇第三方外部改动，停止并保留恢复材料。
- 附件按 1 MiB 分块，以 SHA-256 校验、去重和复用，完成后发布清单。中断重试可重用已上传块；传输单附件上限 64 MiB，应用上传入口仍遵守其现有大小限制。
- 云端在同一数据库事务中检查版本、更新资源、记录变更和幂等结果。每个知识库通过行锁排序，避免游标跳过尚未提交的并发写入。

## 当前限制

- 个人账号多设备同步；没有多人共享、实时协作、自动三方合并。
- Android 使用前台 TypeScript 引擎，应用关闭或被系统回收后不保证联网；下次打开恢复。尚未接入 WorkManager 后台传输。
- 没有端到端加密、远端历史恢复界面、远端垃圾回收或服务商迁移向导。变更历史、删除标记和附件当前不自动清理。
- 本地会扫描资源以发现外部编辑；首次同步传输全部资源。相关资源逐项应用，中间状态不代表整个知识库已同步。路径碰撞或仅大小写不同的重命名会停止并提示处理。
- 自动化使用独立 Chrome、IndexedDB、临时磁盘知识库和 PostgreSQL/WASM。托管 Supabase 网络、真实账号、Android WebView 和真机后台行为仍需部署后验收。

## 验证

```powershell
npm ci
node --import tsx --test tests/unit/sync.test.ts tests/unit/sync-cloud.test.ts
npm run test:sync
```

`test:sync` 构建独立桌面和移动前端，以临时测试云端验证登录、安卓下载、离线编辑、冲突、合并回传和重载。测试云端执行实际迁移 SQL，仅 Auth 与附件 HTTP 传输使用测试适配器；它不是生产服务器。日志在 `.run/logs/`，截图和 trace 在 `test-results/sync/`。
