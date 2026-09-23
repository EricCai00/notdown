# Button 验证记录

2026-09-22。参考 [Notion Buttons](https://www.notion.com/help/buttons) 与[官方按钮配置界面](https://www.notion.com/help/guides/automatically-generate-blocks-pages-with-buttons)，实现范围见 [Button 本地契约](LOCAL-OBJECTS.md#button)。

- `npm test`：373 通过，1 项条件跳过，0 失败；包含 8 项按钮动作、四位置插入、原文／未知字段、旧格式、整组撤销和未闭合模板边界测试。
- `npm run build`：TypeScript 与 Vite 构建通过。
- Chrome 按钮专项 `e2e/button.spec.ts`：9/9 通过。覆盖直接点击和键盘执行、Slash 自动配置、名称／图标／样式、模板预览、步骤复制／排序／删除、保存重开、取消配置、确认取消、独立撤销、页面跳转前保存、外部刷新终止等待动作、窄屏和非法模板。
- 查看桌面配置、完成状态和 390px 窄屏截图，修正了配置时的整块选中底色以及预览标题／待办显示。截图位于 `test-results/button-settings.png`、`button-finished.png`、`button-mobile.png`。
- 全量 `npm run test:e2e` 已运行：120 通过，9 失败，26 未运行。按钮确认中断用例原先错误地等待已被外部刷新关闭的弹窗，修正断言后通过；样本页与按钮共 37 项补跑通过，另外两项方言用例补跑通过。仍有 5 项非按钮用例失败（Typora／TOC 3 项、侧栏拖动冲突 1 项、Tabs 1 项），不宣称全项目浏览器回归通过。

浏览器使用独立临时知识库、独立 Chrome 会话与测试端口 45439／45440。未写入项目 `vault/` 或 MyBase 主库。
