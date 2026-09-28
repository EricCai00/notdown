# Meeting notes design QA — 2026-09-27

final result: passed

范围：用户提供的 8 张 Notion Meeting notes 截图中的会议卡片与菜单；接入当前 Notdown 编辑器，不复制外围 Playground 页面、照片或 Notion 专属服务。

## 视觉对照

使用独立 Chrome 与临时知识库。桌面 viewport 1440 × 1000、deviceScaleFactor 1；空卡片额外以 880 CSS px 宽截图，与参考图 1 中 880 px 卡片区域对齐。窄屏使用 600 × 900。参考图与实现截图在同一次视觉比较输入中打开；对语言菜单另做一次修复后比较。

证据位于 `test-results/meeting-empty.png`、`meeting-language.png`、`meeting-instructions.png`、`meeting-narrow.png`。运行日志位于 `.run/logs/meeting-*.log`。这些均为本地验证产物，不属于用户 vault。

| 检查面 | 结果 |
| --- | --- |
| 字体与层级 | 28 px 标题、灰色相对日期、17 px 菜单、较轻占位与说明文字；复用项目字体与 Lucide 图标。 |
| 布局与间距 | 圆角描边、标题分隔线、左侧 Notes 胶囊、右侧设置和蓝色主按钮、正文空态及底部指令/同意说明。窄屏底栏换行，无横向溢出。 |
| 颜色 | 中性描边、白底、灰色占位、蓝色主操作与日期选中态，菜单有独立边框和柔和阴影。 |
| 图片与图标 | 会议卡片不含位图资产；使用现有图标库，不把参考页下方照片复制进笔记块。 |
| 文案 | 使用真实 Notdown 服务边界；占位为 AI can summarize，不冒充 Notion AI，也不承诺自动执行或实时录音。 |

修复循环：首次截图发现编辑器通用占位与会议占位重叠（P2），已在会议正文限定范围抑制通用占位，后续同宽截图确认不再重叠。语言子菜单在屏幕右边缘遮住父菜单（P2），已按可用空间翻转至左侧，修复后重新截图确认父菜单及语言列表可读。

剩余 P3：人物/设置/笔图标沿用现有 Lucide 变体，标题行和空态高度有少量像素差异；不阻塞当前产品实现。高级日期范围、提醒、实时录音、Notion 专属演示/反馈、跨页面 Move to 不在本次实现内，见功能文档。

## 功能与保存

- `npm test`：841 passed、5 skipped、0 failed。
- `npm run build`：通过；最终菜单修正再次通过 `npm run typecheck` 与独立目录 Vite build。
- `npm run test:e2e -- ...`：覆盖会议、服务、官方容器、对象编辑与块属性，共 17 passed、1 failed。失败是 `object-editing.spec.ts` 的表格用例等待 `Merge right` 按钮超时，未涉及会议卡片；不将其记为整套浏览器测试通过。
- 最终会议专项：5 passed。验证日期、语言、默认和自定义指令保存重开、未知属性保留、上传/同意/转写/摘要、原笔记保留、延迟响应恢复、官方方言不写扩展、窄屏和稳定标签链接。
- 专项外的服务/官方容器回归也已通过；未连接用户浏览器或用户知识库。

源码与实现边界见 [Meeting notes](../features/MEETING-NOTES.md)。

## 同日修正：复用 mention 日历

此前独立实现会议日历没有复用已有日期组件，现已删除该实现及专属样式，会议标题直接绑定 `DateMentionView`，使用相同的 `date.css`。本节替代上文关于日期范围与提醒未实现的边界：Notdown 会议日期支持既有范围、时间、格式、时区和本地提醒；官方方言仅开放开始/结束日期，不写入扩展属性。

- 视觉证据：`test-results/inline-shared-calendar.png` 与 `test-results/meeting-shared-calendar.png`，两个面板的控件和样式相同；自动化同时比较完整面板 HTML，并检查 420 px 视口内的定位。
- 交互回归：会议日期、会议笔记、正文日期、官方 MCP 容器共 15 passed、0 failed。覆盖保存重开、未知属性与其他日期保留、撤销/重做、清除后撤销、重新添加、视图切换和官方方言限制。日志：`.run/logs/meeting-date-final-e2e.log`。
- 单元及服务测试：846 passed、5 skipped、0 failed，日志：`.run/logs/meeting-date-unit.log`。
- 最终 `npm run build` 通过，仅有既有的大体积 chunk 提示，日志：`.run/logs/meeting-date-production-build.log`。
- 关闭面板后恢复编辑器焦点，撤销接入现有统一历史；不把多次设置变更描述为一次整体撤销。
