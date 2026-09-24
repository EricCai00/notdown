# 官方方言测试文档

核对日期：2026-09-23。范围是 Notdown 当前注册的十一种上游方言，排除自定义 `notdown`。本目录不是知识库，不应直接覆盖 `vault/pages/`。

本目录已经满足“每个方言一份 Markdown 测试文档”。与旧 Typora / Obsidian 对照文档、Tests 手工验收页的区别，以及直接打开测试的方法，见[测试文档总入口](../README.md)。本套优先用于官方语法覆盖；旧样本保留用于显示和编辑交互验收。

| 文件 | 依据与覆盖范围 |
| --- | --- |
| [commonmark.md](commonmark.md) | CommonMark 0.31.2 全部 652 个规范例子，加基础组合用例 |
| [gfm.md](gfm.md) | GFM 0.29-gfm 全部 677 个规范例子、扩展边界；`doc-*` 独立核对 GitHub 网站文档 |
| [markdown_strict.md](markdown_strict.md) | John Gruber 原始文档、Markdown.pl 行为边界 |
| [markdown_phpextra.md](markdown_phpextra.md) | PHP Markdown Extra 官方全部语法类别与关键边界 |
| [markdown_mmd.md](markdown_mmd.md) | MultiMarkdown 6 官方语法、引用、表格、预处理及元数据键 |
| [markdown.md](markdown.md) | Pandoc 3.11 Markdown、全部 reader 扩展开关、额外边界 |
| [commonmark_x.md](commonmark_x.md) | Pandoc 3.11 CommonMark X、该 reader 全部扩展开关 |
| [markdown_github.md](markdown_github.md) | Pandoc 3.11 已弃用的 GitHub reader；不是当前 GFM |
| [typora.md](typora.md) | Typora Markdown Reference、三种图表围栏、严格模式、需启用的偏好 |
| [obsidian.md](obsidian.md) | Obsidian 基础/高级语法、内链、块 ID、嵌入、全部 callout 名称与别名 |
| [notion-markdown.md](notion-markdown.md) | Notion Enhanced Markdown 官方块、行内、提及、全部颜色与格式边界 |

这些文件是**可阅读、可整篇导入的语料集合**。`<!-- CASE … -->` 分隔用例；真正的独立用例由 [cases.json](cases.json) 的 `start/end` 字符偏移提取，标记不送入逐例解析。偏移采用 JavaScript UTF-16 字符索引，不是 UTF-8 字节。保存时必须保留 LF、Tab 和尾随空格。测试验证文档及各片段的 SHA-256。

**整篇转换不能替代逐例测试。** 未闭合围栏会吞掉后续章节，元数据仅在文首有效，同名引用定义会相互影响。运行器同时保存整篇 HTML 和逐例 HTML；判断单项兼容性使用逐例结果。每个例子完整输入、配置、官方链接及原始输出都保留，不以 Notdown 的实际输出倒填预期。

## 配置与判定

- `default`：对应 `syntax.variant`，`extensions: {}`。
- `documented`：仅启用该例明确列出的扩展。Typora 的行内公式、高亮、上下标、告警、图表有独立用例；不能将默认关闭视作未实现。
- `disabled`：三个 Pandoc 自有方言逐一关闭相应开关，检查反向边界。
- `file-path`：使用实际输入文件，并给 Notdown 传 `sourcePath`，检查路径重定位。
- GFM 的 spec 与 GitHub Docs 分开：规范用例采用 cmark-gfm；`doc-*` 用官方 GitHub REST 渲染结果。官方服务使用公开 `github/docs` 仓库作为引用上下文。未设置的外部工单规则、不存在的 SHA、前端地图/3D/数学组件不能仅由 REST HTML 证明。
- `roundtripExact` 只说明未修改原文能还原，不证明内容被正确解析或编辑后仍能保持语义。
- `domEqual` 是保守 HTML 树比较；不删除 ID、class、链接目标、表头标签或代码空白。`textEqual` 只辅助定位，绝不是通过率。

