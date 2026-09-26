# Quarto 方言与多语言 Notebook

Notdown 的 `quarto` 方言以现有 Pandoc Markdown 编辑能力为基础，识别 Quarto 可执行围栏、行内表达式和代码块选项。`notdown` 集合方言同样启用这些语法。正文仍是 `vault/pages/*.md`，不要求 `.qmd`；导入 `.qmd` 时默认选择 Quarto，原文件及未知字段保留。选择方言不改写旧正文。官方 `notion-markdown`、GFM 和 R Markdown 不因此启用 Quarto 的 Python/Julia/OJS 语法。

这是 Notdown 内的编辑与交互执行集成，不是完整嵌入 Quarto CLI。源码可以交给 Quarto 发布；Notdown 未实现 Quarto 的完整网站/书籍构建、PDF/Word 输出、shortcode/filter 执行、交叉引用编号和项目配置解析。已有 Pandoc 语法按 Notdown 当前能力解释，未知语法原文保留。

Notdown 按块选择独立语言会话；Quarto CLI 通常为整篇文档选择一个主执行引擎，并可结合 OJS。混合 R、Python、Julia 的笔记在外部 Quarto 发布前，需要按其引擎规则配置或拆分，不能假定本文的多会话行为与 Quarto CLI 完全相同。

## 语法与操作

Page 编辑中，**Ctrl/Cmd+Enter** 运行光标所在的可执行 chunk 或 inline；chunk 同时保留 Ctrl/Cmd+Shift+Enter。已求值 inline 支持悬停预览结果。点击代码语言标签或结果打开菜单，用 **Show result / Show code** 切换单个 inline；结果视图隐藏代码和语言标签，代码原文仍由文档保存。全局 **Inline: Code / Results** 切换当前页全部 inline，不触发运行；单个切换后的混合状态显示 Mixed。

仅当页面有可执行 chunk 或 inline 时显示 **Run all**，先按文档顺序运行所有 chunk，再计算所有 inline，并将 inline 切为结果视图。运行时按钮变为 **Stop all**，可取消当前请求及尚未开始的计算；编辑正文、换页或重置会话也取消尚未完成的批次。各项错误就地显示，其余项继续执行。显示模式与结果仅存于当前编辑器，不写回 Markdown；缺失、失败和过期结果有提示。

2026-09-25 本轮控件验证：单元测试 746 通过、5 跳过；构建通过；独立临时知识库与 Chrome 的 35 项相关回归全部通过，包含真实 R/Python/Julia/OJS 的整页运行、悬停与两级显示切换、pending 输入、源码保留、停止与会话释放。修正会话 DELETE 请求的 JSON body，避免释放请求被拒绝后持续占用内核名额。日志 `.run/logs/executable-controls-unit.log`、`executable-controls-final-build.log`、`executable-controls-final-e2e.log`。本轮没有执行全仓库浏览器套件。

````markdown
```{python}
#| label: scores
#| echo: false
scores = [80, 90, 100]
sum(scores) / len(scores)
```

平均分是 `{python} sum(scores) / len(scores)`。

```{julia}
x = [1, 2, 3]
sum(x)
```

```{r}
#| label: r-example
x <- c(1, 2, 3)
mean(x)
```

```{ojs}
//| echo: false
viewof n = Inputs.range([1, 10], {value: 3, step: 1})
square = n * n
```

平方：`{ojs} square`
````

- 围栏使用 `{r}`、`{python}`、`{julia}`、`{ojs}`；普通的 `python`、`r`、`js` 围栏仅显示代码。R 的既有 `{r label, option=value}` 和 `` `r expression` `` 继续可用。
- Python、R、Julia 使用开头连续的 `#|` YAML 选项，OJS 使用 `//|`；未知选项保留。不要把程序中间的注释当成配置。支持反引号与波浪线围栏，原文未变时保持原始围栏与换行。
- `/` 菜单统一为 **Executable Chunk** 和 **Executable Expression**，Chunk 与 inline 插入都直接沿用记忆的语言（首次默认 R），不弹出语言选择；新 Chunk 为空且光标进入代码。点击 Chunk 语言名称才展开下拉列表，支持上下方向键移动、Enter 确认、Escape 关闭和鼠标点击。语言选择在本机记忆；R Markdown 中回退为 R。点击块左上角的语言名称可重新展开；点击 inline 语言名称可选择语言或运行表达式。块内 `Ctrl/Cmd+Shift+Enter` 运行当前块，右上角可运行当前块或它上面的块；inline 内 `Ctrl/Cmd+Enter` 运行。
- 两种对象的语言切换均可撤销，保存后继续使用标准 Markdown 语法。切换只修改语言围栏/行内分隔符，代码内容保持逐字不变，包括注释、空白、`#|` / `//|` 选项前缀；不向代码补入旧 R 头部注释。更换语言后使用该语言的标准围栏，原 R 专属头部选项可通过撤销恢复，程序和选项是否适用于新语言需自行调整。Chunk 与 inline 的语言名称均无展开箭头，仍可点击。旧文件的 R 头部和 inline 分隔符在未切换语言时保持原样。R Markdown 方言的同一选择器仅提供 R。
- 执行前收取待提交的源码/编辑器输入。读取、切换方言、保存或打开页面不自动运行代码。按钮是明确的交互求值：`eval`、`echo`、`include` 等发布选项不禁止求值、不隐藏交互结果；保留这些选项供外部 Quarto 发布。Python/Julia 上方块遇到错误停止，`#| error: true` 可继续下一块。
- 文本、表格、图像放在块下方，行内结果放在表达式附近；可折叠、清除、停止和重启。结果不进入 Markdown、metadata、撤销记录或知识库历史。仅执行节点自身代码、语言或块头选项变化时，其旧结果标为过期；普通正文和其他节点的编辑不触发该提示。撤销回上次执行的源码会清除过期提示。

