# Windows 0.1.12：数据库布局与视图菜单

日期：2026-11-01。按用户提供的 Notion 截图调整布局，保留既有数据库和页面存储模型。

## 交付范围

- 普通数据库采用紧凑标题和胶囊视图栏，视图与工具按钮左右排列。Wiki Home／集合共用页头继续保持原有位置和尺寸。
- View settings 使用右侧设置面板。Manage data sources、Source 和布局等子面板在同一位置切换，Back 返回上一层，Close 关闭整组；来源管理按 Source／Linked 分组，单行显示名称、视图数量和详情入口。
- 点击当前视图标签或右键任意标签打开独立下拉菜单，可重命名、切换布局、编辑视图、查看来源、复制链接、显示／隐藏来源标题，以及复制／删除视图。右键其他视图不切换当前视图。
- 复制保留筛选、排序、字段、布局、来源和未知字段；删除不删除来源或 Markdown，至少保留一个视图。删除校验视图与数据库的两份 revision，并保留冲突恢复记录。
- 进入来源管理前先保存视图草稿，返回后继续使用刚保存的版本。取消新来源表单、返回或关闭面板不会意外创建资源。

操作说明见[数据库](../features/DATABASES.md)，删除视图的接口见[API](../reference/API.md)。没有新增正文协议或迁移实际用户知识库。

## 验证

| 检查 | 结果 |
| --- | --- |
| 全量单元测试 | 1233 通过、5 跳过、0 失败 |
| TypeScript、生产前端、移动端构建 | 通过 |
| 数据库／Wiki 浏览器 | 53 个场景完成验证；整组 49 通过，其余在修正 Wiki 标题尺寸、隔离追踪产物后复跑通过 |
| 最终布局复测 | 3 项面板／菜单、3 项 Wiki 对齐全部通过；包含保存后返回继续修改、冲突草稿和窄屏边界 |
| 移动浏览器 | 4 项通过，覆盖数据库创建、编辑、同步导入和 Wiki |
| 最终打包程序 | 1 项数据库集成用例通过，覆盖独立 JSON、linked-only、转换、面包屑、新视图菜单复制和右侧来源管理 |
| 包内容核对 | main bundle 及包内前端 HTML／JS／CSS 与构建文件逐一一致；版本 0.1.12；不包含用户 vault 或 Capacitor 原生依赖 |

日志在 `.run/logs/`：`database-layout-unit.log`、`database-layout-actions-unit.log`、`database-layout-all-browser.log`、`database-layout-final-browser.log`、`database-layout-shell-browser.log`、`database-layout-mobile.log`、`release-0.1.12-build.log`、`release-0.1.12-desktop.log`。最后一次桌面测试保留交互与文件断言；Electron 截图采集曾超时，视觉检查使用隔离 Chrome 的截图。

已查看 `.run/logs/database-layout-view-settings.png`、`database-layout-manage-sources.png` 和 `database-layout-view-dropdown.png`；最终 Wiki 与面板截图保存在 `test-results/browser-layout-shell/`。浏览器测试使用独立 Chrome、临时知识库和隔离端口，没有连接用户浏览器。

## 本机安装

安装包为 `.run/desktop-release/Notdown-Setup-0.1.12-x64.exe`，SHA-256：`b4dd18a932419bb70c556f3774ccc4fc34a88edb11be7393a50b26df6b2e8da1`。

原 0.1.11 程序完整备份至 `.run/desktop-backups/`；备份路径及核心文件哈希见 `.run/logs/release-0.1.12-install-before.json`。静默升级退出码、安装后的产品版本 0.1.12.0、exe／app.asar 哈希及知识库配置保持情况见 `release-0.1.12-install-after.json`，与已验证打包产物的哈希一致。

安装包仍未签名；本次没有扩大真实托管云服务、Notion token 或 Android 真机的验收范围。
