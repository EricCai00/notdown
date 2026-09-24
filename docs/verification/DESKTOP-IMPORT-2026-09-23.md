# 桌面版与 Markdown 导入验证（2026-09-23）

本次范围为 Windows 桌面启动、选择知识库、写作和文件夹复制导入。测试仅使用临时知识库、独立 Chrome 和隔离 Electron 用户配置，没有连接用户浏览器或写入用户 `vault/` / MyBase。

## 已通过

| 检查 | 结果 |
| --- | --- |
| `npm test` | 592 项：591 通过、1 跳过、0 失败 |
| `npm run build` / `npm run desktop:build` | TypeScript 和 Vite 构建通过；Vite 仍提示现有大 chunk |
| 导入服务测试 | 6 项通过：原始字节与 YAML、代码保留、链接及附件、无效输入、预览与明确跳过、幂等及中断恢复、20 MiB 边界 |
| Chrome 导入交互 | 1 项通过：预览、保存当前页、导入、编辑导入页、相同目录重复导入、源文件不变；最终使用独立 `desktop-dist/frontend/` |
| 源码 Electron | 3 项通过：多库隔离与导入、首次新建及最近目录与关闭保存、冲突阻止关闭并保留两份内容 |
| 最终打包 Electron | 同样 3 项通过，直接启动 `win-unpacked/Notdown.exe`，并断言 `userData` 位于测试临时目录 |
| Windows NSIS 构建 | 生成 `.run/desktop-release/Notdown-Setup-0.1.0-x64.exe`，未签名 |

打包后的应用通过运行测试；没有在用户 Windows 配置中执行安装向导或创建快捷方式。安装器的签名、SmartScreen 信任和自动更新不在当前已实现范围。

## 本次发现和修复

- 导入浏览器测试原先在 hash 导航完成前向旧页面输入。增加目标标题及正文等待，并在重复导入前检查目标页面已持久化。
- 旧 base64 校验正则在 20 MiB 附件上触发 V8 栈溢出。改为简单字符校验及解码回验，测试精确上限与超限。
- 隐藏 Electron 窗口的截图可能超时；功能回归不再依赖该截图。欢迎页与导入预览已另外进行截图检查。
- 桌面前端使用独立构建目录，避免工作区其他浏览器构建替换公共 `dist/` 时影响桌面打包。

## 完整浏览器回归

运行 `npm run test:e2e -- --output test-results/desktop-browser-regression --reporter=list`，最终 **290 通过、20 失败、28 未运行**，耗时约 28 分钟。该次运行使用公共 `dist/`，期间工作区有其他构建，出现过 `dist/index.html` 暂时不存在；因此它不是一轮稳定隔离的发布验收，也不能宣称全量通过。

20 项失败涉及块间距（3）、Callout 图标（1）、方言扩展开关（3）、编辑器列表及子页面（2）、扩展来源文案（2）、导入（1）、行内样式导航（3）、Typora 验收样本（1）、Notion 格式（2）、页面图标（1）、页面历史导航（1）。导入用例的导航等待已修复，最终专项通过；页面图标改用独立构建目录后复测通过。其余失败与未运行项未在本任务中修复或逐项复测，不能仅据此次运行判定其根因，也没有为使断言通过而修改其他并行工作。

本次桌面与导入流程的通过结论来自上表独立运行；完整编辑器回归仍需后续处理。页面图标独立复测日志为 `.run/logs/desktop-isolated-recheck.log`。

## 日志

执行日志保留在本地 `.run/logs/`：`desktop-all-unit-final.log`、`desktop-build-final.log`、`desktop-import-unit-final.log`、`desktop-import-final.log`、`desktop-native-final.log`、`desktop-packaged-final.log`、`desktop-package-final.log`。完整浏览器回归另见 `desktop-e2e-all.log`；专项通过不代表整个编辑器的全部旧用例通过。
