# Windows 0.1.14 发布验证

[English](RELEASE-0.1.14-2026-11-03.md) · **简体中文**

日期：2026-11-03。范围：提交工作区积累的改动，构建 Windows x64 安装包，更新本机桌面版，并在 GitHub 发布开发预览版。本地日志沿用 2026-11-02 开始执行时的 `release-0.1.14-` 前缀。

## 改动

- 工作区提供英文与简体中文界面，本地语言偏好跨桌面知识库和重启保留。切换语言保留用户正文和属性值。桌面启动器、托盘和独立 Android 界面不在此次汉化范围内。
- 浏览器与桌面共用知识库选择器，提供明确的新建、打开表单，并可为未来新建的知识库配置父目录。已有知识库保留原位置。
- 紧凑的数据库 List 属性、视图属性显隐、可恢复的数据源标题编辑与回收站清理，保留待保存草稿和版本检查。
- 页面图标对齐与编辑器点击边界；标签页切换后应用菜单刷新命令状态。脚注插入恢复正文输入或复用已有定义，支持取消和所属页面校验。
- 双语仓库文档与本地文档检查器。根 README 提供 GitHub 安装包入口。

操作说明见[写作与导航](../features/WRITING-AND-NAVIGATION.zh-CN.md)、[知识库](../features/VAULTS.zh-CN.md)、[List 视图](../features/DATABASE-LIST.zh-CN.md)、[数据库](../features/DATABASES.zh-CN.md)和[脚注](../features/FOOTNOTES.zh-CN.md)。

## 验证范围

- 全量单元测试：**1242 通过、5 跳过、0 失败**，并发限制为两个。最初的高并发执行遇到 Windows 进程与文件错误及 Pandoc 超时，降低并发后的完整重跑通过。最后的菜单与脚注修复后，另有 22 项相关单元测试通过。
- TypeScript、生产构建与 Windows NSIS 打包通过。两种语言的 README 预览均正确加载图标，无横向溢出。
- 定向浏览器验收：**61 项通过**，覆盖所有变更的浏览器测试文件及 AI 交互，使用独立 Chrome、临时知识库、独立端口和桌面前端构建。最终仅调整对话框布局前，菜单与脚注回归检查也已通过。
- 打包桌面验收：**15 项通过**。最终已安装程序及布局复查记录在 `.run/logs/release-0.1.14-publish-checks.log`。
- 双语文档配对、本地链接、标题锚点和语言路由通过 `npm run docs:check`。

尝试执行完整 **820 项**浏览器测试时，并发资源压力导致执行未能完整通过。额外扩大范围的检查还暴露出旧语法来源、未解析引用及斜杠菜单断言与当前行为不一致。本记录**不宣称**完整浏览器套件通过，因此此次发布标记为开发预览版。Android 实机安装和真实云服务验收不在本次范围内。

本地证据位于 `.run/logs/`：`release-0.1.14-unit-serial.log`、`release-0.1.14-unit-fixes.log`、`release-0.1.14-browser-accepted.log`、`release-0.1.14-browser-fixes.log`、`release-0.1.14-desktop-final.log`、`release-0.1.14-package-publish.log`、`release-0.1.14-docs-final.log` 和 `release-0.1.14-publish-checks.log`。截图包括双语 README 预览、知识库选择器、数据库 List、语言设置及脚注插入对话框。

## 安装包与本机升级

安装包为 `.run/desktop-release/Notdown-Setup-0.1.14-x64.exe`；[GitHub Release](https://github.com/EricCai00/Notdown/releases/tag/v0.1.14) 同时提供 `SHA256SUMS.txt`。Windows 构建仍未签名，尚无自动更新器。

打包审计逐项比对桌面构建文件和 `app.asar`，检查版本 0.1.14，并排除用户知识库与 Capacitor 原生包。打包器省略的类型声明文件不属于运行时资源。最终凭据和 SHA-256 位于 `.run/logs/release-0.1.14-artifact.json`。

旧 0.1.13 安装保存在 `.run/desktop-backups/Notdown-0.1.13-before-0.1.14/`。静默升级须以代码 0 退出；已安装的可执行文件和 `app.asar` 须与审计包一致，版本为 0.1.14.0。知识库列表、界面语言和默认位置配置哈希与 `release-0.1.14-install-before.json` 对比，结果在 `release-0.1.14-install-after.json`。安装器不迁移用户知识库。
