# Markdown Lab：外部渲染器、方言与 HTML 输出

2026-09-15，独立页面入口 `/markdown-lab.html`。

主应用现已接入独立的 [原生编辑核心](../architecture/MARKDOWN-ENGINE.md)：三种视图、双向编辑和知识库保存不经过本页的外部程序请求链路。此文仅描述 Lab。

## 当前链路

```text
CodeMirror 源码 + 当前渲染器／方言配置
           ↓ 180ms 防抖
POST /api/markdown/preview
           ↓
libMultiMarkdown / Markdown.pl CLI → HTML 标准输出
或 Pandoc reader → Pandoc JSON AST → 引文处理（citeproc）→ Pandoc HTML writer
或 Notion codec → ProseMirror 文档 → 现有 HTML renderer
           ↓
原始 HTML 文本标签页；清理后页面标签页 + 本地公式渲染
           ↓
右侧只读输出
```

Pandoc AST 与 ProseMirror 文档只在预览请求内存中存在；直接渲染器将标准输出作为 HTML 返回。Lab 不调用知识库的创建、更新或附件接口，不改变当前笔记的 `bodyFormat`；导入只读取用户所选文件，下载只输出编辑器源码。窗口草稿使用 `sessionStorage`，包含源码、文件名、渲染器／方言、各方言的扩展覆盖及滚动开关。关闭窗口后不能将它视为长期备份。

## Pandoc 引文预览

启用 `citations` 的 Pandoc reader 会使用文档 YAML 内的 `references` 运行 citeproc，生成作者年份和参考文献列表。支持括号式、作者式、作者省略、前缀／定位信息／后缀、脚注中的引文，以及 `nocite`、`link-citations`、`link-bibliography`、`reference-section-title`、`suppress-bibliography`、`lang` 和 `notes-after-punctuation`。顶层标题保持顶层，以保留 `.reset-citation-positions` 的语义；同步滚动仍带源码行号。

当前采用 Pandoc 默认作者年份样式；Lab 不加载 YAML 中的外部 `bibliography`、`csl` 或 `citation-abbreviations` 文件，并在预览区提示这一限制。缺失文献数据及 citeproc 诊断也显示在预览区。完整 YAML 和正文始终留在 Source 与下载文件中，关闭 `citations` 后恢复字面量显示，不改写源文件。本项仅调整 Pandoc Lab 预览，不改变主编辑器或官方直出解析器。

可直接打开 [引文测试文档](../fixtures/pandoc-citations.md)，选择 **Pandoc Markdown**。自动验证覆盖实际 citeproc 输出、复杂定位、脚注内引文、参考文献链接、扩展关闭与源码保留。

## 外部程序直出 HTML