## 语言与运行环境

2026-09-25 插入与结果修订：Chunk/inline 插入不再弹出语言选择，沿用记忆语言；新 Chunk 光标直接进入空代码。修复普通正文/inline 编辑清空 OJS 共享会话的问题，并以稳定执行对象身份替代文档序号，避免前方插入块后覆盖既有定义。新增浏览器回归覆盖多个 inline 中编辑最后一个表达式、同一事件中收取 pending DOM 输入并立即运行、在已运行定义之前插入新块，以及真实 R/Python/Julia/OJS 分别读取同名变量的独立值。全量单元测试 746 通过、5 跳过，构建通过；相关 Chrome 回归 30 通过，启用本机 Python/IJulia 的四语言联合测试另 1 项通过。日志 `.run/logs/executable-results-*`；测试使用独立临时知识库。

2026-09-25 设置验证：全量单元测试 746 通过、5 个可选环境测试跳过；构建通过。启用本机 Python/IJulia 的 17 项服务集成测试全部通过。浏览器回归 26 通过、1 项 Python 测试随后启用环境补验通过；设置、真实会话重置及 Quarto 的最后 8 项 Chrome 测试全部通过。测试均使用临时知识库，日志 `.run/logs/runtime-settings-*`。

在 **Workspace settings → Code execution** 中配置 **Rscript path、Python path、Julia path**。输入可执行文件路径，不加引号或启动参数；**Check** 检查尚未保存的表单配置，R 检查包与 Pandoc，Python/Julia 实际启动临时 kernel 并显示解释器路径及版本。检查不修改现有会话。保存后重置服务中的 Notebook 会话，下一次执行立即使用新设置，无需重启后端。

**Advanced: Jupyter and Pandoc** 可指定 Python/Julia kernel 名称、Jupyter data directory 和 Pandoc 可执行文件路径。留空沿用下列启动环境变量或自动检测；已有启动值显示在输入框占位提示中。Python 未指定 kernel 名称时使用所选 Python 解释器；显式命名 kernel 时使用其 kernelspec 中的解释器。Julia 路径覆盖已安装 IJulia kernel 的可执行文件，保留启动参数和环境，因此仍需安装 IJulia。OJS 使用内置运行时，无需路径。

配置存于当前知识库的 `.notdown/runtimes.json`，不是正文或页面 metadata，也不是跨知识库全局配置。保存使用知识库原子写入、锁和 `baseRevision`；另一窗口已修改时返回冲突，表单草稿保留，两个版本存入 `.notdown/runtime-conflict-*.json`，不强制覆盖。启动环境变量仍兼容；仅更改环境变量时需重启后端。语言选择器只选择语言。

| 语言 | 执行路径 | 依赖 |
| --- | --- | --- |
| R | 现有持久 R / knitr 会话 | R、rmarkdown、knitr、jsonlite、Pandoc；`NOTDOWN_RSCRIPT` 可指定 Rscript |
| Python | Jupyter 的 Python kernel | Python 3.9+、jupyter_client、ipykernel；推荐 `NOTDOWN_PYTHON` 指向虚拟环境的 Python |
| Julia | Jupyter 的 IJulia kernel | 上述 Jupyter 客户端环境及 Julia/IJulia；Julia 内执行 `using Pkg; Pkg.add("IJulia")`，确保 kernel 安装到客户端可发现的位置 |
| Observable JavaScript | 隔离 iframe 内的 Observable Runtime | 随应用打包的 runtime、stdlib、Inspector、Inputs、Plot 与 Observable 语法解释器；无需 Node/Python kernel |

