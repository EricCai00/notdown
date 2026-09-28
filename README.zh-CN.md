# Notdown

插入命令使用空白块正文和表格单元格。行内格式作用于选中文字或接下来输入的文字；源码模式包裹选区并将光标放在语法内部。必须提供内容的命令（如行内公式、可执行表达式和定义列表）打开空白输入框，不插入示例文字。已有笔记和目录示例不变。

HTML 上传会先验证返回的附件路径，再更新正文块。旧后台返回 `.bin` 时保留上传草稿并提示重启；HTML 预览需要当前后台按 HTML 内容返回，不能按下载附件返回。

在 Page 视图删除 child page 块会先弹出确认，确认后将对应本地页面及其后代移入 Trash。多选删除只显示一个窗口，列出首个页面名称及不同 child page 的总数；取消保留块和页面，操作失败或版本冲突时保留正文块。删除普通页面链接、编辑 Source 不会把页面移入回收站。编辑器撤销仅恢复正文，页面需在 Trash 中恢复。

官方 `<page>` 表示 Child page；Notdown 补充 `<page-link>` 表示 Link to page，包括指向直接子页的链接；`<mention-page>` 保持行内提及。块类型由标签确定，不按页面归属推断。新入口不写 `role`，旧属性原文保留；解析不会移动页面。

HTML embed 与 Web embed 分别提供插入入口和替换流程，底层共享嵌入节点。HTML embed 上传／拖放文件到 `vault/assets/*.html`，正文使用 `<embed src="assets/…html">说明</embed>`；Web embed 仅接受 HTTP(S) 网址，在 Notdown 中使用 `<web-embed url="…"/>`。已有 `web-embed` HTML 附件引用保留原编码。本地 HTML 预览禁用脚本。旧内联正文 `html-embed` 标签仍已退役，显式迁移脚本通过知识库 CAS API 提取旧正文并保留可恢复历史。Typora 保留 iframe 原生编码。尚不导入 HTML 相对资源，也不下载 Notion HTML 文件。

HTML 嵌入有文件名头部、全屏／更多按钮、带边框预览和 Interact 遮罩；菜单提供替换文件、下载、转为 File、说明、对齐及 More options 子菜单。网页嵌入可直接交互，使用对齐／说明／打开／更多悬浮工具栏及侧边缩放柄；菜单提供替换网址、全屏、打开网页和复制原始链接，不混入 HTML 文件操作。居中嵌入在鼠标／键盘缩放期间及重新加载后保持居中。Notdown 可为原生 HTML `embed` 添加 title/width/height/align 属性，网页 `web-embed` 使用已有说明／布局属性；`notion-markdown` 仅启用官方 HTML embed 语法及说明，不启用这些布局扩展。Typora 缩放保留 iframe 原生尺寸。已有锚点时提供块链接；嵌入菜单尚未实现 Notion 评论、建议修改、AI 操作和跨页面移动。远端网站仍可能限制嵌入或下载。

行内页面链接与 Link to page 块共用带引用箭头的页面图标、半粗体下划线标题及悬停样式，并保持行内排版。

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

同步块采用 Notion 风格的悬停／聚焦边框与右上浮动工具栏，提供同步页面列表、**Copy synced block** 和 **Unsync**。在 Notdown 方言中，可将单块或连续多选块转换为同步块，复制后粘贴到另一 Notdown 页面。新引用会携带来源版本自动提交编辑，并在编辑器打开时刷新未修改副本；同页副本通过一次可撤销事务联动。冲突暂停同步并保留双方内容。旧快照仍通过菜单中的 **Refresh from source / Publish to source** 手动操作。取消副本同步保留正文；取消原始块同步前需先解除其副本。未打开页面的 Markdown 保留上次快照，打开后刷新。尚不支持 Notion 云端联动、跨设备同步或跨页批量取消同步。见[同步块说明](docs/features/SYNCED-BLOCKS.md)。

页面跳转复用最新页面列表中的完整正文，避免再次读取目标页；反向链接复用正文和方言未变化时的解析结果，页面名称或别名变化后重新解析；侧栏渲染先建立父子索引，跳转和保存正文时保留未变化的侧栏节点；图标刷新只替换新增或改名的图标。跳转仍会读取知识库并保存待处理输入，大型知识库和超长单页仍可能有加载延迟。

AI block 提供 Notion 风格的行内配置面板：**Custom output / Page summary / Key points**、提示词 @ 提及、当前页面或指定上下文、可移除的上下文标签，以及 **Done / Settings / Generate**。AI 与会议笔记正文继承页面排版，标题、控件与间距采用统一紧凑的层级。生成后的正文显示在描边卡片中，右上角提供点赞／点踩、Settings 和 Generate；反馈仅在当前会话内标记。Page summary / Key points 显示固定说明并使用当前页，切回 Custom output 恢复自定义配置。提及使用本地页面、联系人和日期。**Search → Local vault** 最多补充 5 个标题匹配提示词的本地页面；**Selected context only** 仅使用指定引用。生成调用已配置的兼容服务，返回内容按当前方言渲染 Markdown；生成期间文档有变化时，结果单独保留，不覆盖新编辑。配置即时通过文档事务和既有 CAS 链路保存；旧提示词、模型覆盖与未知字段保留。尚未连接 Notion 工作区搜索、成员、邀请、提醒或自动后台生成。详见 [AI block 格式与交互](docs/features/AI-BLOCKS.md)。

