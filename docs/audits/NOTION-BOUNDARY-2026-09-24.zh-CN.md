# Notion 官方语法边界核查

[English](NOTION-BOUNDARY-2026-09-24.md) · **简体中文**

2026-09-24。依据 [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown) 与 [Working with markdown content](https://developers.notion.com/guides/data-apis/working-with-markdown-content)。本轮是官方文档与本地实现对照，没有调用 Notion API 做服务端兼容性实测；未列出的语法不等于证明远端拒绝，但不能据此纳入本项目的严格官方方言。

## 修正

| 位置 | 原行为 | 当前边界 |
| --- | --- | --- |
| Inline image | Markdown-it 默认 image 规则允许段落中图片；目录显示默认支持 | 官方仅定义媒体块。独立图片保留；富文本内整段图片标记保持字面文本，不退化成链接。目录标为不可用。 |
| Autolink | 尖括号 URL/邮箱被默认规则转链接；裸 URL 实际未启用，目录却统一显示支持 | 尖括号与裸 URL 均不启用；显式 true 不能绕过边界。 |
| Internal link | 通用链接 adapter 容易被理解为支持所有内部链接形式 | 普通 `[text](URL)` 与官方 page mention 可用。片段 URL 的语法可保留，但不意味着有自动生成的目标标题 ID。Wiki 源码不解释；`[[…]]` 输入快捷键写出官方 mention，不代表 Wiki 是存储方言。本地页面寻址是应用能力。 |
| 普通标题子块 | 自动改成 toggle heading | 未写 `toggle="true"` 的标题连同子块保留源码。合法 toggle heading 继续支持。H5/H6 按官方规则映射 H4。 |
| 有序任务列表 | 接受并写出 `1. [x]` | 官方任务列表只定义无序形式。已有有序任务保留源码，禁用对应输入转换。 |
| 波浪线围栏 | 通用代码分支接受 `~~~` | 官方文档只定义反引号围栏；波浪线围栏整体原文保留，内部不解析标签。 |
| 表格 th | 接受 HTML `th`，写回时成为 `td` | 官方列出 `td` 与表级 header-row/header-column；`th` 表格整体原文保留。官方完整示例中的 pipe table 继续保留。 |
| 图片 title、span class | 图片 title 当作普通 Markdown 属性；span class 可产生 small-caps/native-span 语义 | 官方图片 title 与 small-caps/native-span 结构保留源码，序列化拒绝新生成这些结构。普通 color/underline span 继续支持，未知字段不删除。 |
| Citation | 任意 `[^label]` 作为 URL citation，且不遵循 mentions 开关 | 仅带 scheme 的 URL 是 citation；普通脚注标记为文本，官方不启用脚注扩展。引用受 `notion_mentions` 控制。 |
| 扩展开关 | `gutenberg` 提前返回，绕过官方白名单 | 官方可用开关统一依据官方预设白名单；不支持的已存配置保留但无行为。 |

写入额外校验防止粘贴或程序构造的行内图片、非官方样式、有序任务及普通标题子块绕过源码解析。校验失败保留当前内容并报错，不把它们静默变成其他结构。

编辑器插入独立图片源码时按媒体块切开前后文字，不塞进行内；表格富文本内则保留图片源码文本。列表、引用及容器中的合法子图片块仍可保存。

## 保留与限制

- Notdown 与其他 Markdown 方言继续使用自己的图片、自动链接、Wiki、样式等扩展；不批量迁移文件，不操作用户 vault。
- 回归覆盖原文往返、CRLF、修改相邻块、嵌套容器、代码围栏、配置强制开启和实际序列化。未修改源码复用与新生成路径分别检查。
- 数据库、agent mention 和未核实完整编码的 meeting notes 仍是已知缺口，继续保留原文；Notion 工作区自定义 emoji 尚无资源解析。没有宣称完整实现所有官方对象或远端往返。
- 没有把普通 Markdown 的所有替代拼写一概判为不合法。本轮修复明确的结构语义差异与无文档依据的能力声明；完整解析符合性仍需要更多上游输入语料。

## 验证

- `npm test`：616 项，615 通过、1 跳过。日志：`.run/logs/notion-boundary-unit.log`。
- `npm run build -- --outDir .run/dist-notion-boundary`：通过；Vite 仍提示部分 chunk 较大。日志：`.run/logs/notion-boundary-build.log`。
- `npm run test:e2e -- tests/e2e/notion-boundary.spec.ts tests/e2e/block-catalog.spec.ts tests/e2e/markdown-blocks.spec.ts` 首轮暴露测试产物并发清理和图片计数误含 ProseMirror 辅助图片的问题。修正选择器后，以独立构建、4392 端口、临时知识库和 Chrome 运行同三份文件，14 项通过；最终重新构建后的边界专项 3 项也通过，包含图片实际加载。日志分别为 `.run/logs/notion-boundary-e2e-isolated.log` 和 `.run/logs/notion-boundary-e2e-final.log`。未运行整个浏览器测试目录。
