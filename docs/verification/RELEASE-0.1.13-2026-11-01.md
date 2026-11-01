# Windows 0.1.13：Inline 数据库、来源菜单与 Trash

日期：2026-11-01。按用户提供的 Notion 截图调整交互，沿用独立数据库 JSON、Markdown 页面和 CAS 写入。

## 交付范围

- Inline 只显示当前数据源名称；容器标题继续用于独立数据库页和导航。宽表的数据区域扩展到内容视口并支持横向滚动，标题、工具栏与前后正文保持页面原有宽度。分栏内的数据库保留所在栏宽。
- 放不下的视图归入 **n more…**；菜单可搜索全部视图、选择视图、打开该视图的选项，以及新建视图或数据源。来源标题的显示／隐藏状态与菜单文字保持一致。
- 数据库搜索在工具栏内展开，Escape 清除并收起。移除单独的数据库保存／重载／转换菜单；输入暂停后自动保存，失败时保留草稿并显示恢复操作。Inline／Full page 转换入口保留在父页面的数据库块菜单。
- 来源行的省略号使用独立小菜单：复制 ID、移动所有权、移入 Trash，以及来源关系详情。移动检查来源及两个数据库版本，保留来源 ID、外部视图、Markdown 原文与层级，拒绝循环归属和文档 metadata 控制的父位置。
- 删除某来源在当前数据库中的最后一个视图时，选择只删视图或同时把自有普通来源及其页面移入 Trash。数据库可暂时没有视图，再从保留的来源创建视图。Wiki 和外部 Linked 来源不提供越过所有权的删除操作。
- 数据库继续使用页面 Trash；数据源也支持可恢复删除，侧栏 Trash 和来源管理均可恢复。来源回收状态由数据库 JSON 派生页面可见性，不批量改写 Markdown，也不取消页面原先单独的回收状态。

操作说明见[数据库](../features/DATABASES.md)，接口见[API](../reference/API.md)。本次没有新增正文协议或迁移真实用户知识库。

## 验证

| 检查 | 结果 |
| --- | --- |
| 全量单元测试 | 1235 通过、5 跳过、0 失败 |
| TypeScript、生产前端、移动端构建 | 通过 |
| 数据库／Wiki 浏览器 | 整组 56 项中 54 通过，2 项旧断言随新交互更新后通过；最终相关 13 项全部通过 |
| 最终 Inline／来源／删除复测 | 3 项通过，增加来源标题显示／隐藏持久化断言，使用最终桌面包的前端构建 |
| 移动浏览器 | 4 项通过，覆盖 Wiki、完整数据库、Inline 和同步导入引用 |
| 最终打包程序 | 1 项数据库集成用例通过，覆盖 JSON、Linked-only、父块转换、面包屑、来源管理，以及来源回收与恢复 |
| 包内容 | main bundle 及包内 HTML／JS／CSS 与构建文件逐一一致；版本 0.1.13；不包含用户 vault 或 Capacitor 原生依赖 |

核心单元用例检查移动后外部视图仍引用原来源，CRLF 与未知围栏内容逐字节不变，嵌套页面随来源隐藏／恢复，单独回收的页面保持原状态；最后视图的两种选择均验证页面身份与内容。来源移动通过联合 CAS 复核页面版本与原文件字节，元数据提交不重写正文。

日志在 `.run/logs/`：`database-followup-final-unit.log`、`database-followup-all-browser.log`、`database-followup-final-browser.log`、`database-followup-title-final-browser.log`、`database-followup-mobile.log`、`release-0.1.13-build.log`、`release-0.1.13-desktop.log`。已查看 `database-followup-inline-wide-source.png`、`database-followup-overflow-views.png`、`database-followup-source-options.png` 和 `database-followup-last-view-choices.png`。浏览器使用独立 Chrome、临时知识库与隔离端口；Electron 用例使用独立配置和临时知识库。

## 本机安装

安装包为 `.run/desktop-release/Notdown-Setup-0.1.13-x64.exe`，SHA-256：`94ff340370eab1de31625b146b248d7bd35c009eacac3e00589658a6b924ca6e`。版本及包内容校验见 `.run/logs/release-0.1.13-artifact.json`。

正常退出旧程序并备份安装目录后静默升级。最终安装收据为 `.run/logs/release-0.1.13-install-before.json`、`release-0.1.13-install-after.json`：安装退出码为 0，产品版本为 0.1.13.0，exe／app.asar 与最终验证的打包文件一致，知识库配置文件哈希保持不变。原 0.1.12 程序备份位于 `.run/desktop-backups/`，原始路径和哈希保留在 `release-0.1.13-first-install-before.json`。

安装包仍未签名；移动浏览器验证不代表 Android 真机安装，本次未扩大真实云服务验收范围。