### 可执行 Notebook

可执行 Notebook 控件：在 Page 编辑中按 **Ctrl/Cmd+Enter** 运行当前 chunk 或 inline。已运行的 inline 悬停可查看结果；点击语言标签或结果，在菜单中切换该 inline 的代码／结果视图，结果视图不显示语言标签。页面存在可执行 chunk 或 inline 时显示 **Run all**，先按文档顺序运行所有 chunk，再计算 inline，并将所有 inline 切到结果视图。**Inline: Code / Results** 全局切换当前页所有 inline 的显示，不执行代码；单独切换导致混合视图时显示 Mixed。结果和显示选择仅保留在当前打开的编辑器中，不写入 Markdown；未运行、失败和过期结果均有提示。

**Quarto：** 新增 Quarto 方言，Notdown 方言也支持 R、Python、Julia、Observable JavaScript 的可执行围栏和行内表达式，文件仍用 `.md`。Python/Julia 连接本机 Jupyter kernel，R 复用 knitr，OJS 的响应式输出、Inputs 和 Plot 直接显示在对应块下方的隔离区域。`/` 菜单统一为 **Executable Chunk** 与 **Executable Expression**。Chunk 与 inline 插入时直接沿用记忆的语言，不弹出语言选择；新 Chunk 内容为空，光标直接进入代码。点击语言名称才展开选择器，Chunk 下拉列表支持上下方向键、回车及点击。OJS 块与 inline 共享最近执行的定义，编辑正文不清空会话；修改代码后手动重跑更新。仅自身代码或执行选项变化的块显示结果过期提示，编辑普通正文或其他块不触发该提示。Inline 语言标签简写为 **r、py、jl、ojs**，选择菜单和悬停提示保留全名。Chunk 与 inline 的语言名称不显示小箭头，仍可点击展开。R 也使用这两种类型；切换语言保持代码、注释和选项行原样，支持撤销。点击运行入口才执行，结果不落盘；在 **Workspace settings → Code execution** 设置各语言解释器路径并检测，高级选项提供 Jupyter/Pandoc 配置。留空沿用启动配置或自动检测；保存后重置 Notebook 会话，下次运行生效。配置保存在当前知识库，仍需安装对应运行环境。当前实现交互计算语法，尚未集成完整 Quarto 发布 CLI、项目配置、跨语言变量桥接或持久输出。见 [配置、示例与边界](docs/features/QUARTO.md)。

**R Markdown：** R 使用统一的可执行块与行内表达式类型，均有语法高亮及 Notebook 式交互。R Markdown 方言的语言选择器仅提供 R；Quarto/Notdown 提供四种语言。块内不显示围栏和 `{r ...}`；右上角提供选项、运行上方块、运行当前块，文本、表格、图形直接显示在块下方并可折叠、清除。行内 R 可直接放入光标编辑，点击 **r** 语言名称打开语言选择及运行面板，或在表达式内按 **Ctrl/Cmd+Enter** 运行。**Knit** 在全新 R 会话中执行整篇文档，切换到只读结果并将 inline R 替换为计算值；**Return to editing** 恢复原始表达式和未运行界面。Notebook 执行共享当前窗口的临时 R 进程，通过现有 `/` 菜单插入。需本机 R、`rmarkdown` 包与 Pandoc，可在 **Settings → Code execution** 设置 Rscript，仍兼容 `NOTDOWN_RSCRIPT`。结果不写回笔记；不含持久结果、逐语句执行、Shiny、交互式 widgets 和 PDF/Word 导出。见 [配置与使用边界](docs/features/R-MARKDOWN.md)。


Markdown Lab 的 Pandoc readers 已接入 citeproc，使用 YAML `references` 生成作者年份与参考文献列表，保留 Source 原文，并在预览区显示引文诊断。Lab 使用 Pandoc 默认样式，暂不加载外部文献或 CSL 文件。可用[引文示例](docs/fixtures/pandoc-citations.md)测试。

Footnote 统一包含引用式脚注（`[^id]` 加定义）与 Pandoc 行内脚注（`^[…]`）。启用 `inline_notes` 时，两种写法共用编号上标、悬浮预览、跳转和可编辑的底部脚注区，保存仍保留 `^[…]`。行内脚注只允许一个段落，可含格式、链接和跨行内容，不能复用为命名定义或扩展成多个块；插入菜单不再单列 Inline note。

斜杠菜单保持正文输入焦点，随当前输入行定位，并根据剩余空间向下或向上展开。紧凑命令列表独立滚动，底部固定 **Close menu / Esc** 关闭入口；筛选、滚动和调整窗口大小时避开正在输入的行。

引文定义、图片题注、行内对象插入与属性、链接和公式使用无灰色遮罩的轻量编辑面板。打开期间可以继续滚动页面；Save/Apply 提交修改，Cancel、关闭按钮或面板内的 Escape 放弃修改。目标内容变化时拒绝旧编辑。较大的设置与确认窗口仍使用模态对话框。

页面和双栏视图中，点击正文下方空白区域会新增一个空块；正文末尾已有空块时只聚焦它。即使后面有脚注或参考文献，连续点击也不会重复新增空块。

