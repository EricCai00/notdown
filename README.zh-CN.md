# Notdown

**R Markdown：** 已支持独立方言、`{r ...}` 代码块、行内 R、`.Rmd` 文件夹导入，以及 **Run R Markdown** 手动执行当前草稿并预览文本、表格和图形。需本机 R、`rmarkdown` 包和 Pandoc，可用 `NOTDOWN_RSCRIPT` 指定 Rscript。每次运行使用新会话，结果不写回笔记；当前只提供静态 HTML，不含持久控制台、Shiny、交互式 widgets 和 PDF/Word 导出。见 [配置与使用边界](docs/features/R-MARKDOWN.md)。

以本地 Markdown 文件为基础，结合块编辑与页面组织的笔记应用。

[English](README.md) · **简体中文**

Notdown 将透明的 Markdown 文件与结构化编辑体验结合起来。编辑器使用单一 ProseMirror 文档和自有 Markdown codec；通用页面属性集中写入知识库的 `metadata.json`，笔记始终保存在本地 Markdown 文件中。文档内 YAML 和 Pandoc title block 覆盖 JSON 默认值，源码模式显示完整文件，不再隐藏应用头部。

**项目状态：** 持续开发中的本地应用原型。已实现版本校验和可恢复的冲突副本；尚未实现协作与跨端同步。应用界面目前仅提供英文。

