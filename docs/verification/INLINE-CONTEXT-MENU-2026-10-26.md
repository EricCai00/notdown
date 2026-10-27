# 行内对象右键菜单与分区源码验证（2026-10-26）

## 范围

- 桌面语义 inline 菜单：类型标题、View source、Turn into、属性／源码编辑、链接操作、日期／公式编辑、联系人入口、脚注跳转、修订接受／拒绝、复制与删除。
- 文字样式与对象分开：粗体、斜体、颜色、下划线、高亮、上下标等不触发对象菜单；操作带样式的链接／公式时保留可表达的样式。
- 有来源的对象源码分为 Inline reference 与 Reference source，各自可复制。标准引用式链接和图片显示原引用及本页对应定义；脚注／MMD 引文显示正文／定义，缺失来源明确提示。页面显示目标信息；外部书目只显示配置路径，不读取远端内容。
- 右键按下时记录对象，打开菜单时核对文档和坐标，避免公式获得焦点后重新渲染导致右键事件落到外层段落。正文变化关闭菜单，源码编辑拒绝旧草稿。
- 保留既有 Markdown 编码、正文保存、baseRevision 与冲突处理。测试使用独立 Chrome 和临时知识库，未写入用户 vault；未执行真机或桌面安装包验收。

## 验证

| 检查 | 结果 | 本地日志 |
| --- | --- | --- |
| `npm test` | 1061 通过、5 跳过、0 失败 | `.run/logs/inline-context-unit-final.log` |
| `npm run build`（含 TypeScript 检查） | 通过，保留既有 bundle 大小提示 | `.run/logs/inline-context-build-final.log` |
| 行内菜单、行内对象与块菜单位置回归，排除下述题注双击用例 | 22 通过 | `.run/logs/inline-context-browser-verified.log` |
| 最终行内菜单与块源码面板回归 | 13 通过 | `.run/logs/inline-context-source-final.log` |

两次浏览器运行有重叠，不将 22 与 13 相加作为独立用例数。最终运行包含 7 项新菜单用例与 6 项既有块源码用例，覆盖两部分源码及菜单复制、只读、原引用与多行定义、代码围栏排除、同 URL 不同引用定义、样式边界、相邻对象定位、公式编辑与转换、撤销／重做、保存重载、页面信息、日期编辑、键盘／窄视口与旧草稿拒绝。单测新增 7 项。

已查看 `test-results/inline-context-menu.png` 与 `test-results/inline-reference-source.png`，以及块源码短内容／长代码／窄视口截图。菜单和分区源码面板布局正常。

## 已知回归限制

`tests/e2e/inline-objects.spec.ts` 的 `official Notion image captions use the media label without enabling MMD figures` 等待双击后出现 Caption 输入框超时。包含该用例的一次相关回归为 21 通过、1 失败，见 `.run/logs/inline-context-browser-final.log`。

通过诊断构建将新 `inlineContextMenu` 替换为空 ProseMirror 插件，再用独立端口和临时知识库运行同一题注用例，仍在相同 Caption 输入框处超时，见 `.run/logs/inline-context-baseline-caption.log`；诊断构建日志为 `.run/logs/inline-context-baseline-build.log`。因此该失败不由本次菜单事件处理引起，未更改既有题注实现或修改该用例以绕过失败。没有运行全量浏览器套件，不宣称全部 E2E 通过。