页面提及、Wiki 链接和 Markdown 内链共用引用模型，在 Block Explorer 中统一为 **Internal link**。`/` 菜单提供 **Page link（页面链接）** 和 **Location link（位置链接）**；位置链接可指向本页或其他页的标题、已有 Obsidian 块／列表项 ID 和锚点。保留显式显示文字与原始语法，导航和反向链接共用目标解析。暂不自动生成缺失的块 ID，未实现完整 Obsidian 路径／别名索引及重命名修复。详见[页面与位置链接](docs/features/INTERNAL-REFERENCES.md)。

页面和双栏视图中，正文链接左键单击即可打开，无需按住 Ctrl/⌘。网页和邮箱链接在新标签页打开，内链跳转到对应页面或位置。

具体能力取决于页面方言及已启用的扩展。

启用 `example_lists` 后，示例列表项与普通编号列表一样支持逐项选择，选框覆盖编号。重复标签沿用首次出现的编号，不推进计数；每项显示自己的实际编号，点击引用通过统一位置索引滚动到首次出现项。删除、重排和撤销同步更新编号、引用与跳转目标，保留原标签与未修改的 Markdown 原文。此显示方式避免 Pandoc HTML 在重复项与新项混排时的连续编号错位；目前尚不支持显式重置计数标记。

从菜单新建示例时选择未使用的标签（`example`、`example-2` 等），避免新示例误用旧编号。已有重复标签保留复用语义，不自动改名。

页面编辑时输入 `(@` 可打开示例引用菜单，按标签、编号或正文搜索，用 ↑/↓ 和 Enter/Tab 或鼠标选择，Esc 取消。同名标签只列一次，保留格式并支持撤销，保存为既有的 `(@label)` 语法。无标签示例不能作为候选；代码、链接、源码模式及未启用 `example_lists` 的方言不提供此菜单。

内容节点直接以完整 object ID 命名，例如 `block.paragraph`、`inline.internal_link`、`inline.mention_person`、`inline.date_or_reminder`。内部结构使用 `structure.*`；格式标记与文字处理能力保持各自形式。Markdown 存储和方言边界不变，Agent 提及仍只保留原文。详见[内容对象与节点身份](docs/architecture/OBJECT-IDENTITY.md)。

启用 `alerts` 后，支持此扩展的方言继续识别基础 `> [!NOTE]` 提示块。折叠标记 `+` / `-` 与同行自定义标题属于 Obsidian 语法，仅 Obsidian 和 Notdown 集合方言接受；其他方言将这些写法保留为普通引用内容。

Notdown 的 Markdown blocks 分组或 `/github` 中选择 **GitHub-style Alert** 后直接插入 Note，不弹出窗口。点击图标可从包含图标、颜色和名称的菜单选择类型，后续也可修改。标题在页面上直接编辑；图标菜单中的 **Collapsible** 启用折叠，标题后的空心箭头向右表示收起、向下表示展开。Obsidian 和 Notdown 支持 Obsidian 全部 27 个内置关键词及别名。Notdown 保留五种 GitHub 配色，新增关键词采用 Obsidian 配色；Obsidian 方言全部采用其官方配色。其他启用 alerts 的方言保留五种基础类型，不启用扩展标题、折叠或关键词。HTML 导出保留外观。原有 **Callout** 入口继续插入 Notion 提示块。

Notdown 方言支持同时设置行内文字色和背景色：`<span color="red" bg_color="yellow">文字</span>`。颜色菜单可独立修改或清除两个通道；旧 `color="yellow_bg"` 继续兼容。两者沿用现有命名色板，HTML 输出也显示双颜色。该行内扩展不在官方 Notion 方言启用，详见[格式契约](docs/FORMAT.md)。

Notdown 默认启用 **Symbol replacements** 输入插件：`->` → →、`<-` → ←、`<->` → ↔、`=>` → ⇒、`<=>` → ⇔、`<=` → ≤、`>=` → ≥、`!=` → ≠、`+/-` → ±、`...` → …、`(c)` → ©、`(r)` → ®、`(tm)` → ™。通过 `syntax.extensions.symbol_replacements: false` 关闭。仅 Notdown 方言的可视正文新输入生效，保留格式并避开代码与链接；立即退格撤回上一步替换，加载、粘贴和源码编辑不变。这是本地规则集，不宣称完整复刻 Notion 快捷输入。[详细规则与边界](docs/features/SYMBOL-REPLACEMENTS.md)。

页面启用 `emoji` 扩展时，在可视正文行首直接输入 `:sm`，或在空白后输入，即可弹出 emoji 菜单。初始搜索结果在同一滚动区域内按分类分 section 显示，带分类标题。图库包含完整的 3,972 个 Unicode emoji，包括肤色变体和没有 Markdown 短码的组合图标；支持按 Unicode 名称、关键词和解析器已有短码别名搜索。选择后写入 Unicode 字符，不新增 Markdown 短码协议。固定底栏提供搜索、最近使用、人物表情、自然、饮食、活动、旅行、物品、符号和旗帜分类，点击分类浏览该类全部图标，不改动待输入正文；继续打字回到搜索。可用鼠标或方向键选择，Enter / Tab 确认，Alt+左右方向键切换分类，Escape 关闭；保留格式并支持撤销。代码、链接、转义冒号、不支持的方言或已关闭的 emoji 扩展不触发；源码编辑尚无此菜单。