官方文档的语法类别已列入本套用例，但有限输入不能穷尽无限的嵌套、错误输入、组合或外部服务状态。HTML 无法验证 LaTeX/BibTeX 输出、MMD 非 HTML 元数据副作用、笔记链接交互和云端对象权限。具体缺口见[审计报告](../../audits/DIALECT-HTML-AUDIT-2026-09-23.md)。规范例子许可见 [UPSTREAM-LICENSE.md](UPSTREAM-LICENSE.md)。

## 复现

在仓库根目录执行，首次项目安装使用 `npm ci`。测试辅助工具保存在忽略目录 `.run/`，不会加入应用依赖。

```powershell
node scripts/dialect-audit/fetch-sources.mjs
node scripts/dialect-audit/setup-tools.mjs
Expand-Archive .run/dialect-audit/tools/php.zip .run/dialect-audit/tools/php -Force
Expand-Archive .run/dialect-audit/tools/markdown.zip .run/dialect-audit/tools/markdown -Force
npm --prefix .run/dialect-audit/tools install --package-lock-only --ignore-scripts --no-audit --no-fund
npm --prefix .run/dialect-audit/tools ci --ignore-scripts --no-audit --no-fund
node scripts/dialect-audit/build-corpus.mjs
npx tsx scripts/dialect-audit/run.ts
node scripts/dialect-audit/github-official.mjs
npx tsx scripts/dialect-audit/finalize.ts
```

需要 Pandoc、MultiMarkdown、Perl 和 Python 的 `cmarkgfm` 包；本机复用了 `.run/gfm-renderer` 的 wheel。其他机器可用选定 Python 的 `-m pip install --target .run/gfm-renderer cmarkgfm==2025.10.22` 准备绑定。可设置 `AUDIT_PYTHON`、`CMARKGFM_PATH`、`PANDOC_PATH`、`MULTIMARKDOWN_PATH`、`MARKDOWN_PL_PATH`、`PERL_PATH`、`PHP_PATH`。PHP ZIP 校验官方 SHA-256；PHP Markdown Extra 固定 2.0.0，CommonMark JS 固定 0.31.2，Markdown.pl 固定 1.0.1。

重新抓取文档并生成语料会改变来源快照；若只复跑当前语料，跳过 `fetch-sources` / `build-corpus`。GitHub 服务结果有内容哈希缓存，避免每次重复消耗配额。源文档抓取中的 Typora 页面若直连失败，使用其官方 GitHub 支持站镜像，`retrievedFrom` 记录实际来源；在线文档仍作为语义依据。

产物：`.run/dialect-audit/results/index.html` 为可筛选的渲染结果与 HTML 代码对照。官方实现就是 Pandoc 时合并为一列；没有实际 HTML 输出的解析器不显示。预览使用禁用脚本/外部资源的隔离 iframe 与统一基础样式，原始 HTML 代码保持不变。`*.official.html`、`*.notdown.html`、`*.pandoc.html` 为整篇转换，`*.cases.json` / `results.json` 为逐例完整证据。版本管理中的精简统计和差异索引位于 `docs/data/dialect-audit-2026-09-23/`。运行日志写 `.run/logs/`。

`obsidian-official.mjs` 是隔离官方应用尝试，不是复现必需步骤；本机两次均未取得官方输出，报告因此明确记为未验证。它只使用临时 profile 与临时 vault，没有启用或修改用户知识库的插件。

本机另以官方 Typora 0.9.58 菜单导出 `typora.official.html`，仅作整篇比较；没有逐例或当前版本兼容性结论。复现时对测试文档副本使用“文件 → 导出 → HTML (without styles)”，保存 HTML 到结果目录，并将应用实际保存的源文件复制为 `typora.application-saved.md`（旧应用会自动规范化部分空行）；将版本、输入哈希记入 `typora.official.meta.json`。`finalize.ts` 对此保存后的输入重新生成 Notdown HTML，与官方 body 比较，不混用修改前后的源文档。