Python 环境示例：

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install jupyter_client ipykernel matplotlib
$env:NOTDOWN_PYTHON = (Resolve-Path .venv\Scripts\python.exe).Path
npm run dev
```

`NOTDOWN_PYTHON` 也用于连接 Julia kernel，不代表用 Python 执行 Julia。未配置时尝试 Python launcher、PATH、虚拟环境和 Windows 常见 Python 安装位置；不会使用不满足版本要求或缺少 jupyter_client 的环境。多个 kernel 可分别通过 `NOTDOWN_JUPYTER_PYTHON_KERNEL` / `NOTDOWN_JUPYTER_JULIA_KERNEL` 选择，默认按 kernel spec 的 language 匹配。`NOTDOWN_JULIA` 可覆盖 IJulia 的 Julia 可执行文件，`JUPYTER_DATA_DIR` 可指定额外 kernel 数据目录，`PANDOC_PATH` 选择 R Markdown 的 Pandoc。环境缺失会在结果视图显示安装提示。

每个窗口有独立会话；R、Python、Julia 之间不共享变量。单窗口请求串行执行，最多四个 Jupyter kernel 与两个 Quarto R 会话，运行超时 60 秒、空闲 15 分钟后释放。停止执行会结束进程树并重置会话。进程工作目录为独立系统临时目录，不把知识库文件自动交给执行器。本机 R/Python/Julia 程序仍有当前用户的系统权限。

OJS 的所有已运行块共享一个响应式模块，每个块的输出和交互控件直接显示在该块下方，不再打开独立面板。依赖可以先于定义运行；随后定义或滑块变化会重新计算依赖。普通正文或 inline 编辑保留已执行的定义，只有自身源码变化的执行节点显示过期提示。修改代码不会自动执行，手动重跑对应块后更新定义；删除块或切换该块语言移除其 OJS 定义。每个执行对象有独立稳定身份，前方插入其他块不会覆盖已有定义或把结果送给错误对象。重启或离开页面会释放模块。OJS 沙箱只启用脚本，不允许同源权限；运行时不向父应用暴露知识库 API。第三方 HTTPS 模块/数据需网络和 CORS 支持。块内显示使用隔离 DOM 镜像并转发 input/change/click/submit 事件，支持常用 Inputs 控件与静态 Plot；任意自定义键盘/指针事件、文件上传、动画或受跨域限制的 Canvas 尚不保证完整交互。本地 `FileAttachment`、R/Python 的 `ojs_define` 桥接尚未接入。

当前只启用这四种主语言。普通 JavaScript/Node、SQL 和其他 Jupyter kernels 不会因存在某个解释器就自动成为可执行围栏；后续添加语言需要注册语法、kernel 选择与输出契约。暂不支持持久结果缓存、交互式 stdin、ipywidgets、Shiny、调试器和逐语句运行。

## 验证与参考

历史记录（自动展开行为已被当前“插入不弹出”要求替代）：2026-09-25 Chunk 插入交互修订：空块沿用上次语言，插入后展开锚定下拉列表；上下方向键、回车、Escape、点击、重载后的语言记忆及选择后直接输入均经 Chrome 验证。语言切换现在严格保留代码内容，替代此前转换选项注释前缀、插入旧 R 头部注释的行为。Chunk/inline 的展开箭头已移除。`npm test` 741 通过、4 跳过、0 失败；`npm run test:e2e -- tests/e2e/executable-language.spec.ts tests/e2e/quarto.spec.ts tests/e2e/rmarkdown.spec.ts` 构建成功、22 通过、1 跳过（未配置 Python 环境变量），新增交互及相关用例再验 7 项全通过。日志 `.run/logs/chunk-dropdown-*`，界面截图 `.run/logs/chunk-dropdown.png`；测试均使用临时知识库。

本次运行结果和未通过的全量浏览器回归见 [2026-09-25 验证记录](../verification/QUARTO-2026-09-25.md)。

- `tests/unit/quarto.test.ts`：方言隔离、原文往返、编辑后保留、选项边界、导入、请求验证及真实 kernel 的变量/图像/停止/隔离。`NOTDOWN_PYTHON` 启用 Python 实测，额外设置 `NOTDOWN_TEST_JULIA=1` 启用 IJulia 实测。
- `tests/e2e/quarto.spec.ts`：独立临时知识库与 Chrome；交互入口、真实 Python 输出、OJS 响应式控件和沙箱、结果不落盘。
- 官方：[Quarto 语言支持](https://quarto.org/docs/faq/)、[行内代码](https://quarto.org/docs/computations/inline-code.html)、[执行选项](https://quarto.org/docs/computations/execution-options.html)、[Observable JS](https://quarto.org/docs/interactive/ojs/)、[Julia](https://quarto.org/docs/computations/julia.html)。

2026-09-25 块内结果修订：inline R 标签改为 `r`。结果过期按执行节点自身源码判断，覆盖普通正文编辑、只改一个块、撤销及无关编辑期间的异步结果。OJS 移除独立面板，响应式结果与常用 Inputs 控件直接位于各块下方；验证原生键盘调整滑块、跨块更新、折叠、清除、重新运行及隔离权限。全量单元测试 746 通过、5 跳过，构建通过；38 项 Chrome 回归通过，包含真实 R/Python/Julia/OJS 会话。测试使用临时知识库，日志 `.run/logs/ojs-embedded-unit.log`、`.run/logs/ojs-embedded-regression.log`，截图 `.run/logs/quarto-ojs.png`。

