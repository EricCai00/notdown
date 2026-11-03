# 手机字体样式与 Notion v2 Markdown 保存（2026-10-25）

[English](MOBILE-FORMATTING-MARKDOWN-2026-10-25.md) · **简体中文**

范围：手机斜体显示、文字及背景调色板，以及手机和桌面共用的 Notion v2 序列化。使用说明见 [Android](../features/ANDROID.zh-CN.md) 与 [Notion 格式参考](../reference/NOTION-MCP-SYNTAX.zh-CN.md#notion-v2-的保存规则)。

## 行为

- 手机正文允许合成斜体，解决系统中文字体缺少斜体字形时标记存在但显示不倾斜的问题。
- 文字颜色和背景色分别提供九色及 Default；Page 中取消一个颜色通道保留另一通道、其他样式及未知字段。选中文字和后续输入均可操作，保留选区和焦点，支持撤销、重做、保存重载。
- Notion v2 普通标题、列表、任务、引用、粗斜体、删除线、图片、公式和可无损表达的表格优先写 Markdown。样式、图片和表格候选经过解析校验；属性、子块、边缘空白、歧义及未知内容保留官方标签。未编辑块保留原文，不迁移知识库。
- Source 调色板用于插入所选颜色语法；清除已有颜色切回 Page。v2 下划线插入 `<u>`，颜色继续使用官方 span 载体。

## 验证

- 首次完整 `npm test`：1023 项，1018 通过、5 跳过、0 失败。最终序列化和颜色专项 19 项全部通过，另覆盖标题末尾井号、图片 caption 转义、表格竖线及代码标记、旧字段与代码围栏。后续完整重跑停留在 R 测试进程退出阶段并取消，未计作通过。
- 最新桌面构建和定向 51 项浏览器回归中 50 项通过；一项旧测试仍预期独立图片位于第三个段落中，已改为验证两侧段落、独立 figure、实际图片加载和保存重载，该文件 3 项重跑全部通过。此前出现的光标与列内换行失败在最终复测中通过。未运行完整桌面浏览器集。
- 最新移动构建：独立 Chrome / Pixel 7 完整 31 项全部通过，包括新增中文斜体、颜色选择/独立清除、撤销/重做、连续输入、320px 面板及 v2 编辑保存 Markdown。
- `npm run android:build`：TypeScript、Vite、`assembleDebug`、`testDebugUnitTest` 通过；包内 HTML 及 64 个静态 JS/CSS 文件与受测移动构建逐一核对 SHA-256 一致。已检查窄屏调色板截图。
- 所有浏览器验证使用临时存储与临时 WebDAV 服务；本轮未在真实 Android WebView/输入法上验收，未覆盖安装或修改用户知识库。

## 本地产物

- APK：`.run/android-release/Notdown-Android-format-2026-10-25.apk`，71,253,018 字节。
- SHA-256：`89f1494ff549a5daa1eb49a6aeb1a3253dbc43ad74d39ba215092b161c6b0a4a`。
- 日志：`.run/logs/mobile-format-*`、`.run/logs/notion-markdown-focused-unit.log`。
- 截图：`test-results/mobile-format-final/mobile-mobile-italic-displ-b27d2-sen-and-reset-independently/mobile-color-palette.png`。