| 领域 | 当前已实现 |
| --- | --- |
| 数据库 | 根层和嵌套数据库进入页面树，记录显示为数据库子项。侧栏创建与 Full page／Inline 斜杠命令直接创建 **New database**，没有确认弹窗，之后直接编辑标题。标题图标复用页面 Emoji／Lucide 选择器并同步到树；子数据库、子页面和页面链接使用统一入口样式。类型化属性、保存视图和右侧记录编辑面板与 Markdown 页面联动。支持将 Notion 数据库／数据源导入为本地副本，关联和计算属性保留来源快照。旧后端缺少数据库接口时，普通页面仍可使用，并提示重启服务。详见[数据库存储与边界](docs/features/DATABASES.md)。 |
| 桌面与首次使用 | Windows 安装包、原生知识库目录选择、最近使用记录、独立知识库窗口、关闭前保存，以及带预览和原件归档的 Markdown 文件夹导入。 |
| 编辑 | 页面、源码、双栏视图共用草稿和撤销历史；斜杠命令、行内格式、嵌套列表、块选择与拖动。按住框选并滚动滚轮时，起点固定在正文位置，保留已框选内容并向滚动方向继续扩选，页面与双栏视图均支持。平级落点显示当前层级全长淡蓝线，子级落点叠加缩进的深蓝线；列表提示覆盖标记栏，并与实际子树插入边界对齐。同一插入位置的“上一块之后／下一块之前”共用间隙中央的一条提示线，列表边界也保持一致。所有行内 mark（代码、颜色／背景、强调、链接、原生 span 等）都有明确的内外输入状态。有 padding 的边界会将光标显示在内侧文字或外侧相邻文字旁，无 padding 的格式保留原生光标。在行内代码中输入时不显示轮廓框。 |
| 页面组织 | 父子页面，页面底部 Child page 列表可收起／展开（不超过 5 个默认展开，超过 5 个默认收起；本次使用期间保留手动选择）、侧栏排序、收藏、搜索、反向链接、页面引用，以及回收站和恢复。侧栏标题充分使用行内可用宽度，操作按钮仅在悬停或键盘聚焦时占用空间。有子页面的条目在悬停或键盘聚焦时用展开箭头替换图标，鼠标点击后移开即恢复图标（触屏常显箭头），子页面每级缩进 10px。 |
| 视图与阅读 | 知识库画廊、属性列表、树和力导向关系图（节点拖动、平移缩放、邻接高亮、力度调节）；页面大纲、思维导图、标题折叠与固定在可视区域垂直中部的阅读目录。 |
| Markdown 内容 | 多种方言预设、87 项 Notion 与 17 项 Custom 代码语言及本地高亮、KaTeX 公式、Mermaid 图表、引文、表格和元数据编辑。脚注支持输入正文或复用已有定义、悬浮预览、底部多块编辑，以及页面编辑中删除最后一个引用时同步清理定义并可撤销。导入时已有的未引用定义继续保留；源码编辑保留显式定义。见[脚注边界](docs/features/FOOTNOTES.md)。 |
| 页面外观 | 添加或更换页面图标时，可搜索选择 Unicode Emoji 与内置完整 Lucide 图标库；Lucide 图标在侧栏、面包屑和页面引用中一致显示。侧栏 Emoji 与 Lucide 图标在等宽区域内居中对齐。保留 Emoji 显示风格与最近使用；仅在缺少图标或封面时显示 Add icon / Add cover；有图标、无封面时在图标下方保留紧凑操作栏，显示或隐藏按钮不改变标题位置；图标悬停背景完整包住字形且不与封面按钮重叠。内置与上传封面可通过横幅工具栏更换、调整位置；工具栏在鼠标悬停封面或键盘聚焦时显示（触屏和调整位置期间常显）；支持 YAML 属性编辑。 |
| Notion MCP 语法 | Notdown 与 Notion Markdown 均支持 Tabs、分区会议笔记、HTML 附件嵌入、Folder/Database 引用及 Agent 提及。会议笔记提供专用卡片、与 mention 共用的日期面板（Notdown 下含日期范围、时间和本地提醒）、本地联系人提及、分区标签、语言与摘要指令菜单、同意确认、音视频上传及已配置服务的转写和摘要。Notdown 保存会议配置，官方 Notion Markdown 的配置仅在当前会话内生效。尚无实时录音、Notion 邀请和自动摘要。详见[会议笔记](docs/features/MEETING-NOTES.md)。 |
| Notdown 扩展 | 书签、链接预览、面包屑、本地按钮、内嵌 HTML 文档和网页嵌入。 |
| 联系人与日期 | 本地联系人及人物提及；日期编辑，以及 Notdown 方言下应用运行期间的提醒。 |
| 文件与导出 | 图片、视频、音频、PDF、文件分别插入；文件卡片显示图标、文件名和本地附件大小，音视频使用播放器，本地 PDF 使用浏览器预览。支持单页 HTML 导出及 MyBase 元数据导出。 |
| 本地数据保护 | 带版本校验的保存、历史快照、外部修改检测，以及可恢复的冲突副本和显式合并。冲突对比与实时合并预览采用 Git 风格的红绿逐行差异，默认折叠未变化的内容，并可展开完整 Markdown 编辑。 |
| 集成 | stdio MCP 桥接；可选的 GitHub、OneDrive / SharePoint 预览；可配置的文本生成与转录服务。 |

选择 **File** 后，音频、图片和 PDF 也保持文件卡片。媒体播放和 PDF 预览依赖浏览器支持；大小从本地附件读取，不可用时及静态导出时不显示。不支持媒体块的方言提供 Image 与 File（Markdown 链接），不插入不受支持的播放器语法。