[快速开始](#快速开始) · [主要功能](#主要功能) · [格式与存储](#格式与存储) · [当前限制](#当前限制) · [开发](#开发) · [文档](#文档)

## 快速开始

### Windows 桌面版

启动后可选择 **Create new vault**（新建知识库）、**Open existing vault**（打开已有知识库）或最近使用的目录。新建时选择空文件夹；打开时选择包含 `pages/` 的 Notdown 知识库，然后用 **New page** 开始写作。**Open another vault** 会先保存当前页，再用独立窗口打开另一个知识库。关闭编辑窗口也会收取待提交输入；保存失败或冲突时窗口保持打开。

从源码构建并运行：

```sh
npm ci
npm run desktop
```

运行 `npm run desktop:dist` 生成 Windows x64 安装包 `.run/desktop-release/Notdown-Setup-0.1.0-x64.exe`。安装后无需 Node.js 或开发终端。目前为未签名的本地构建，尚无自动更新及 macOS/Linux 安装包。

导入已有 Markdown：选择 **Import Markdown folder**，选择方言及文件夹，检查预览后点击 **Import copies**。文件夹层级、标准 Markdown 相对链接和附件会导入；源文件不变，并在目标知识库中额外归档原件。每批最多 500 个文件 / 20 MB；Wiki 链接、HTML 引用及页内锚点需要检查。详见[桌面版与文件夹导入边界](docs/features/DESKTOP-AND-IMPORT.md)。

### 环境要求

- Node.js 24 和 npm。
- 现代浏览器；浏览器测试需要本机安装 Google Chrome。
- Pandoc 为可选依赖，日常编辑无需安装。

在仓库目录运行：

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:4317](http://127.0.0.1:4317)。本地知识库 API 地址为 `http://127.0.0.1:4318`。关闭终端会停止开发服务。

Windows 用户安装依赖后，也可以双击 [`start.cmd`](start.cmd)。它在后台启动服务，检查就绪后打开浏览器，日志写入 `.run/logs/`。

后台服务的后端代码或环境变量变更后，先保存当前编辑，再在仓库目录的 PowerShell 运行 `.\start.cmd -Restart`。脚本会核对 4318 端口的进程、沿用当前知识库路径、重启后端并复用前端；当前终端没有 `MARKDOWN_PL_PATH` 时会读取用户级设置。如果使用 `npm run dev` 启动，则在原终端按 Ctrl+C，再运行 `npm run dev`。

### 选择知识库

默认知识库为 `./vault`。如需使用其他目录，在启动服务前设置 `VAULT_PATH`。例如 PowerShell：

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

仅首次启动新建的默认知识库时创建示例笔记；已有知识库和显式配置的目录不会自动填充。已有 Notdown 页面需要有效元信息；普通 Markdown 文件夹可通过 **Import Markdown folder** 复制导入。

### 在本地运行生产构建

```sh
npm run build
npm start
```

打开 [http://127.0.0.1:4318](http://127.0.0.1:4318)，该地址同时提供构建后的应用与 API。同一知识库仅使用一个本地服务进程。独立浏览器服务没有认证；桌面版使用隔离的本地服务及服务访问令牌，但两种模式均未实现跨进程知识库锁。不要同时通过桌面版与另一个浏览器服务打开同一知识库。

## 主要功能

引文定义、图片题注、行内对象插入与属性、链接和公式使用无灰色遮罩的轻量编辑面板。打开期间可以继续滚动页面；Save/Apply 提交修改，Cancel、关闭按钮或面板内的 Escape 放弃修改。目标内容变化时拒绝旧编辑。较大的设置与确认窗口仍使用模态对话框。

页面和双栏视图中，点击正文下方空白区域会新增一个空块；正文末尾已有空块时只聚焦它。即使后面有脚注或参考文献，连续点击也不会重复新增空块。

页面提及、Wiki 链接和 Markdown 内链共用引用模型，在 Block Explorer 中统一为 **Internal link**。`/` 菜单提供 **Page link（页面链接）** 和 **Location link（位置链接）**；位置链接可指向本页或其他页的标题、已有 Obsidian 块／列表项 ID 和锚点。保留显式显示文字与原始语法，导航和反向链接共用目标解析。暂不自动生成缺失的块 ID，未实现完整 Obsidian 路径／别名索引及重命名修复。详见[页面与位置链接](docs/features/INTERNAL-REFERENCES.md)。

具体能力取决于页面方言及已启用的扩展。

启用 `alerts` 后，支持此扩展的方言继续识别基础 `> [!NOTE]` 提示块。折叠标记 `+` / `-` 与同行自定义标题属于 Obsidian 语法，仅 Obsidian 和 Notdown 集合方言接受；其他方言将这些写法保留为普通引用内容。

Notdown 的 Markdown blocks 分组或 `/github` 中选择 **GitHub-style Alert** 后直接插入 Note，不弹出窗口。点击图标可从包含图标、颜色和名称的菜单选择类型，后续也可修改。标题在页面上直接编辑；图标菜单中的 **Collapsible** 启用折叠，标题后的空心箭头向右表示收起、向下表示展开。Obsidian 和 Notdown 支持 Obsidian 全部 27 个内置关键词及别名。Notdown 保留五种 GitHub 配色，新增关键词采用 Obsidian 配色；Obsidian 方言全部采用其官方配色。其他启用 alerts 的方言保留五种基础类型，不启用扩展标题、折叠或关键词。HTML 导出保留外观。原有 **Callout** 入口继续插入 Notion 提示块。

Notdown 方言支持同时设置行内文字色和背景色：`<span color="red" bg_color="yellow">文字</span>`。颜色菜单可独立修改或清除两个通道；旧 `color="yellow_bg"` 继续兼容。两者沿用现有命名色板，HTML 输出也显示双颜色。该行内扩展不在官方 Notion 方言启用，详见[格式契约](docs/FORMAT.md)。

Notdown 默认启用 **Symbol replacements** 输入插件：`->` → →、`<-` → ←、`<->` → ↔、`=>` → ⇒、`<=>` → ⇔、`<=` → ≤、`>=` → ≥、`!=` → ≠、`+/-` → ±、`...` → …、`(c)` → ©、`(r)` → ®、`(tm)` → ™。通过 `syntax.extensions.symbol_replacements: false` 关闭。仅 Notdown 方言的可视正文新输入生效，保留格式并避开代码与链接；立即退格撤回上一步替换，加载、粘贴和源码编辑不变。这是本地规则集，不宣称完整复刻 Notion 快捷输入。[详细规则与边界](docs/features/SYMBOL-REPLACEMENTS.md)。

页面启用 `emoji` 扩展时，在可视正文输入空格后接 `:sm` 会弹出随输入筛选的 emoji 网格，名称与 Markdown 解析器支持的短码一致。可用鼠标或方向键选择，Enter / Tab 确认，Escape 关闭；选中后插入 Unicode 字符，保留格式并支持撤销。代码、链接、转义冒号、不支持的方言或已关闭的 emoji 扩展不触发；源码编辑尚无此菜单。

| 领域 | 当前已实现 |
| --- | --- |
| 桌面与首次使用 | Windows 安装包、原生知识库目录选择、最近使用记录、独立知识库窗口、关闭前保存，以及带预览和原件归档的 Markdown 文件夹导入。 |
| 编辑 | 页面、源码、双栏视图共用草稿和撤销历史；斜杠命令、行内格式、嵌套列表、块选择与拖动。平级落点显示当前层级全长淡蓝线，子级落点叠加缩进的深蓝线；列表提示覆盖标记栏，并与实际子树插入边界对齐。同一插入位置的“上一块之后／下一块之前”共用间隙中央的一条提示线，列表边界也保持一致。所有行内 mark（代码、颜色／背景、强调、链接、原生 span 等）都有明确的内外输入状态。有 padding 的边界会将光标显示在内侧文字或外侧相邻文字旁，无 padding 的格式保留原生光标。在行内代码中输入时不显示轮廓框。 |
| 页面组织 | 父子页面，页面底部 Child page 列表可收起／展开（不超过 5 个默认展开，超过 5 个默认收起；本次使用期间保留手动选择）、侧栏排序、收藏、搜索、反向链接、页面引用，以及回收站和恢复。侧栏标题充分使用行内可用宽度，操作按钮仅在悬停或键盘聚焦时占用空间。有子页面的条目在悬停或键盘聚焦时用展开箭头替换图标，鼠标点击后移开即恢复图标（触屏常显箭头），子页面每级缩进 10px。 |
| 视图与阅读 | 知识库画廊、属性列表、树和力导向关系图（节点拖动、平移缩放、邻接高亮、力度调节）；页面大纲、思维导图、标题折叠与固定在可视区域垂直中部的阅读目录。 |
| Markdown 内容 | 多种方言预设、87 项 Notion 与 17 项 Custom 代码语言及本地高亮、KaTeX 公式、Mermaid 图表、引文、表格和元数据编辑。脚注支持输入正文或复用已有定义、悬浮预览、底部多块编辑，以及页面编辑中删除最后一个引用时同步清理定义并可撤销。导入时已有的未引用定义继续保留；源码编辑保留显式定义。见[脚注边界](docs/features/FOOTNOTES.md)。 |
| 页面外观 | 添加或更换页面图标时，可搜索选择 Unicode Emoji 与内置完整 Lucide 图标库；Lucide 图标在侧栏、面包屑和页面引用中一致显示。保留 Emoji 显示风格与最近使用；仅在缺少图标或封面时显示 Add icon / Add cover；有图标、无封面时在图标下方保留紧凑操作栏，显示或隐藏按钮不改变标题位置；图标悬停背景完整包住字形且不与封面按钮重叠。内置与上传封面可通过横幅工具栏更换、调整位置；工具栏在鼠标悬停封面或键盘聚焦时显示（触屏和调整位置期间常显）；支持 YAML 属性编辑。 |
| Notdown 扩展 | Tabs、书签、链接预览、面包屑、本地按钮、HTML 文档和网页嵌入。 |
| 联系人与日期 | 本地联系人及人物提及；日期编辑，以及 Notdown 方言下应用运行期间的提醒。 |
| 文件与导出 | 本地附件、图片与媒体播放、单页 HTML 导出及 MyBase 元数据导出。 |
| 本地数据保护 | 带版本校验的保存、历史快照、外部修改检测，以及可恢复的冲突副本和显式合并。冲突对比与实时合并预览采用 Git 风格的红绿逐行差异，默认折叠未变化的内容，并可展开完整 Markdown 编辑。 |
| 集成 | stdio MCP 桥接；可选的 GitHub、OneDrive / SharePoint 预览；可配置的文本生成与转录服务。 |

代码块采用一致且更紧凑的上下内边距和更小的工具栏；工具栏仅在鼠标悬停代码块或键盘聚焦按钮时显示（触屏常显）。

代码语言菜单分为 **Notion（87 项）** 与 **Custom（17 项）**，搜索统一匹配名称和别名并保留分组。多数语言使用 Prism；Lean、Wenyan、sed 通过 Shiki 复用 TextMate 语法；GNU Octave 扩展 MATLAB 规则，易语言提供本地基础词法高亮。Custom 还包括 SPARQL、Vimscript、Regular Expression 和 Excel Formula；Makefile 保留在 Notion。ASCII Art 与 Plain Text 保持原色；Mathematica 显示名改为 **Wolfram Language**，兼容旧围栏 ID。Mermaid 保持归入 Diagram。高亮不执行代码或验证证明；未知语法和超过 32,000 个 UTF-16 代码单元的块保留可编辑纯文本。[语言来源、别名及边界](docs/features/CODE-LANGUAGES.md)。

Raw Source 不再作为独立内容对象或插入命令。`{=html}` 与 HTML block / Inline HTML 共用预览和源码编辑，保留原有围栏或反引号编码。其他 raw 格式（含 TeX 和 MultiMarkdown 通配符）归入 **Unsupported**，原文可恢复、可编辑，不提供目标格式渲染或转换。`raw_attribute`、`raw_tex` 开关与方言默认值保留；`raw_tex` 仍列在 **Outside Markdown scope**。

Div 容器不显示边框和属性文字；内部不增加缩进或内边距；整组控件比普通子块控件向外多移 48px，子块保留独立的添加、菜单和拖动控件。HTML 与围栏两种 Div 写法均保留原属性和编码。

块 handle 菜单新增 **View source（查看源码）**：以只读弹窗显示当前块及其子内容的 Markdown 源码快照，支持复制。沿用页面方言和可用的块原文保留规则；已编辑或嵌套块可能使用规范化语法。查看不会修改正文。

行块与普通段落的字体和对齐一致，无引用边线和额外缩进；内部换行只保留正常行高，不叠加段落间距，块间距保持不变。Enter 在块内换行，空行上再按 Enter 退出到普通段落，并保留后续已有行。启用行块时，单独的竖线行保留为行块中的空行；MultiMarkdown 表格必须有包含横线或等号的非空分隔行。页面和双栏视图中的表格，表头与正文单元格使用一致的网格边框、内边距和列对齐；默认左对齐，保留 Markdown 显式指定的左／中／右对齐。复杂表格、图表、混合 HTML 等部分结构采用预览配合源码编辑。列出某项能力，不代表完整可视化编辑或与所有上游格式完全兼容。

逐行块编辑保存时保留空行，关闭的转义规则不会插入替换占位文本。历史上已保存的占位文本不会自动改写。

Block comment 和 Inline comment 在页面视图中隐藏，不显示占位或源码按钮。启用 comments 扩展时，通过 `/` → **Block comment** 或 **Inline comment** 弹出窗格输入；已有注释可在 Source 视图编辑。保存沿用现有 `%%` 语法，CriticMarkup 注释也隐藏显示。

HTML block 在悬停或键盘聚焦时于右上角浮现 `</>` 源码按钮，不预留工具栏行。点击展开带行号、HTML 高亮的内嵌源码窗格，支持实时预览和共享撤销／重做；Escape 收起窗格。Raw HTML 的原有围栏仍可编辑并保留。

### 常用操作

右上角 **Open source file** 菜单可在新浏览器标签页显示完整磁盘 Markdown（含 YAML）、用系统默认应用打开，或复制绝对路径。打开前先保存待提交输入，保存失败或冲突时停止；复制路径无需保存。默认应用打开依赖本机桌面环境及 Markdown 文件关联，不可用时显示错误。

| 操作 | 方式 |
| --- | --- |
| 搜索页面 | `Ctrl+P`；正文编辑器外也可使用 `Ctrl+K`。 |
| 切换页面／源码 | `Ctrl+E` |
| 立即保存 | `Ctrl+S` |
| 插入内容 | 正文输入 `/`，或点击块旁的 `+`。 |
| 移动或管理块 | 拖动或点击六点手柄。 |
| 调整列表层级 | `Tab` / `Shift+Tab` |
| 退出行内格式 | 在格式末尾按一次 `→`，原地切换为外侧输入，行中、行尾一致，不插入空格；按 `←` 可重新进入。格式起点反向操作。嵌套时保留跨越该边界的格式，同时结束的格式一起退出；相邻不同格式之间可输入仅保留共有格式的文字。闭合反引号后自动退出代码，修饰方向键保留原有导航。 |

切换视图前会收取待处理输入。源码定位与双栏滚动按块映射；复杂或经过重排的内容不保证逐字符对应。

源码与页面的联动投影、阅读目录在停止输入 500ms 后刷新，等待期间页面不再变暗。输入与本地草稿即时更新；切换视图或保存会收取待处理输入。相邻输入或删除在一秒内合并为一次撤销/重做，文末有换行也不会逐字拆分；不同位置的修改及换行另起一步。这是按停顿合并，不是语言分词。

Source 和 Split 使用较宽的编辑区域，带封面的页面也一样；Page 视图保持阅读宽度。

Source 和 Split 与 Markdown Lab 共用语法配色，代码围栏支持 JavaScript、TypeScript、JSON、HTML 和 YAML 高亮。点击行号旁的箭头可折叠标题章节或多行 Markdown 块（包括代码围栏、引用、列表项和表格），点击箭头或 `…` 展开。`Ctrl+Shift+[` / `Ctrl+Shift+]` 折叠／展开当前位置，`Ctrl+Alt+[` / `Ctrl+Alt+]` 全部折叠／展开。折叠仅保留在当前打开的编辑器中，不改变保存的 Markdown。高亮与折叠使用通用 Markdown 语法，并非所有方言专属结构都有独立支持。 折叠箭头沿用 Markdown Lab 的小号浅灰样式，悬停时略微加深。

侧栏与正文分栏的宽度拖动使用带描边的 SVG 调整大小光标，并保留系统光标作为后备。

Page tree 默认显示前三层（根页面算第一层）。点击分支箭头，或聚焦该行后按 Enter／Space，可展开、收起；点击标题打开页面。当前应用会话内切换视图会保留展开状态，刷新后恢复默认。

关系图：拖动节点时关联节点会跟随调整，松开后逐渐稳定；拖动空白处平移，滚轮缩放，单击节点打开页面。鼠标悬停圆点时高亮关联，悬停标题不触发高亮。**Fit graph** 适配全图，**Graph settings** 调整力度、标签和箭头。画布获得焦点后可用方向键平移、`+` / `-` 缩放、`0` 适配；Tab 聚焦节点后按 Enter 打开。系统减少动态效果模式下，布局直接稳定而不自动播放动画。实线箭头为引用页 → 目标页，包含块形式的 **Link to page** 与行内页面引用；虚线箭头为父页 → 子页。同一对页面的正文引用与层级关系分别保留。目前图谱覆盖已有页面、页面链接和父子关系；尚未实现附件／未创建目标节点、颜色分组、布局保存及 Obsidian 的完整筛选功能。

## 格式与存储

### Markdown 方言

预设包括 Notdown、Notion-flavored Markdown、Typora、Obsidian、CommonMark、GFM、Pandoc Markdown、CommonMark X、Original Markdown、PHP Markdown Extra、MultiMarkdown 和旧 GitHub Markdown。

GFM 已覆盖规范五类扩展，补齐单／双波浪删除线、裸自动链接（含 `mailto:`／`xmpp:`）、任务标记空白、语义表头和 HTML tagfilter。全部 677 个公开示例均有语法、编辑器 schema、未编辑原文和安全导出回归；其中 9 个继承示例的扩展叠加差异单独记录。编辑松散列表、表格内换行后保留语义；跨 Markdown 段落的 HTML 容器提供合并源码编辑与安全预览。GitHub 仓库／账号集成功能不属于 GFM 语法规范，可选扩展与 HTML 安全过滤仍有独立边界。详见 [GFM 核查](docs/audits/GFM-CONFORMANCE-2026-09-24.md)。

页面语法配置保存在 `metadata.json` 对应页面的 `syntax` 字段中，文档内 YAML 可覆盖它。切换方言会重新解释同一份源码，不会迁移整个知识库。

Obsidian 方言默认不开启 Notion 扩展，仍可手动启用支持的可选扩展；已有源码保留。

编辑器的 **Extensions** 面板支持按名称、ID 和说明即时搜索，并显示匹配数量。切换编辑视图、调整侧栏宽度或工具栏换行时，面板跟随按钮定位，水平方向保持在窗口内。搜索只筛选列表；切换扩展开关或重置默认值时才会修改扩展设置。

- **Notdown** 集合已支持的 Markdown 方言能力与 Notion 内容。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、块属性、inline 和 style；已有方言能够表达时，复用其语法。
- **`notion-markdown`** 仅启用官方 Enhanced Markdown 定义的语法。Notdown 补充编码仅限 `syntax.variant: notdown`，显式扩展开关也不能越过此边界。
- Notion 图片按独立媒体块处理；行内图片与自动链接保留为字面文本。普通链接和页面提及可用，Wiki 源码与自动标题 slug 不启用；无文档依据的结构保留源码，不静默转换。已核查范围与剩余缺口见 [Notion 边界审计](docs/audits/NOTION-BOUNDARY-2026-09-24.md)。
- 未知语法、旧内容和未知字段保留以供恢复。未编辑内容在支持范围内复用原文；编辑过的结构可能规范化空白或标记，不承诺任意输入都能逐字节往返。

详见[格式契约](docs/FORMAT.md)、[方言符合性](docs/reference/DIALECT-CONFORMANCE.md)与[当前语法边界](docs/audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

### 知识库结构与保存

```text
vault/
  pages/*.md          完整 Markdown 源文件
  metadata.json       通用页面属性（文档 YAML / Pandoc 可覆盖）
  people/*.yaml       本地联系人
  assets/             上传附件
  .history/           页面快照与冲突副本
  .notdown/           本地集成设置
```

Markdown 文件是正文真相，不是缓存的块 JSON。普通 Markdown 无需应用 YAML；未登记文件从文件名推导标题与身份。旧应用 YAML 可通过显式迁移命令整体移入统一 JSON，先备份所有原文件，再仅删除应用头部；正文自己的 YAML / Pandoc 覆盖块保留。损坏的 JSON、YAML 或重复 ID 会阻止写入，保留原文件。迁移命令、覆盖顺序、历史及中断恢复见 [Vault metadata 契约](docs/features/VAULT-METADATA.md)。

所有更新经由 `createVault`，并使用 `baseRevision`。版本过期时保留两份可恢复内容，不会静默强制重试覆盖。外部刷新不会替换未保存正文，浏览器草稿按窗口隔离；关闭窗口后，未保存草稿不构成完整的恢复机制。

可选集成的凭据保存在本地 `.notdown/` 中，与页面 Markdown 分开。调用已配置的生成或转录功能时，相应文字或音频会发送给所配置的服务。

## 当前限制

引文、缩写、术语、元数据变量和 CriticMarkup 修订提供按方言显示的插入表单；MMD 引文有独立于脚注的书目编号、返回链接和定义编辑。脚注引用直接跳到对应定义，重复引用各有返回按钮。脚注和引文返回箭头使用固定 SVG，不受图标字体影响；待办复选框仅在键盘导航时显示焦点外框。图片题注可编辑；表格支持矩形/行列选区、TSV 复制粘贴、行列移动及选区合并。复用既有扩展和编码，Notdown 默认汇集，其他方言不可强制开启不属于自己的语法。见[方言归属与操作边界](docs/features/INLINE-OBJECTS.md)。

- **尚无协作或跨端同步。** 本地版本校验和冲突副本不是同步服务；本地同步块不连接 Notion 云端同步。
- **尚无 Notion 数据库、工作区成员、权限或完整云端自动化。** People 是本地联系人，不是用户账号；提及不发送通知。
- **格式兼容仍有边界。** 未实现所有上游规则及扩展组合；表格矩阵粘贴要求匹配选区尺寸，合并受目标编码约束；任意块嵌套、跨页面拖动仍不完善。
- **提醒依赖应用运行。** 不提供关闭应用后的系统调度、邮件提醒或重复提醒。
- **导入导出范围有限。** HTML 仅导出单页，附件保留相对链接，不打包整个知识库。文件夹导入创建具有新页面身份的副本，不直接编辑原文件夹，也不代表完整迁移 Obsidian/Notion 工作区；尚无历史回滚界面。
- **仍需进一步交互验收：** 系统级中文 IME、触控、无障碍和大文档。Windows 桌面构建尚未签名；自动更新、macOS/Linux 安装包与离线移动端属于后续工作。

## 开发

项目使用 TypeScript，包含 Vite 前端和本地 Node 服务；ProseMirror 负责正文编辑，CodeMirror 负责源码编辑。

```text
src/          应用、文档 codec、编辑器、块、功能与集成
server/       Markdown 知识库、HTTP API 与 MCP 桥接
tests/unit/   模型、格式、服务与协议测试
tests/e2e/    独立 Chrome 浏览器测试
docs/         架构、契约、参考与历史记录
scripts/      启动与维护脚本
public/       静态资源
.run/logs/    本地执行日志（不入库）
```

开发入口和文件归属见[仓库组织约定](docs/architecture/REPOSITORY.md)。`vault/` 是用户数据，不能作为测试样本目录。

### 验证

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

单元与服务测试使用临时知识库。浏览器测试使用独立无界面 Chrome 和临时知识库，不连接用户浏览器。报告与 trace 写入 `test-results/`。

并行运行浏览器测试时，使用独立构建目录和端口。例如 PowerShell：

```powershell
npm run build -- --outDir .run/e2e-dist
$env:NOTDOWN_E2E_PORT = '4330'
$env:NOTDOWN_E2E_FRONTEND_DIR = '.run/e2e-dist'
npx playwright test --output test-results/e2e-isolated --reporter=list
```

### 工具与集成

- **Block Explorer：** 打开 [`/block-catalog.html`](http://127.0.0.1:4317/block-catalog.html)，或从侧栏进入，查看内容对象、方言、语法示例及扩展来源。
- **Markdown Lab：** 打开 [`/markdown-lab.html`](http://127.0.0.1:4317/markdown-lab.html)，对照源码与渲染输出。已有 Pandoc readers、MultiMarkdown、Markdown.pl，现增加官方 CommonMark.js、cmark-gfm、PHP Markdown Extra；后两者需本地 Python/cmarkgfm 与 PHP/Markdown Extra，缺失时禁用入口，不替换为其他解析器。Lab 独立于知识库自动保存。配置见 [Lab 指南](docs/features/MARKDOWN-LAB.md)。
- **MCP：** 先启动本地 API，再从仓库目录运行 `npm run mcp`。桥接使用 stdio，默认 `NOTE_API_URL=http://127.0.0.1:4318`。各客户端启动配置不同；更新必须使用读取返回的 revision。见 [API 参考](docs/reference/API.md)。
- **MyBase：** 导出当前页面的元数据，使用稳定 UUID 身份和明确的数据类型，不自动写入 MyBase 主库。见[集成契约](docs/reference/MYBASE.md)。

## 文档

详细文档目前以中文为主。

| 入口 | 内容 |
| --- | --- |
| [文档导航](docs/README.md) | 全部架构、功能、参考和验证文档。 |
| [格式契约](docs/FORMAT.md) | Markdown、元数据、原文保留与序列化规则。 |
| [仓库组织约定](docs/architecture/REPOSITORY.md) | 开发入口与文件归属。 |
| [Notdown 内容范围](docs/reference/NOTDOWN-SUPERSET.md) | 已支持的内容与格式边界。 |
| [People](docs/features/PEOPLE.md) / [链接预览](docs/features/LINK-PREVIEWS.md) | 本地联系人与外部预览行为。 |
| [验证记录](docs/verification/VERIFICATION.md) | 按日期记录的验证证据，不代表当前完整覆盖。 |
| [旧版 README — 2026-09-23](docs/archive/README-2026-09-23.zh-CN.md) | 历史细节，包含已被后续修订覆盖的实现说明。 |

## 致谢

本地存储设计参考思源，块交互参考 AFFiNE 和 AppFlowy。Notdown 是独立实现，不是这些应用的完整 fork。

项目使用 ProseMirror、CodeMirror、markdown-it、Lucide、KaTeX、Mermaid 等依赖，遵循各自许可。可选的 Pandoc 渲染调用单独安装的可执行文件。内置 emoji 字体保留许可说明：[Noto — SIL OFL 1.1](src/assets/fonts/LICENSE-Noto.txt) 与 [OpenMoji — CC BY-SA 4.0](src/assets/fonts/LICENSE-OpenMoji.txt)。
