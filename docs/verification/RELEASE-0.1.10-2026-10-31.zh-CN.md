# Windows 0.1.10 发布验证

[English](RELEASE-0.1.10-2026-10-31.md) · **简体中文**

日期：2026-10-31。按用户要求提交 GitHub，并将本机桌面版从 0.1.9 升级至 0.1.10。

## 范围

- 每个新建／新导入数据库独立保存为 `databases/<id>.json`，包含自有来源、成员页面 ID 与视图；外部来源按 Link 引用，不复制定义或正文。
- Markdown 页面与 Wiki Home 继续使用原文件；数据库成员的兼容 API 字段由所属 JSON 投影。迁移、联合 CAS、中断恢复、回收站、ZIP、Git 检查点及文件级同步遵循同一存储契约。
- 修复删除后残留的数据库入口；Wiki Home 和集合视图共用全宽封面、标题、图标与下拉视图入口。普通页面提供 Full width 偏好，分栏内的块操作柄可独立访问。
- 旧数据库保持兼容，升级安装不自动迁移用户知识库。操作和迁移规则见[数据库文档](../features/DATABASES.zh-CN.md#独立数据库文件)。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 1225 通过，5 跳过，0 失败 |
| 数据库／Wiki／回收站浏览器回归 | 21 项通过，见[存储验证](DATABASE-FILES-2026-10-31.zh-CN.md) |
| 操作柄、Full width 和 Wiki 浏览器补充回归 | 7 项通过 |
| `npm run desktop:dist` | TypeScript、前端、主进程、NSIS 安装包构建通过 |
| 实际打包程序 | 13 项桌面测试通过，使用独立 profile 和临时知识库 |
| 打包内容 | 版本 0.1.10；主进程与构建文件一致；不含用户 vault 和 Capacitor 原生依赖 |
| 本机安装 | NSIS 静默升级退出码 0，安装后产品版本 0.1.10.0 |
| 安装文件及配置 | exe、app.asar 的 SHA-256 与已测试打包程序一致；`vaults.json` 哈希保持不变 |

新增打包用例直接验证独立 JSON、自有成员、跨库引用、Link 标记、Wiki Home 的真实 Markdown 保存和视图切换。其余桌面测试覆盖系统代理、多库隔离、token 加密、显式剪贴板桥接、标题栏、标签页、关闭保存、托盘、单实例以及退出失败／冲突保护。

安装包：`.run/desktop-release/Notdown-Setup-0.1.10-x64.exe`。SHA-256：`04f647046cb590a7d8b76f25a7543510ac62ed1e6d0add34d9fb2d81639dabc5`。

本地构建、单元、浏览器和桌面测试日志分别为 `.run/logs/release-0.1.10-build.log`、`release-0.1.10-unit.log`、`release-0.1.10-browser.log`、`release-0.1.10-desktop.log`；打包内容校验记录为 `release-0.1.10-artifact.json`。

安装前的完整 0.1.9 程序备份位于 `.run/desktop-backups/Notdown-0.1.9.0-before-0.1.10-2026-10-31T12-17-00Z/`，核心程序文件的备份哈希已验证。安装前后记录为 `.run/logs/release-0.1.10-install-before.json` 和 `release-0.1.10-install-after.json`。升级只替换程序文件，没有执行实际用户知识库迁移。

## 边界

Windows 安装包仍未签名；没有自动更新，也不扩大真实 Notion token、托管云服务或 Android 真机的验收范围。数据库历史保留恢复材料，目前没有自动回滚界面。多端使用独立数据库文件需各端支持同一格式版本。
