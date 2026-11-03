# Windows 0.1.11 发布验证

[English](RELEASE-0.1.11-2026-10-31.md) · **简体中文**

日期：2026-10-31。范围为数据库入口统一、展示转换、面包屑及本机桌面升级。

## 行为与存储

- 编辑器统一使用 `block.database`。Inline、Full page 与 linked-only 数据库都拥有 `databases/<id>.json`；链接型数据库可没有自有来源，其视图保留外部来源的明确身份。
- `/database`、`/inline`、`/link` 命中同一 Database 创建入口，可选择展示方式和新建／链接来源。创建失败保留选择，取消不创建资源。
- 块菜单及数据库菜单支持双向转换，先保存 pending 正文和单元格；数据库 ID、JSON、来源、记录及视图不因转换重建。父页中的官方 `inline` 属性决定该入口的展示。
- 面包屑按真实父页面、数据库、记录层级导航。Inline 使用紧凑标题、视图标签和右侧工具，提供 Open as page；链接来源显示箭头和 Link。
- 同步接收旧格式时保持原宿主页及资源，避免下载过程中隐式迁移导致身份冲突。批次与逐项接收均有回归。

操作边界与 API 见[数据库](../features/DATABASES.zh-CN.md#创建位置与页面树)和[接口参考](../reference/API.zh-CN.md)。没有运行实际用户知识库迁移。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 1232 通过，5 跳过，0 失败 |
| TypeScript、生产前端和移动前端构建 | 通过 |
| 数据库／Wiki 浏览器回归 | 50 项均已通过；49 项在整组运行通过，面包屑旧断言更新后单独复跑通过 |
| 移动浏览器数据库／Wiki | 4 项通过，含旧格式同步、编辑和 reload |
| 打包桌面程序 | 13 项通过；独立 profile、临时知识库 |
| 包内容 | 版本 0.1.11，主进程与构建一致，不含用户 vault 或 Capacitor 原生依赖 |
| 安装后校验 | 产品版本 0.1.11.0；exe、app.asar 的 SHA-256 与已测打包程序一致；知识库配置哈希不变 |

桌面用例直接检查 linked-only JSON、共享记录、inline 收为页面入口、面包屑返回父页，以及转换前后 JSON 字节相同。浏览器还覆盖块手柄转换、待保存单元格、来源版本冲突、取消创建、导入原文及未知属性保留。既有保存失败和冲突保护用例继续通过。

日志位于 `.run/logs/`：`database-unify-full-unit.log`、`database-unify-all-browser.log`、`database-unify-breadcrumb-regression.log`、`database-unify-mobile.log`、`release-0.1.11-build.log`、`release-0.1.11-desktop.log`。UI 检查截图为 `release-0.1.11-inline.png`、`release-0.1.11-linked-inline.png`；触屏截图保存在 `test-results/mobile/`。

## 安装

安装包：`.run/desktop-release/Notdown-Setup-0.1.11-x64.exe`。

SHA-256：`82958ada6f76921c680c6db6665485735c551011b71dcb28f294f598de167b82`。

原 0.1.10 从应用菜单正常退出后，备份至 `.run/desktop-backups/Notdown-0.1.10.0-before-0.1.11-2026-10-31T13-52-58Z/`，并核对核心文件哈希。NSIS 静默升级退出码为 0，安装前后的 `vaults.json` 哈希相同。内容校验和安装收据为 `.run/logs/release-0.1.11-artifact.json`、`release-0.1.11-install-before.json` 与 `release-0.1.11-install-after.json`。

Windows 安装包未签名。本次没有扩大 Android 真机、实际托管云服务或真实 Notion token 导入的验收范围。