2026-09-23 新增 `commonmark-js`、`cmark-gfm`、`php-markdown-extra`，连同下面已有两项共五个官方直出入口。分别运行 [CommonMark.js](https://github.com/commonmark/commonmark.js)、[GitHub cmark-gfm C 实现](https://github.com/github/cmark-gfm)（经 Python cmarkgfm 绑定）、[Michelf PHP Markdown Extra](https://github.com/michelf/php-markdown)；桥接脚本只收发原文/HTML，不替代解析规则。CommonMark.js 随 `npm ci` 安装，固定 0.31.2；PHP/Python 及其库由本机提供。本机为 cmarkgfm 2025.10.22、PHP Markdown Extra 2.0.0。

新增三项同样禁用 Lab 扩展开关，以原生默认规则直出。CommonMark.js 保留 raw HTML；cmark-gfm 使用默认 GFM 扩展和 UNSAFE 输出选项以保留原始 HTML，页面预览仍经清理。没有自动上传源码到 GitHub，也没有将 Typora/Obsidian/Notion 的近似实现列为官方 parser。

新增工具配置（更改后需重启后端）：

| 环境变量 | 用途 |
| --- | --- |
| `MARKDOWN_PYTHON_PATH` | Python 3 可执行文件，未设置时查本地配置/PATH |
| `CMARKGFM_PATH` | cmarkgfm 包目录；可用所选 Python 的 `-m pip install --target <目录> cmarkgfm==2025.10.22` 安装 |
| `PHP_PATH` | PHP 可执行文件 |
| `PHP_MARKDOWN_EXTRA_PATH` | 含 `MarkdownInterface.php`、`Markdown.php`、`MarkdownExtra.php` 的目录；Composer 安装时为 `vendor/michelf/php-markdown/Michelf` |

也可建立忽略文件 `.run/markdown-lab-tools.json`，键为 `python`、`cmarkgfm`、`php`、`phpMarkdownExtra`，值为可信本地绝对路径。环境变量优先；本次已为审计安装写好此配置。未配置库目录时复用 `.run/gfm-renderer` 和 `.run/dialect-audit/tools`。这些临时安装不会随 Git 分发，换机器需安装。服务不会自动联网下载工具；浏览器请求不能指定程序路径。缺失时显示不可用原因，不回退至 Pandoc。

原有 `multimarkdown-cli`、`markdown-pl` 两个直出入口，分别运行 libMultiMarkdown `multimarkdown` 和 Gruber 的 `Markdown.pl`，从标准输入读取源码并返回标准输出。MultiMarkdown 使用 `--snippet --notransclude --to=html`；Markdown.pl 由 Perl 运行，不附加语法选项。它们不消费 Lab 的扩展开关或块插件，相关设置按钮禁用。Pandoc 方言 reader 也调用 Pandoc CLI，但经过 AST 链路并支持该 reader 的扩展开关，所以不再单列 `pandoc-cli` 直出入口。`markdown_mmd` 是 Pandoc 的 reader；独立的 libMultiMarkdown CLI 仍可用于输出对照。

探测只使用服务端环境中的可信安装。`PANDOC_PATH`、`MULTIMARKDOWN_PATH`、`MARKDOWN_PL_PATH`、`PERL_PATH` 可在启动前指定绝对路径；MultiMarkdown 还会从 PATH 和 Windows `Program Files/libMultiMarkdown *` 查找，Perl 从 PATH、Git for Windows、Strawberry Perl 查找。Markdown.pl 的脚本需要用户安装并设置路径。本机目前找到 Pandoc 3.11、libMultiMarkdown 6.7.0 和 Markdown.pl 1.0.1；后者使用 Git for Windows 的 Perl。改变安装或路径后须重启服务。浏览器请求只传固定渲染器 ID，不传程序路径或参数。

HTML 标签页把程序结果作为纯文本展示；页面标签页用 DOMPurify 清理后显示，并禁用页面内输入。直接渲染器没有源码位置，双向滚动按文档进度估算。原始 HTML、页面预览及报错都不会写回 Markdown 或知识库。

## 方言和扩展

完整参考见 [Pandoc 扩展与 Markdown 方言完整对照](../reference/PANDOC-EXTENSIONS.md)，包含手册的 89 个扩展名、八种方言的开关矩阵、默认关闭及非 Markdown 专用项，并说明开关可用与最终预览效果之间的差别。

`src/markdown-lab/model.ts` 注册 `gfm`、`commonmark`、`commonmark_x`、`markdown`、`markdown_mmd`、`markdown_phpextra`、`markdown_strict`、`markdown_github`，覆盖本机 Pandoc 3.11 全部八种 Markdown reader，并单独适配 `notion-markdown` 和 `notdown`；再加五个官方直出入口。方言显示名直接取自主编辑器的 `variant` 注册表，内部 ID 不变。旧版 `markdown_github` 的弃用说明保留在扩展面板。后端先读取 `--list-input-formats`，只查询实际安装 reader 的扩展；界面禁用不可用项，已选正文不被自动切换或重写。旧会话若选过 `pandoc-cli`，恢复源码并改选 `markdown`。请求校验与界面共用这一份注册表。未来 Pandoc 若新增方言 ID，需要补充注册表；测试会对照本机完整 Markdown reader 列表检查遗漏。实验室的选择类型独立于知识库 `BodyFormat`，避免在尚无可用写入 codec 时扩大磁盘格式契约。

本机 `pandoc --list-extensions=<variant>` 提供支持项及默认值。界面允许正负覆盖；后端仅接收布尔值，并对实际支持项校验后构造 `variant+extension-extension`。`sourcepos` 由同步系统使用，不作为用户扩展开关。Notion 作为完整方言呈现，现有的分栏、提示、Tab 子块等保持原语义；暂不宣称这些语法已可逐项开关。

切换方言意味着「用另一套规则预览同一份源码」，不是转换。载入示例和打开文件才会替换编辑器内容，替换进入撤销历史。下载的 `.md` 不自动插入方言元信息，也不承诺 CRLF、BOM 的字节级往返；正文进入 CodeMirror 后使用 LF。

## 历史书签演示（已停用）

旧版 Lab 曾提供「书签卡片」演示；现在 Lab 用于渲染器／方言与 HTML 输出对照，已停用该独立显示插件。已有会话配置中的旧插件 ID 可读取但不执行。下面仅记录历史载体，不是当前语法示例：

````md
```notdown-bookmark
{
  "title": "Pandoc",
  "url": "https://pandoc.org",
  "description": "文档之间的桥梁"
}
```
````

在支持代码围栏的方言中，上述内容本来就是普通代码块，`notdown-bookmark` 只是围栏的信息字符串；停用演示后不再把其中 JSON 解释为卡片，也不需要转成 Unsupported。其他方言按其自身规则解析。当前没有可安装或可启用的 Lab 块插件、动态脚本或 Lua Filter 管理。已有 Notdown 页面书签使用自己的正文格式与编辑路径，不依赖这个旧演示。

## 实时更新和同步滚动

- 输入变化立即作废旧请求；180ms 防抖后执行新请求。合成输入结束后提交预览。页面同时核对请求序号，网络层取消失败也不会接受旧结果。
- GFM / CommonMark / CommonMark X 使用 Pandoc `sourcepos` 原生行号；Notion 复用节点 `sourceStart`。源码行在 CodeMirror 中的位置与渲染块的实际位置构成锚点，两点间线性插值，支持双向同步。
- 根据每个 reader 的扩展列表探测 `sourcepos`，仅在实际支持时添加该参数。当前 `markdown`、`markdown_mmd`、`markdown_phpextra`、`markdown_strict`、`markdown_github` 均没有原生行号。通过块内容和 markdown-it 顶层位置估算，界面明确显示「按块估算同步」。它只用于滚动定位，不参与 Markdown 语义解析。
- 图片加载、布局变化和窗口尺寸变化后读取新几何位置；折叠和分栏中不可见、重排、非单调的位置不作为同步锚点。文档头尾保证可达，复杂重排结构和块内长表格不能逐行精确对应。
- 错误时保留上一份成功的预览，并显示未更新状态和重试入口；期间停止新源码与旧页面之间的位置同步。

## 与 Notdown 编辑器融合的困难

| 位置 | 当前差异 | 融合前需要完成 |
| --- | --- | --- |
| 换行和块结构 | Notion 相邻行是块、Tab 是子块；通用 Markdown 通常将相邻行视为段落软换行 | 页面级方言配置；禁止按内容猜测或自动切换格式 |
| 保存行为 | 现有 ProseMirror 编辑后统一写成 `notion-markdown` | 每种可编辑方言提供 reader/writer，移除强制格式转换；格式转换成为显式操作 |
| 文档表示 | Pandoc AST 包含脚注、定义列表、引文等；现有 PM schema 不覆盖所有节点 | 增加语义节点和编辑交互，或提供可恢复的原文节点；不能默默降级丢失内容 |
| 源码保留 | Pandoc AST 优先表达语义，不保留所有围栏、空白、引用定义形式；原生源码位置只在部分 reader 可用 | 延续原文切片、变更子树识别和未知语法回退，不能每次输入都经 Pandoc 重写全文 |
| 插件停用 | 编辑器 schema 通常固定；删除已存在的节点类型可能使文档失效 | 保留通用插件/原文节点，停用只改变显示和新增入口 |
| 版本和一致性 | Pandoc 升级可能改变默认扩展；多窗口可能有不同配置 | 持久化有效配置或配置版本；渲染、源码、大纲、引用图及导出使用同一份配置 |
| 文件提交 | 实验室没有知识库 revision；现有笔记通过 CAS 保存 | 接入 `createVault`，正文和配置一并使用 `baseRevision` 提交；冲突保留双份，切换前收取 pending 输入 |

先完成源码与预览，让「方言、扩展、插件」获得真实实现；再选择需要结构化编辑的方言逐步扩展 PM schema 和 codec。预览能识别某个语法，不等于已经能在右侧安全编辑并按原方言写回。

## 运行约束和实现位置

后端 `server/pandoc.ts` 使用无 shell 的子进程、固定参数、8 秒超时、16 MB 输出上限和四个进程的并发上限；Pandoc reader/writer 启用 `--sandbox`。不接受浏览器提供可执行文件、Lua reader/filter、模板或任意 CLI 参数。关闭请求时取消在途进程。

`server/app.ts` 中的预览端点共用现有本机 Host、Origin 和 JSON 请求限制。源码限制为 128,000 UTF-16 码元。浏览器对 HTML 做 DOMPurify 清理；通用方言的原始 HTML 样式也被移除。Notion 仅保留现有 schema renderer 生成的受限样式。数学由本地 KaTeX 在清理后渲染，关闭 trust。

主要模块：`src/markdown-lab/main.ts`（双栏与请求生命周期）、`scroll.ts`（位置插值）、`plugins.ts`（停用旧演示的空兼容入口）、`model.ts`（能力契约）。`src/document/document-format.ts` 提供可选源码位置及代码块显示回调，默认调用保持原行为。

参考：[Pandoc 模块化结构](https://pandoc.org/MANUAL.html#description)、[方言](https://pandoc.org/MANUAL.html#markdown-variants)、[扩展](https://pandoc.org/MANUAL.html#extensions)、[CodeMirror](https://codemirror.net/docs/ref/)。

## 2026-09-23 官方解析器接入验证

三个新增入口均在本机通过实际调用。完整单元测试 505 项，504 通过、1 跳过；构建成功。新增检查覆盖各自特有语法、raw HTML 代码与清理预览的分离、取消请求、禁止 Lab 扩展覆盖，以及运行时缺失时返回 503 而不替换解析器。

审计对照页也增加隔离 HTML 渲染预览，合并官方即 Pandoc 的列，隐藏缺失输出。单元与独立 Chrome 测试检查列数、实际标题渲染、代码原文、脚本/外部请求隔离及窄屏布局。Lab 与对照页的 11 项浏览器测试在独立构建目录、独立输出目录、临时知识库下全部通过；首次使用共享 dist 的运行曾受其他构建改写干扰，隔离后复跑通过。日志位于 `.run/logs/markdown-lab-parsers-*.log`。本次没有修改主编辑器解析规则或用户内容。
