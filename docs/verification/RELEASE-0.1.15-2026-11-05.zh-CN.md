# Windows 0.1.15 发布验证

[English](RELEASE-0.1.15-2026-11-05.md) · **简体中文**

日期为 2026-11-05。本次发布提交工作区累积改动，生成 Windows x64 安装包，升级本机桌面版，并发布 GitHub 开发预览版。

## 改动范围

- 数据库提供十一种布局，包括 Timeline、Chart、Feed、Dashboard、Form 和 Map。Timeline 增加依赖关系与本地排期，Chart 支持多系列、下钻与图片导出，Dashboard 组合本地数据库视图，Form 提交创建本地记录，Map 显示配置的位置。
- 数据库页面图标与封面、Calendar 日期范围、表格列宽调整与行选择、视图溢出菜单，以及自动保存设置和可恢复的冲突草稿。
- 只读思维导图与页面预览、Gallery 预览选项、可读的 Vault List 属性、Wiki 视图菜单与共享的顶部页面视图切换器。
- 知识库新建与打开表单、Windows 文件夹浏览、保存新建位置、紧凑的侧栏偏好设置，以及仅停止所属服务的命令。

功能细节和各项限制维护在[数据库](../features/DATABASES.zh-CN.md)、[写作与导航](../features/WRITING-AND-NAVIGATION.zh-CN.md)、[知识库](../features/VAULTS.zh-CN.md)及[开发指南](../architecture/DEVELOPMENT.zh-CN.md)中。

## 验证结果

- `npm ci` 完成。`npm test -- --test-concurrency=2` 完成，**1288 项通过、5 项跳过、0 项失败**。
- `npm run build` 和 `npm run desktop:dist` 通过。安装包审计将 **845** 个桌面构建文件与 `app.asar` 对照，检查包版本和运行时资源，并确认排除了用户知识库与 Capacitor 包。
- 使用临时知识库与独立配置目录的 **15 项已安装桌面版测试全部通过**。此前两处桌面断言已更新，以匹配默认隐藏的 Markdown 控件和当前关联数据源图标。
- 首轮定向浏览器测试为 **50 项通过、3 项失败**。随后使用新临时知识库的 **14 项测试全部通过**，覆盖 Feed、数据库链接、菜单、Notion 内嵌导入与 Vault List 属性。另有 **3 项 Timeline 属性测试通过**。依赖悬停的记录打开测试先悬停标题，Feed 和 Timeline 冲突测试先产生外部编辑，再触发本地自动保存。
- 另一轮 **51 项定向浏览器测试全部通过**。补测被中断数据库文件的运行中，**19 项通过、3 项失败**。修正剩余依赖悬停的测试交互后，在新临时知识库中复测的 **8 项数据库记录测试全部通过**。
- 中英文 README 预览均加载了产品图标，未出现横向溢出。文档检查器验证了双语配对、本地链接、标题锚点与语言路由。

本地证据位于 `.run/logs/`，使用 `release-0.1.15-` 前缀。主要日志为 `unit.log`、`build.log`、`package.log`、`desktop-installed.log`、`browser-full.log`、`browser-focused.log`、`browser-fixes.log`、`timeline-properties.log`、`browser-accepted.log`、`browser-remaining.log` 和 `browser-databases.log`。浏览器运行还保留 JSON 报告与失败追踪。

## 待解决的验证与依赖问题

完整 **902 项**浏览器回归在达到预设的 **10 项失败**上限后停止，**193 项通过**，**699 项未运行**。失败涉及书签属性编辑、旧品牌断言、数据库导航、菜单、回收和 Timeline 排期。部分数据库用例在修正测试后，使用新临时知识库复测通过。完整浏览器测试仍未通过验收。

组合运行的定向测试还发现，在生成很长页面标题的测试数据之后，窄屏 Vault List 属性列出现显示失败。同一属性测试在新临时知识库中通过，该组合场景问题仍待解决。

`npm ci` 在完整依赖树中报告 **31 项依赖漏洞**。`npm audit --omit=dev` 在运行时依赖中报告 **14 项**，包括 **2 项 low、6 项 moderate、4 项 high、2 项 critical**。这些数量来自 npm audit 的安全公告匹配，本地详细报告为 `release-0.1.15-audit-runtime.json`。

GitHub Release 标记为 **development preview / prerelease**。Windows 安装包尚未签名。

## 安装包与本机升级

发布附件为 `Notdown-Setup-0.1.15-x64.exe` 和 `SHA256SUMS.txt`。安装包大小为 **206013752 bytes**，本地安装包审计回执为 `release-0.1.15-artifact.json`。[GitHub Release](https://github.com/EricCai00/Notdown/releases/tag/v0.1.15)

旧安装已备份到 `.run/desktop-backups/Notdown-0.1.14-before-0.1.15/`。静默升级退出码为 **0**，已安装程序报告版本 **0.1.15.0**。程序文件和 `app.asar` 哈希与已审计安装包一致，知识库列表、界面语言和默认位置配置的哈希与安装前回执一致。回执为 `release-0.1.15-install-before.json` 和 `release-0.1.15-install-after.json`。
