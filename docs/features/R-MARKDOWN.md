# R Markdown

2026-09-24：新增 `syntax.variant: rmarkdown`。方言下拉框选择 **R Markdown**，或通过 **Import Markdown folder** 导入 `.Rmd` / `.rmd`；扩展名自动选择此方言。正文仍保存为知识库 `pages/*.md`，导入原件可恢复保留，不改写源文件。

## 官方依据

- [R Markdown Quick Tour](https://rmarkdown.rstudio.com/authoring_quick_tour.html)：Rmd → knitr → Markdown → Pandoc，文档 YAML 和参数。
- [R code chunks and inline R](https://bookdown.org/yihui/rmarkdown/r-code.html)：代码块标签、选项、行内表达式、表格和图形。
- [knitr options](https://yihui.org/knitr/options/)：选项是 R 表达式，包含全局选项、`eval`、`echo`、`include`、`results`、`warning`、`message`、图形选项等。

本地方言复用已有 Pandoc Markdown 编辑能力。R 围栏优先于 Pandoc 属性解析，完整保留 `{r label, ...}`；不在 TypeScript 中拆分或求值 R 选项。行内 `` `r expression` `` 在编辑时显示为代码，运行时由 knitr 求值。普通 ` ```r ` 是展示代码，只有 ` ```{r} ` 执行。Notdown 集合方言也保留 R 代码块；整篇 R 执行入口仅在 R Markdown 方言显示。

## 使用

1. 安装 R、Pandoc，在 R 中执行 `install.packages("rmarkdown")`（包含 knitr 依赖）。Windows 自动查找 `Program Files/R` 下的 Rscript，其他平台使用 PATH。
2. 如需指定版本，启动服务前设置 `NOTDOWN_RSCRIPT` 为 Rscript 可执行文件绝对路径。可选 `PANDOC_PATH` 指定 Pandoc 可执行文件。修改后重启本地服务。
3. 选择 **R Markdown**。点击 **Insert R chunk** 插入代码块，Page 中编辑代码，Source 中编辑标签、选项及行内表达式。
4. 点击 **Run R Markdown**，结果显示在页面下方，包括文本、静态表格和嵌入的图形。**Stop R** 取消运行，**Close results** 关闭结果。

运行调用真实 `rmarkdown::render()`，固定输出静态、自包含 HTML；顺序执行整篇文档的代码块和行内表达式，遵循 knitr 选项及 YAML `params`。每次用新的 `Rscript --vanilla` 进程，在独立临时目录中运行；一次文档运行内部共享变量，多次运行之间不保留 R 会话。中文输出使用 UTF-8。错误、缺少运行环境和执行日志显示在结果面板中。

R 代码拥有当前本机账户权限，仅对可信文档手动执行。临时目录用于隔离产物，不是 R 权限沙箱。HTML 结果使用无脚本、无同源权限的 iframe 和 CSP 隔离，禁止网络资源。打开、导入、编辑、切换方言和自动保存均不运行 R。

## 存储与边界

- 运行前收取当前窗口 pending 输入，执行当前草稿快照。结果不进入 Markdown、metadata、撤销历史或 CAS 更新；不覆盖文件正文。原有保存与冲突规则不变。
- 编辑正文后结果标记为过期，正在运行的旧快照被取消；离开页面或关闭结果取消请求和 R 进程树，晚到结果不会附着到新文档。
- 源码最多 128,000 字符，同时最多两次运行，单次最多 60 秒，控制台与 HTML 各最多 8 MB。临时输出在完成、错误或取消后清理。
- 编辑器沿用本地 Pandoc 子集，并非完整 Pandoc 兼容性承诺。完整 R 选项交给安装的 knitr/rmarkdown 版本处理；未知选项原文保留。运行输出遵循这些官方运行库，编辑器 Extensions 开关不作为 knitr 或 Pandoc 运行参数。
- 当前没有持久 R 控制台、逐块共享会话、调试器、后台自动执行或持久缓存。代码可显式安装或调用的其他语言引擎不在本轮验证范围。
- YAML `output` 原样保留，但应用内运行固定 HTML；不提供 PDF/Word 导出、Shiny、JavaScript htmlwidgets 或 MathJax 结果预览。Markdown Lab 不自动执行 R。
- 不自动复制整个知识库或导入目录到运行目录。相对数据文件、child 文档、外部 bibliography、模板等需用户代码提供可访问路径；临时目录缓存不跨运行保留。

示例：[rmarkdown.Rmd](../fixtures/rmarkdown.Rmd)。验证覆盖代码/元数据原文、CRLF、未知选项、方言边界、导入、真实 R 的顺序变量/行内参数/表格/PNG/中文/错误，以及浏览器中的 pending 输入、显式执行、取消、结果隔离和重开。

2026-09-24 验证记录：本机 R 4.2.2、knitr/rmarkdown、Pandoc 真实执行通过；新增 7 项单元/服务测试和 18 项相关 Chrome 浏览器测试通过，`npm run build` 通过。全量 `npm test` 当次为 661 通过、1 跳过、1 失败；剩余失败为 `block-catalog.test.ts` 中 GFM Unsupported 示例期待 opaque_block、实际 paragraph 的断言。初次浏览器运行遇到并发构建移除共享 dist 的干扰，最终使用 `.run/rmarkdown-dist` 与独立测试输出目录复验通过。运行日志和截图位于 `.run/logs/rmarkdown-*`，测试使用临时知识库。
