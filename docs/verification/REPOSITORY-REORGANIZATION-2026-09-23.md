# 仓库目录整理验证

2026-09-23。整理源码、测试、文档和本地日志；保留现有功能、正文格式、外部 URL、npm 命令及未提交的工作。不操作用户 `vault/` 或 MyBase 主库。

## 调整范围

- 移动 238 个文件：99 个源码文件、59 个单元/服务测试文件、46 个浏览器测试及辅助文件、34 个文档文件。
- `src/` 按应用装配、文档模型、编辑交互、具体块、功能、目录工具、共用工具和集成归类；保留已有 `markdown-engine/` 与 `markdown-lab/` 模块。
- 测试统一为 `tests/unit/` 与 `tests/e2e/`；更新 npm、TypeScript、Playwright、测试服务器和 MCP 测试的路径。
- 文档分为 architecture、reference、features、audits、verification，保留 `docs/FORMAT.md` 契约入口及 data、fixtures；增加导航和目录职责说明。
- 更新 import、动态 import、类型 import、文件 URL、CSS 资源、HTML 入口、启动探测和文档生成器的输出位置。
- 将根目录 301 份历史日志归入 `.run/logs/`，启动脚本的新日志也写入该目录；移除两个已清空的旧测试目录。没有删除历史日志或旧构建资源。

## 检查结果

下表是目录搬迁完成时的源码快照。验证期间工作区继续有独立的功能改动，后续功能不包含在构建逐字节对照和整套浏览器回归的结论中。

| 检查 | 结果 |
| --- | --- |
| 整理前单元/服务测试 | 447 项，446 通过、1 跳过、0 失败 |
| 整理后单元/服务测试 | 同上 |
| 整理前后 TypeScript 检查 | 通过 |
| 整理后生产构建 | 通过；仍有既有大 chunk 提示 |
| 构建对照 | 整理前备份源码生成的 135 个文件，在整理后构建中均存在且逐字节一致；现有 `public/vendor/` 额外文件保持原状 |
| 文件移动清单 | 238 个新位置全部存在，旧文件位置全部不存在 |
| 相对模块引用 | 648 处全部可解析 |
| 文档链接 | 232 处扫描完成；不存在失效的实际仓库链接，4 处非文件目标属于原有 Markdown 语法示例 |
| 开发服务 | 三个 HTML 入口、三个源码入口、全局样式与光标 SVG 均返回 HTTP 200 |
| 浏览器回归 | 分段覆盖 258 项：243 通过，15 失败；15 项均在整理前构建上复现 |
| diff 空白检查 | 通过 |

第一段浏览器执行完成前 226 项后中断；后续 31 项及最后一个定义引用用例分别补跑通过。浏览器测试使用独立临时知识库、隔离构建、本机无界面 Chrome；没有接入用户浏览器。失败对照使用整理前的源码备份构建，并复用相同用例。

收尾复核时，新增 Lab 方言列表调整后的单元/服务测试为 448 项，447 通过、1 跳过。修正了新增“已删除 pandoc-cli”断言因字面量联合类型不相交而触发的 TS2367，断言含义保持不变；该测试文件的 11 项用例复核通过，最终 TypeScript 检查与生产构建也通过。

## 已有浏览器失败项

这些问题未在目录整理中修改，也不计为验证通过。

| 用例文件 | 数量 | 失败范围 |
| --- | --- | --- |
| [block-spacing.spec.ts](../../tests/e2e/block-spacing.spec.ts) | 3 | 紧凑块、标题/容器以及内部子块的间距断言 |
| [dialect-boundaries.spec.ts](../../tests/e2e/dialect-boundaries.spec.ts) | 3 | CommonMark、GFM、官方 Notion 中启用补充插件的旧断言 |
| [editor.spec.ts](../../tests/e2e/editor.spec.ts) | 2 | 旧普通文本嵌套与页面提及/子页面断言 |
| [extension-provenance.spec.ts](../../tests/e2e/extension-provenance.spec.ts) | 2 | 来源筛选及内置语法分组断言 |
| [manual-test-pages.spec.ts](../../tests/e2e/manual-test-pages.spec.ts) | 2 | Pandoc 方言和标题块的验收样例断言 |
| [notion-format.spec.ts](../../tests/e2e/notion-format.spec.ts) | 2 | 官方标签样例与旧 nesting 开关断言 |
| [page-navigation.spec.ts](../../tests/e2e/page-navigation.spec.ts) | 1 | 首个历史导航用例等待页面提及 |

本地执行详情保存在 `.run/logs/reorganize-*.log`；截图和 trace 在 `test-results/reorganize-browser/`、`test-results/reorganize-baseline-browser/` 及补跑目录。临时移动清单与整理前源码备份在 `.run/`，不进入版本管理。目录规则见 [仓库组织约定](../architecture/REPOSITORY.md)。
