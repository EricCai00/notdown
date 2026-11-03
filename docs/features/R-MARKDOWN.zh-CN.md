# R Markdown

[English](R-MARKDOWN.md) · **简体中文**

2026-09-24：新增 `syntax.variant: rmarkdown`。方言下拉框选择 **R Markdown**，或通过 **Import Markdown folder** 导入 `.Rmd` / `.rmd`；扩展名自动选择此方言。正文仍保存为知识库 `pages/*.md`，导入原件可恢复保留，不改写源文件。

## 官方依据

- [R Markdown Quick Tour](https://rmarkdown.rstudio.com/authoring_quick_tour.html)：Rmd → knitr → Markdown → Pandoc，文档 YAML 和参数。
- [R code chunks and inline R](https://bookdown.org/yihui/rmarkdown/r-code.html)：代码块标签、选项、行内表达式、表格和图形。
- [knitr options](https://yihui.org/knitr/options/)：选项是 R 表达式，包含全局选项、`eval`、`echo`、`include`、`results`、`warning`、`message`、图形选项等。
- [R Notebook](https://pkg.yihui.org/rmarkdown-book/notebook)：图 3.3 的块内工具栏和下方输出、图 3.8 的行内结果浮层。本地采用这两种展示方式，保留手动执行，不实现保存时自动执行。

本地方言复用已有 Pandoc Markdown 编辑能力。R 围栏优先于 Pandoc 属性解析，完整保留 `{r label, ...}`；不在 TypeScript 中拆分或求值 R 选项。2026-09-25 起，R 与 Quarto 语言共用 `block.executable_chunk` 与 `inline.executable_expression` 两种类型；两者有 R 语法高亮，不借用 Code Block、code mark 或通用原文节点。行内表达式保留原始空白，运行时由 knitr 求值。普通 ` ```r ` 仍是展示代码。Notdown 集合方言也支持这两种类型；整篇 R 执行快捷键仅在 R Markdown 方言有效。

编辑界面显示高亮的 R 程序和表达式，围栏和 `{r ...}` 留在 Source 与齿轮选项面板。Notebook 手动执行当前块或上方块时使用交互求值，`eval`、`echo`、`include` 等发布可见性选项不隐藏交互结果，输出使用无注释前缀的控制台文本；`fig.width`、`fig.height` 等图形选项保留。默认遇到错误停止，显式 `error=TRUE` 可继续。行内结果在表达式附近显示纯文本浮层，保留表达式本身。

单独的整篇 Knit 预览仍遵循发布语义：`eval=FALSE` 跳过求值，`echo=FALSE` 隐藏源码，`include=FALSE` 隐藏源码与结果但仍执行，`results='asis'` 按 Markdown 处理输出；块内 `#|` 选项覆盖头部同名选项。其行内 R 会替换成计算后的行内文本。

## 使用

1. 安装 R、Pandoc，在 R 中执行 `install.packages("rmarkdown")`（包含 knitr 依赖）。Windows 自动查找 `Program Files/R` 下的 Rscript，其他平台使用 PATH。
2. 如需指定版本，在 **Workspace settings → Code execution → Rscript path** 输入 Rscript 可执行文件路径；高级选项中的 **Pandoc path** 可指定 Pandoc。**Check R** 检查环境；保存后下次运行直接生效，现有 Notebook 会话会被重置。仍兼容启动环境变量 `NOTDOWN_RSCRIPT` / `PANDOC_PATH`；应用内设置留空时沿用它们或自动检测。详见 [运行环境设置](QUARTO.zh-CN.md#语言与运行环境)。
3. 选择 **R Markdown**（Notebook 节点也支持 Notdown）。在现有 `/` 插入菜单选择 **Executable Chunk**，直接创建空白 R 块并进入代码；**Executable Expression** 直接插入 R 表达式。两者均不弹出语言选择，Notdown/Quarto 沿用记忆语言，R Markdown 固定为 R。Page 中直接编辑 R 程序，齿轮按钮编辑完整 `{r label, ...}`。行内 R 使用含 `text*` 的独立节点，点击表达式放入文本光标，支持直接输入、选择替换、撤销重做和动态高亮；点击左侧 **r** 语言名称打开语言选择及运行面板。Notdown/Quarto 中可选择其他语言，R Markdown 方言只提供 R。Source 仍包含完整文件。
4. 块右上角从左到右为选项、运行全部上方 R 块、运行当前块。在 R 块内按 **Ctrl/Cmd+Shift+Enter** 运行当前块。运行期间三角形变成停止键。结果位于块下方，可折叠或清除；清除已完成的结果不清空变量。齿轮中的 **Restart R and clear output** 同时重启会话和清空结果。
5. 在行内表达式内按 **Ctrl/Cmd+Enter**，或点击 **r** 后点击浮层运行图标；结果仅为文本。Escape 或点击表达式／外部关闭浮层，再次点击 **r** 可重看。不会因保存或打开浮层自动运行。
6. R Markdown 方言下点击工具栏 **Knit**，或在普通正文位置按 **Ctrl/Cmd+Shift+Enter**，在全新 R 会话依次执行整篇文档并切换到只读结果；inline R 显示为计算值，遵循 `eval`、`echo`、`include` 等发布选项。点击 **Return to editing** 恢复运行前的原始正文，清除临时输出和 Notebook 会话；不修改 Markdown、不增加撤销记录。Source／Split／Page 按钮也可离开结果视图。页面工具栏不显示 Insert R chunk、Insert inline R 或 Run R Markdown 按钮。

若界面显示旧后端／API 未找到，需重启本地开发服务或桌面应用：新增 HTTP 路由不会进入已经启动的旧 Node 进程。`npm run dev` 现使用 `tsx watch server/index.ts`，后续服务端代码修改自动重载；切换到该启动方式时仍需首次重启旧进程。

Notebook 为每个编辑窗口创建随机会话标识，在独立临时目录启动真实 `Rscript --vanilla` 工作进程。变量、已加载包和 knitr 全局选项在该会话内保留；运行当前块不会自动重跑上方块。使用 knitr 生成输出，再通过 Pandoc 生成嵌入图像的静态 HTML。行内表达式在同一环境求值，输出纯文本。YAML `params` 来自本次捕获的文档。不同窗口不共享变量。

整篇 Knit 调用 `rmarkdown::render()`，每次新进程，顺序执行整篇文档并遵循发布选项，结果是静态、自包含 HTML。两种路径均使用 UTF-8，并显示真实运行错误。

R 代码拥有当前本机账户权限，仅对可信文档手动执行。临时目录用于隔离产物，不是 R 权限沙箱。HTML 结果使用无脚本、无同源权限的 iframe 和 CSP 隔离，禁止网络资源。打开、导入、编辑、切换方言和自动保存均不运行 R。

## 存储与边界

2026-09-25 Knit／行内编辑修订：全量单元测试 727 通过、1 跳过，后续光标修复的 105 项相关单元测试及 17 项独立 Chrome 测试通过，构建通过。覆盖原生文本选择替换、高亮、结束反引号后的光标位置、撤销重做、保存重开、仅 r 标记打开运行面板、Knit 顺序执行及行内值替换、返回原文、晚到结果隔离和旧后端 404 提示。日志 `.run/logs/r-knit-*`，只读结果截图 `.run/logs/r-knit-preview.png`。当时本机 4318 仍为旧进程，新接口在独立临时测试服务验证通过；重启旧进程的操作被自动审批拒绝，需手动重启开发服务后生效。

2026-09-25 Notebook 交互验证：全量 `npm test` 为 726 通过、1 跳过、0 失败；类型检查、独立前端构建及桌面入口打包通过。R Markdown 与普通代码块的 14 项 Chrome 测试通过，最后的图形布局调整另复验 3 项 Notebook 测试。真实 R 验证共享变量、仅运行指定块、上方块遇错停止、`error=TRUE` 继续、行内结果、表格、PNG、取消后重置与窗口隔离；浏览器覆盖输出折叠/清除、会话重启、过期结果、关闭浮层后编辑不重新弹出及图形高度。使用临时知识库、独立构建 `.run/r-notebook-dist`；日志与截图位于 `.run/logs/r-notebook-*`。

2026-09-25 修订验证：全量 `npm test` 为 723 通过、1 跳过、0 失败；构建通过。R Markdown、普通代码块与节点身份的 12 项独立 Chrome 测试通过，包括直接输入行内 R、两个独立类型的高亮、选项编辑、保存重开、撤销重做、工具栏按钮移除，以及真实 R 输出。浏览器使用临时知识库和独立构建 `.run/rmarkdown-fix-dist`，日志为 `.run/logs/rmarkdown-fix-*`，未修改用户知识库。

- 运行前收取当前窗口 pending 输入，执行当前草稿快照。结果不进入 Markdown、metadata、撤销历史或 CAS 更新；不覆盖文件正文。原有保存与冲突规则不变。
- 仅执行节点自身代码、语言或块头选项变化时，其结果标记为过期；恢复为上次运行的源码会去掉提示。普通正文或其他节点的编辑不使该结果过期，也不取消该节点的单次执行；修改正在运行的节点会取消旧快照。离开页面、停止运行或清除正在运行的结果会取消请求和 R 进程树，晚到结果不会附着到新文档。关闭行内浮层或清除已完成的输出不重置会话变量。
- 源码最多 128,000 字符。每个服务最多两个 Notebook 会话，同一会话串行执行；另有最多两次整篇 Knit 运行。单次请求最多 60 秒，控制台与返回结果各最多 8 MB。Notebook 空闲 15 分钟会被回收；停止、超时、重启、离开页面或关闭窗口时终止进程并清理临时目录。普通 R 代码错误保留已有会话变量，便于修正后继续。
- 编辑器沿用本地 Pandoc 子集，并非完整 Pandoc 兼容性承诺。完整 R 选项交给安装的 knitr/rmarkdown 版本处理；未知选项原文保留。运行输出遵循这些官方运行库，编辑器 Extensions 开关不作为 knitr 或 Pandoc 运行参数。
- 当前没有跨重启会话、持久 Notebook 输出、`.nb.html` 导入/导出、逐语句运行、行级执行指示器、排队调度、调试器或后台自动执行。代码可显式安装或调用的其他语言引擎不在本轮验证范围。
- YAML `output` 原样保留，但应用内运行固定 HTML；不提供 PDF/Word 导出、Shiny、JavaScript htmlwidgets 或 MathJax 结果预览。Markdown Lab 不自动执行 R。
- 不自动复制整个知识库或导入目录到运行目录。相对数据文件、child 文档、外部 bibliography、模板等需用户代码提供可访问路径；临时目录缓存不跨运行保留。

示例：[rmarkdown.Rmd](../fixtures/rmarkdown.Rmd)。验证覆盖代码/元数据原文、CRLF、未知选项、方言边界、导入、真实 R 的顺序变量/行内参数/表格/PNG/中文/错误，以及浏览器中的 pending 输入、显式执行、取消、结果隔离和重开。

2026-09-24 验证记录：本机 R 4.2.2、knitr/rmarkdown、Pandoc 真实执行通过；新增 7 项单元/服务测试和 18 项相关 Chrome 浏览器测试通过，`npm run build` 通过。全量 `npm test` 当次为 661 通过、1 跳过、1 失败；剩余失败为 `block-catalog.test.ts` 中 GFM Unsupported 示例期待 opaque_block、实际 paragraph 的断言。初次浏览器运行遇到并发构建移除共享 dist 的干扰，最终使用 `.run/rmarkdown-dist` 与独立测试输出目录复验通过。运行日志和截图位于 `.run/logs/rmarkdown-*`，测试使用临时知识库。
