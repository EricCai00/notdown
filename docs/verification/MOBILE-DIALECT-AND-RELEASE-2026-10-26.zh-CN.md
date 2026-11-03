# 手机方言与 0.1.1 构建验证（2026-10-26）

[English](MOBILE-DIALECT-AND-RELEASE-2026-10-26.md) · **简体中文**

## 范围

- 手机普通页面及数据库记录：Notebook options 显示当前方言，打开 Page dialect 后可选择与桌面相同的 14 个方言、四个分组；R Markdown、Quarto 保留。
- 切换前收取并保存待处理输入；发生冲突时停止切换并保留两份可恢复内容。切换重设已知扩展，未知配置继续保留。
- 桌面和手机共用配置链路：只更新 YAML 中已有的 `syntax` / `bodyFormat` 覆盖字段，保留未知字段、注释、BOM、CRLF、别名定义、保留换行的 YAML 标量及后续正文。不自动添加应用 YAML。源码同步、撤销、保存重开覆盖同一配置变更。
- 修复从普通 Markdown 切到 Notdown 时 JSON 默认方言与正文覆盖配置可能不一致的保存问题。手机 Markdown 导入优先采用文件声明的有效方言。
- 本次源码提交按用户要求包含当前工作区累计的同步、数据库、导入、历史、多知识库与移动交互改动。本文的验证范围不替代各专题已有的能力边界。

## 版本与产物

- npm / Windows：`0.1.1`；Android：`versionName 0.1.1`、`versionCode 2`。
- Windows x64 NSIS：`.run/desktop-release/Notdown-Setup-0.1.1-x64.exe`。
- Android debug APK：`.run/android-release/Notdown-Android-0.1.1-debug.apk`；同时保留构建脚本的 `Notdown-Android-debug.apk`。
- 安装包与本地日志不进入 Git；发布源码不等于发布 GitHub Release。

## 自动验证

| 验证 | 结果 |
| --- | --- |
| `npm test`，最终源码 | 1,044 通过，5 跳过，0 失败 |
| 手机完整 Chrome 触屏回归 | 37 通过 |
| 最终手机构建的方言源码保留、未知设置及冲突回归 | 2 通过 |
| 最终桌面前端的编辑工作区与 Block Explorer | 14 通过 |
| 打包 Windows 应用的隔离知识库回归 | 4 通过 |
| Android 构建与 JVM 文件存储测试 | Gradle 成功 |
| Windows 安装包 | NSIS 构建成功，打包 EXE 版本 0.1.1 |

手机方言面板已查看截图，未出现横向溢出；选择器可显示 Quarto，源码、保存状态与菜单值一致。测试使用临时知识库、独立浏览器或隔离 Electron 配置，不连接用户浏览器或用户知识库。打包应用测试显式设置临时数据目录，避免读取本机实际知识库列表。

## 浏览器全量限制

不能宣称浏览器全量通过。本轮较早构建的 690 项套件在完成 158 项（151 通过、7 失败）后停止，剩余用例未完成。失败包括：

- `dialect-boundaries.spec.ts` 三项仍期待在 CommonMark、GFM 或官方 Notion 中启用 Notdown 补充插件；当前方言边界不允许这样做。
- `editor.spec.ts` 的两项嵌套文本旧结构断言，以及长大纲、页面提及各一项；后两项未在本轮定位修复。

随后扩展的定向浏览器运行是 26 通过、2 失败；失败为 `notdown-boundary.spec.ts` 的官方 Notion 控件断言、`notdown-dialect.spec.ts` 的扩展分组控件断言。这些失败未通过放宽方言边界绕过。本轮新增的桌面 YAML 方言切换、源码同步与撤销用例通过。

本地原始日志见 `.run/logs/release-0.1.1-browser.log`、`.run/logs/release-0.1.1-dialect-browser-final.log`；通过的最终检查分别见同目录的 `release-0.1.1-unit-final.log`、`release-0.1.1-mobile-final.log`、`release-0.1.1-mobile-dialect-final.log`、`release-0.1.1-workspace-final.log`、`release-0.1.1-desktop-test.log` 及两端 `*-final-build.log`。

## 设备边界

本机 Windows 已通过 NSIS 静默升级，安装器退出码为 0；安装后的 EXE 为 `0.1.1.0`，卸载项版本为 `0.1.1`。安装目录 `resources/app.asar` 的 SHA-256 与通过测试的打包产物一致。安装包及 APK 的 SHA-256 留在 `.run/logs/release-0.1.1-artifact-hashes.json`。

本轮 ADB 未检测到连接设备，因此只生成并核对 APK，不宣称已安装到手机或完成真实 Android WebView 验收。R、Python、Julia、Pandoc 执行仍需桌面服务；云同步仍是实验性前台功能，无后台同步保证。