媒体上传在打开系统文件选择窗口前，将焦点从编辑器交给文件控件，取消或失败后恢复焦点。系统选择窗口内的鼠标指针由浏览器和操作系统控制。

独立图片提供悬浮／聚焦工具栏：对齐、题注、裁剪、放大、下载和更多，两侧手柄可调整尺寸。Notdown 可保存对齐、宽度及可恢复的裁剪区域，支持拖动／方向键缩放、裁剪比例预设、重置和撤销。放大查看原图并可缩放；更多菜单提供按 URL 换图、复制链接、原始尺寸、重置裁剪和删除。暂不支持评论，不覆盖原图。布局编辑要求 Notdown 且开启图片属性；官方 Notion Markdown 保留文档定义的题注／链接语法。见[图片控件与格式边界](docs/features/INLINE-OBJECTS.md#image-controls)。

代码块采用一致且更紧凑的上下内边距和更小的工具栏；工具栏仅在鼠标悬停代码块或键盘聚焦按钮时显示（触屏常显）。

Workspace settings → Reading experience → Numbered list display 可调整 Page / Split 视图中数字起始列表的显示：**Markdown**（默认）保持 `1 → 1 → 1`，**Notion** 按层级循环 `1 → a → i → 1`。明确指定字母／罗马数字样式的列表及其子树保留源码定义的编号。设置立即生效并在本机保存，仅影响显示，不改写 Markdown 或导出编号。

Workspace settings → Editing → Code block input 可选择并在本机记住输入偏好。**Notion**（默认）在输入第三个反引号时立即创建代码块；**Markdown** 允许继续输入语言，通过下拉建议补全（上下键选择、Tab 或点击补全），回车创建代码块，也支持三个反引号加空格创建。围栏中明确指定或工具栏中选择的语言会被记住，后续未指定语言的新块（包括斜杠菜单插入）沿用它；选择 Plain Text 可将默认语言重置为纯文本。已有块和导入 Markdown 保持各自语言。输入快捷方式仍遵循当前方言的反引号围栏开关。

启用块公式时，在段落中单独输入 `$$` 并按回车，会创建数学公式块并打开公式编辑器。代码和表格单元格保留原来的回车行为；Shift+Enter 不触发此转换。

启用美元公式语法时，在 Page 视图输入 `$x^2$` 的末尾 `$` 会立即转成行内公式，可继续在其后输入；转换后立即按退格可恢复 Markdown 原文。代码、转义美元符号、空公式及定界符内侧紧邻空白的写法保留为文本；`$$` 仍使用块公式快捷输入。

Notdown 默认关闭单反斜杠和双反斜杠的圆括号／方括号公式语法（`tex_math_single_backslash`、`tex_math_double_backslash`），避免与 Markdown 转义冲突。`$...$`、`$$...$$` 仍默认开启；需要反斜杠公式时可在 Extensions 中显式启用。已有显式配置和源文件保持原样。

页面输入已补齐尖括号网址／邮箱自动链接、配对行内 HTML、`:emoji:` 短码、`~下标~`、`^上标^`、`^[行内脚注]`、MMD 缩写及已支持的引文引用。CriticMarkup 的新增、删除、高亮、注释与替换均在最后的 `}` 闭合后转换。转换遵循当前方言，保留已有定义；这些转换均可立即 Backspace 还原，包括行内脚注。`==文字==` 与 `{==文字==}` 使用相同的高亮样式与清除格式行为，保留各自原始语法。见[完整输入表与边界](docs/features/INLINE-OBJECTS.md)。

不冲突的输入别名包括：`"` + 空格创建引用；`a.` / `i.` + 空格创建有序列表，启用 fancy lists 时保留字母／罗马数字编号。启用 line blocks 时，`|` + 空格创建逐行块（Enter 换行，空行再 Enter 退出）；关闭时保留引用别名。启用删除线且两种下标扩展均未占用 `~` 时，`~文字~` 转为删除线。Notdown 和 Notion Markdown 启用 nesting 时，输入 `## >` 后按空格可创建二级折叠标题（其他可用标题级别同样支持），立即退格可恢复普通标题与 `> ` 原文；保存沿用已有 `{toggle="true"}` Markdown 语法。单独 `>` 保留引用行为，`$$…$$` 保留块公式含义；折叠块／折叠标题也可通过插入菜单创建。斜杠搜索补充 `/plain`、`/num`、`/#`、`/##`、`/###`、`/latex`、`/book`、`/reminder`、`/to-do` 等已有命令别名；`/div` 保留原有容器含义。

输入 `[[` 或 `+页面名` 可实时搜索页面；`@页面名` 与联系人、日期共用提及菜单。支持上下键及 Enter/Tab、点击选择、Escape 保留原文。`[[` 优先显示已有页面，`+` 优先显示创建选项；创建时可选择当前页、其他页或知识库顶层作为父位置，不跳离正在编辑的页面。引用保存稳定页面 ID，使用当前方言既有的 Wiki／mention／Markdown 编码。回收站页面及其后代不作为候选；代码、转义触发符和已有链接不弹菜单。创建失败或请求返回时编辑位置已失效，不覆盖新输入；已成功创建的页面仍可从侧栏找回。这里仅实现本地页面引用与创建，不包含协作通知。

点击行内公式后，公式高亮，并在其正下方打开带蓝色 **Done ↵** 按钮的紧凑输入条。输入条随公式滚动定位，窄屏时保持在窗口内。点击 Done 或按 Enter 保存；Escape 或点击外部放弃草稿。

代码语言菜单分为 **Notion（87 项）** 与 **Custom（17 项）**，搜索统一匹配名称和别名并保留分组。多数语言使用 Prism；Lean、Wenyan、sed 通过 Shiki 复用 TextMate 语法；GNU Octave 扩展 MATLAB 规则，易语言提供本地基础词法高亮。Custom 还包括 SPARQL、Vimscript、Regular Expression 和 Excel Formula；Makefile 保留在 Notion。ASCII Art 与 Plain Text 保持原色；Mathematica 显示名改为 **Wolfram Language**，兼容旧围栏 ID。Mermaid 保持归入 Diagram。高亮不执行代码或验证证明；未知语法和超过 32,000 个 UTF-16 代码单元的块保留可编辑纯文本。[语言来源、别名及边界](docs/features/CODE-LANGUAGES.md)。

Raw Source 不再作为独立内容对象或插入命令。`{=html}` 与 HTML block / Inline HTML 共用预览和源码编辑，保留原有围栏或反引号编码。其他 raw 格式（含 TeX 和 MultiMarkdown 通配符）归入 **Unsupported**，原文可恢复、可编辑，不提供目标格式渲染或转换。`raw_attribute`、`raw_tex` 开关与方言默认值保留；`raw_tex` 仍列在 **Outside Markdown scope**。

Div 容器不显示边框和属性文字；内部不增加缩进或内边距；整组控件比普通子块控件向外多移 48px，子块保留独立的添加、菜单和拖动控件。HTML 与围栏两种 Div 写法均保留原属性和编码。

块 handle 菜单新增 **View source（查看源码）**：以只读代码视图显示当前块及其子内容的 Markdown 源码快照，带行号、语法高亮和复制功能。弹窗高度随源码行数适应，短内容紧凑显示，长内容在窗口内滚动。沿用页面方言和可用的块原文保留规则；已编辑或嵌套块可能使用规范化语法。查看不会修改正文。

行块与普通段落的字体和对齐一致，无引用边线和额外缩进；内部换行只保留正常行高，不叠加段落间距，块间距保持不变。Enter 在块内换行，空行上再按 Enter 退出到普通段落，并保留后续已有行。启用行块时，单独的竖线行保留为行块中的空行；MultiMarkdown 表格必须有包含横线或等号的非空分隔行。页面和双栏视图中的表格，表头与正文单元格使用一致的网格边框、内边距和列对齐；默认左对齐，保留 Markdown 显式指定的左／中／右对齐。复杂表格、图表、混合 HTML 等部分结构采用预览配合源码编辑。列出某项能力，不代表完整可视化编辑或与所有上游格式完全兼容。

逐行块编辑保存时保留空行，关闭的转义规则不会插入替换占位文本。历史上已保存的占位文本不会自动改写。

在段落行首输入 `---` 即可插入分隔线，支持顶层、普通缩进、列表、引用和分栏；保留周围内容与子块，并把光标放在后续可输入段落。启用 highlight 时，`==文字==` 自动转为高亮；立即退格恢复原文，后续输入退出高亮。代码与转义触发符保持字面内容。

Block comment 和 Inline comment 在页面视图中隐藏，不显示占位或源码按钮。启用 comments 扩展时，输入 `%%` 打开行内注释窗；段落行首单独输入 `%%` 后紧接回车切换为块注释，可输入多行。也可通过 `/` → **Block comment** 或 **Inline comment** 打开同一窗格。Ctrl/⌘+Enter 提交、Esc 取消；取消快捷输入保留 `%%`，提交可撤销，输入框拒绝注释结束定界符。已有注释仍在 Source 视图编辑，保存沿用现有 `%%` 语法，CriticMarkup 注释也隐藏显示。

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

Source 和 Split 使用较宽的编辑区域，带封面的页面也一样；源码编辑框高度至少为窗口高度的 70%（最低 420px），Split 右侧页面同步加高。切换到这两种视图时，自动将编辑工具栏滚到顶部导航下方，并按该位置调整编辑框高度。Page 视图保持阅读宽度。

Source 和 Split 与 Markdown Lab 共用语法配色，代码围栏支持 JavaScript、TypeScript、JSON、HTML 和 YAML 高亮。点击行号旁的箭头可折叠标题章节或多行 Markdown 块（包括代码围栏、引用、列表项和表格），点击箭头或 `…` 展开。`Ctrl+Shift+[` / `Ctrl+Shift+]` 折叠／展开当前位置，`Ctrl+Alt+[` / `Ctrl+Alt+]` 全部折叠／展开。折叠仅保留在当前打开的编辑器中，不改变保存的 Markdown。高亮与折叠使用通用 Markdown 语法，并非所有方言专属结构都有独立支持。 折叠箭头沿用 Markdown Lab 的小号浅灰样式，悬停时略微加深。

侧栏、正文分栏与表格列宽手柄在悬停和拖动时使用带描边的 SVG 调整大小光标，并保留系统光标作为后备。

表格拖动预览保持表头与正文单元格原有的对齐方式，包括默认左对齐及显式设置的左／居中／右对齐。

Page tree 默认显示前三层（根页面算第一层）。点击分支箭头，或聚焦该行后按 Enter／Space，可展开、收起；点击标题打开页面。当前应用会话内切换视图会保留展开状态，刷新后恢复默认。

关系图：拖动节点时关联节点会跟随调整，松开后逐渐稳定；拖动空白处平移，滚轮缩放，单击节点打开页面。鼠标悬停圆点时高亮关联，悬停标题不触发高亮。**Fit graph** 适配全图，**Graph settings** 调整力度、标签和箭头。画布获得焦点后可用方向键平移、`+` / `-` 缩放、`0` 适配；Tab 聚焦节点后按 Enter 打开。系统减少动态效果模式下，布局直接稳定而不自动播放动画。实线箭头为引用页 → 目标页，包含块形式的 **Link to page** 与行内页面引用；虚线箭头为父页 → 子页。同一对页面的正文引用与层级关系分别保留。目前图谱覆盖已有页面、页面链接和父子关系；尚未实现附件／未创建目标节点、颜色分组、布局保存及 Obsidian 的完整筛选功能。

## 格式与存储

### Markdown 方言

定义列表以「一个 term＋它的全部 definitions」作为一个条目，支持独立选中、拖动、查看源码、复制、删除和类型转换；定义内的段落、列表、代码等子块也有各自的操作手柄。整个 definition list 是结构容器，保存仍使用原有术语／定义 Markdown 语法。

Notdown、Pandoc Markdown 和 R Markdown 的定义列表遵循 [Pandoc 的空行规则](https://pandoc.org/MANUAL.html#definition-lists)：术语与第一个 `:` / `~` 之间有空行时，定义文字按段落显示；没有空行时，直接段落的文字紧凑连排。嵌套列表和代码仍保持块结构。页面编辑、HTML 导出和 Markdown 保存保留此区别；其他方言不强制套用这条规则。

预设包括 Notdown、Notion-flavored Markdown、Typora、Obsidian、CommonMark、GFM、Pandoc Markdown、CommonMark X、Original Markdown、PHP Markdown Extra、MultiMarkdown 和旧 GitHub Markdown。

GFM 已覆盖规范五类扩展，补齐单／双波浪删除线、裸自动链接（含 `mailto:`／`xmpp:`）、任务标记空白、语义表头和 HTML tagfilter。全部 677 个公开示例均有语法、编辑器 schema、未编辑原文和安全导出回归；其中 9 个继承示例的扩展叠加差异单独记录。编辑松散列表、表格内换行后保留语义；跨 Markdown 段落的 HTML 容器提供合并源码编辑与安全预览。GitHub 仓库／账号集成功能不属于 GFM 语法规范，可选扩展与 HTML 安全过滤仍有独立边界。详见 [GFM 核查](docs/audits/GFM-CONFORMANCE-2026-09-24.md)。

页面语法配置保存在 `metadata.json` 对应页面的 `syntax` 字段中，文档内 YAML 可覆盖它。切换方言会重新解释同一份源码，不会迁移整个知识库。

Obsidian 方言默认不开启 Notion 扩展，仍可手动启用支持的可选扩展；已有源码保留。

编辑器的 **Extensions** 面板支持按名称、ID 和说明即时搜索，并显示匹配数量。切换编辑视图、调整侧栏宽度或工具栏换行时，面板跟随按钮定位，水平方向保持在窗口内。搜索只筛选列表；切换扩展开关或重置默认值时才会修改扩展设置。

- **Notdown** 集合已支持的 Markdown 方言能力与 Notion 内容。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、块属性、inline 和 style；已有方言能够表达时，复用其语法。
- **`notion-markdown`** 仅启用官方 Enhanced Markdown 定义的语法。Notdown 补充编码仅限 `syntax.variant: notdown`，显式扩展开关也不能越过此边界。
- **MCP 规范：** 两种方言也支持官方 MCP 明确的语法，包括表格列宽、日期 `endTime`、同步引用 `notice`、多行行内代码、压缩 URL 引用。MCP 的反引号包裹公式与公开文档 `$equation$` 并存。缺少映射的压缩／上传引用保留原文；数据库引用可打开或内嵌对应的本地数据库，远程引用仍保留为链接，不执行云端操作。[语法及边界](docs/reference/NOTION-MCP-SYNTAX.md)。
- **分栏比例：** Notion-flavored Markdown 与 Notdown 均支持官方 MCP 规范的 `<column ratio="30">` 百分比列宽，适用于编辑器及 HTML 导出，支持调宽、撤销与重新打开。新写列宽统一使用 `ratio`，各列合计 100；Notdown 兼容读取旧 `width-ratio` 小数，调宽时替换为 `ratio`，未修改原文保持不变。这不代表实现了 Notion 云端同步。
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

MultiMarkdown 与 Notdown 使用无括号脚注数字上标，脚注和书目分别用横线分隔、对齐编号。重复脚注引用保留独立返回箭头，不显示次数数字；悬停提示和无障碍标签区分返回目标。

MMD 书目中没有可见正文引用的条目不显示返回箭头。行内文献描述支持 Edit definition，保存回原位置的行内语法并保留定位信息；编辑按钮在悬停或键盘聚焦时显示，鼠标移开后隐藏。外部书目文件仍只读。

引文、缩写、术语、元数据变量和 CriticMarkup 修订提供按方言显示的插入表单；MMD 引文有独立于脚注的书目编号、返回链接和定义编辑。页面编辑中删除最后一个引文引用时，同步删除对应的本地 ref 定义，并可一起撤销；已有未引用条目和外部书目文件继续保留。脚注引用直接跳到对应定义，重复引用各有返回按钮。脚注和引文返回箭头使用固定 SVG，不受图标字体影响；待办复选框仅在键盘导航时显示焦点外框。图片题注可编辑；表格支持矩形/行列选区、TSV 复制粘贴、行列移动及选区合并。复用既有扩展和编码，Notdown 默认汇集，其他方言不可强制开启不属于自己的语法。见[方言归属与操作边界](docs/features/INLINE-OBJECTS.md)。

表格边界以短线提示入口，悬停或键盘聚焦时展开行列／单元格手柄，提供蓝色选区轮廓与带搜索和图标的菜单。拖过单元格或 Shift-click 可选择矩形区域：右侧只有一个居中的单元格入口，同时显示选区左上角与鼠标所在单元格的行列提示。底部／右侧加号靠近时显示，点击追加，拖动连续预览行列数量；松手一次提交、一次撤销，Escape 取消。缩减保留必需表头并裁短跨边界合并单元格，松手前拖回可恢复原内容。菜单支持插入、移动、复制未合并的正文行／列、清空内容、合并／拆分及题注；管道／MultiMarkdown 表格支持列对齐，官方 Notion 表格载体支持行／列／单元格文字或背景颜色。不支持颜色的 Markdown 表格不会被转为其他格式或丢失跨度；Markdown 必需表头不能复制。Alt+F10 打开表格菜单，支持搜索、方向键和 Escape。单元格右侧短线仅在有光标或选区时出现，单纯悬停不显示。拖动内部列边界可调整相邻两列宽度，聚焦边界后左右键微调、Shift 加大步长，Escape 取消。官方 Notion 表格保存原生 col 宽度；Notdown 中的 Markdown 表格通过 Pandoc 表格属性行中的 Quarto tbl-colwidths 属性保存相对列宽，保留 MMD 题注、跨度和其他属性，增删／复制／移动列时同步列宽数组。其他方言仍使用当前编辑视图的临时列宽，继续编辑正文前支持临时列宽撤销／重做。本轮不含拖拽排序。

Notdown 和 MultiMarkdown 的 CriticMarkup 替换修订并排显示带删除线的原文和新增样式的替换文字。替换文字可直接编辑，双击可修改原文或接受／拒绝修订。两份内容仍以 `{~~old~>new~~}` 保存；当前仅支持本地单项修订，未实现多人审阅服务。

- **尚无协作或跨端同步。** 本地版本校验和冲突副本不是同步服务；本地同步块不连接 Notion 云端同步。
- **数据库当前仅提供表格视图。** 基础属性可在表格和页面中编辑；关联、联系人、文件和计算属性在界面中只读，公式／汇总快照不会重新计算。看板、日历、字段类型转换和数据库资源永久删除尚未实现；宿主页可通过回收站恢复。工作区成员、权限和完整云端自动化也尚未实现；People 是本地联系人，提及不发送通知。详见[数据库边界](docs/features/DATABASES.md)。
- **Notion API 单向导入：** 支持页面、数据库或数据源的预览及本地副本导入，可选后代。数据库记录和基础属性转为本地 Markdown 页面和类型化字段；远端视图保留归档，创建默认本地表格。界面默认选择 **Notdown**，用经核验的 Block API 数据恢复支持的 unknown 块；**Notion Markdown** 保留官方占位符。原始 Markdown 和 JSON 一并归档，同批页面及可解析关联本地化，其他目标和附件保持远程。尚不恢复权限、评论或缺失子树，不同步、不写回。详见[使用与边界](docs/features/NOTION-IMPORT.md)。
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

Notion API 导入也会转换普通 Markdown 页面超链接（包括 `/p/<Notion ID>?pvs=25`），按 ID 指向本批导入页面。未导入的相对目标补全为 Notion HTTPS 地址；块锚点保持远程并提示。链接文字与周围源码保留。重新导入会创建修复后的副本；已有页面、跨批次链接和行内页面提及不自动迁移。

选中文字后点击 **Link** 或按 **Ctrl/⌘+K**，在选区旁打开紧凑链接面板：支持粘贴网址、搜索库内页面、显示最近页面及图标和父页面名称，方向键与 Enter 或点击均可选择。选择页面会生成指向稳定页面 ID 的普通 Markdown 链接，保留选中文字、标题和格式；无选区时插入页面标题。Escape/点击外部取消，已有链接可修改或移除。排除回收站页面及其后代，过期文档选区不能覆盖新正文。

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

Notion API 导入在原页面没有图标时使用原生 `file-text` 默认图标；明确设置的 emoji 保留，旧导入图标不批量迁移。

嵌套代码围栏兼容 API「仅围栏缩进、代码正文不缩进」的输出，适用于折叠标题、列表等容器。解析、编辑及重开保留代码 Tab 和字面标签，未编辑原文保持不变。所有新页面 ID 统一为 UUID：普通新页／副本使用 UUIDv4，导入使用确定性 UUIDv5。旧 ID 可通过带完整备份和 CAS 校验的显式迁移更新，维护父子关系与引用并兼容旧链接。详见[页面 UUID 迁移](docs/features/VAULT-METADATA.md#页面-uuid-迁移)。
