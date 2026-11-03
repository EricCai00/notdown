# Database table and side peek — 2026-09-28

[English](DATABASES-DESIGN-QA-2026-09-28.md) · **简体中文**

final result: passed

范围：用户提供的两张 Notion 数据库参考图中的表格、视图工具栏、类型图标、有色选项、勾选列及右侧记录面板。保留 Notdown 的侧栏、正文编辑器和本地保存规则，不实现 Notion 账号、权限或评论服务。

上述结果仅适用于本次数据库设计与专项交互验证；不表示整个仓库的浏览器测试全部通过。

## 截图与布局

测试使用独立 headless Chrome、临时知识库和隔离前端构建 `.run/database-frontend`，不连接用户浏览器或真实 Notion 账号。测试数据由 `tests/e2e/database-fixture.ts` 经现有 API 创建，包含 15 条页面记录和六列：Name、In Markdown、Markdown Syntax、Class、Notion Syntax、AFFINE。示例选项用于视觉与类型测试，不作为外部产品兼容性清单。

原始参考来源：

- 表格：`C:/Users/Eric/AppData/Local/Temp/codex-clipboard-c8d7c744-69ca-42f7-b321-26428971714b.png`。
- 右侧记录：`C:/Users/Eric/AppData/Local/Temp/codex-clipboard-f17afd9e-9f3b-4a60-8318-b3f7e21036f7.png`。

两张原图及对应宽屏实现截图均为 1919 × 975；实现使用 `deviceScaleFactor: 1`，以 1:1 像素与原图比较。normalization: none，不对图片缩放、拉伸或重新排版来掩盖差异。另以 900 × 975、deviceScaleFactor 1 验证响应布局。参考图与最终实现图已在同一次图像查看中并列检查。

| 证据 | 视口 | 检查内容 |
| --- | --- | --- |
| `test-results/databases-reference-table.png` | 1919 × 975 | 表格标题、视图标签、图标工具栏、蓝色 New、类型图标、三组有色选项及勾选列。 |
| `test-results/databases-reference-peek.png` | 1919 × 975 | 左表格与右记录并排；当前行高亮，记录标题、属性、正文和关闭／完整页面按钮。 |
| `test-results/databases-select-menu.png` | 1919 × 975 | 选项面板、有色选项、选中标记与清除操作。 |
| `test-results/databases-reference-peek-narrow.png` | 900 × 975 | 窄屏右侧覆盖面板；标题、属性、正文及关闭操作在视口内。 |
| `test-results/databases-reference-table-narrow.png` | 900 × 975 | 关闭记录后恢复表格；宽表格在独立区域滚动。 |

最终截图已检查字体层级、间距、颜色、网格、文本裁切、选项面板和窄屏边界。宽屏表头约位于 y=251，15 行可同时看到；右侧正文使用现有 Page / Source / Split 模式。菜单和表头使用项目现有 Lucide 图标，无新增位图资产。

| 保真检查面 | 观察与边界 |
| --- | --- |
| 字体 | 大号粗体数据库／记录标题、较重记录名称、常规单元格文字与灰色字段名形成相同层级；使用项目已有字体，字形和图标笔画不宣称逐像素一致。 |
| 布局与间距 | 紧凑视图标签、右侧工具栏、六列表格、选中行与垂直分隔的 side peek；表头 y≈251 对参考 y≈252。保留 Notdown 自身顶部栏和较窄应用侧栏，因此内容左边界和列宽与原图不同。 |
| 颜色 | Available 绿色、Not Available 红色、Sometime Available 黄色、Same (Pasting) 蓝色、Basic blocks 棕色、Media 橙色；蓝色 New 与 checkbox、灰色网格和浅蓝选中行均已核对。 |
| 资产 | 使用现有 Lucide 图标，包括字段类型、页面、工具栏、面板开关和最终勾选图标；没有用 CSS 拼造图标或复制参考图中的账号头像／云端助手插图。 |
| 文案 | 六列名称、Table、New、OPEN、Add a property 与相应入口保留语义；正文和测试属性值使用本地示例。未实现的 Share、Comments、自动化和 AI 控件不作为可用功能展示。 |

重点区域证据直接引用以上完整截图：表格的标题／标签／工具栏区域为原图约 `(468,105)–(1780,252)` 与实现约 `(370,105)–(1789,252)`；有色单元格和勾选列位于各自表头下方至 y≈943。右侧属性区域为参考约 `(1320,110)–(1807,445)` 与实现约 `(1296,111)–(1828,443)`；`databases-select-menu.png` 单独展示选项弹层的颜色、选择状态与阴影。这里记录的是全图内的观察区域，没有生成经过缩放的裁切图。

修复循环：首次截图的保存状态占一整行，使表格下移约 24 px，现已把常规状态放到顶部；错误信息仍保留完整可见区域。900 px 下并排布局曾挤压左侧工具栏，现改为右侧覆盖面板，记录面板本身的操作不再裁切。测试数据的字段类型也已改为参考图中的三组 select 与一个 checkbox，采用保存的 `rowOrder`，避免随机页面 ID 影响截图行顺序。最后一轮将宽屏侧栏标题上移约 40 px，并按属性名称排列侧栏字段，表格列顺序不变；同时修复侧栏保存后应用面包屑从 Databases 误变成 Vault 的问题。

非阻塞差异：保留 Notdown 应用侧栏及编辑模式切换；本次没有复制评论区、分享权限、Notion AI 或其他云端入口。表格和记录面板提供真实可编辑的本地功能，不以静态截图代替交互。

## 行为与数据保护

`tests/e2e/databases.spec.ts` 八项测试全部通过，覆盖：

- 创建数据库、字段和页面记录；数字 `0`、页面属性联动、字段改名及重新打开。
- 视图标签选择、保存的筛选／排序／显示列、搜索、筛选与排序图标入口；修改记录后筛选结果及数量更新。
- 单元格仍聚焦时打开记录，收取输入；打开完整页面后通过浏览器返回，正文和属性保持已保存。
- 第一笔保存仍在请求中时继续编辑同一单元格，后续输入不丢失，重新加载可读。
- 页面版本保护；单元格冲突保留磁盘内容、冲突副本和标签页草稿，恢复草稿不自动更换 revision。
- 文档 YAML 属性覆盖显示为只读，原始正文保持不变。
- 记录面板编辑标题、文本属性、Markdown 正文、有色选项与 checkbox `false`，保存、关闭、重新打开并更新左侧表格；**Add a property** 新建字段后继续填写并重新打开验证，保存后应用面包屑仍为 Databases。
- 记录正文冲突阻止关闭、打开完整页面及侧栏导航；明确放弃草稿后读取最新版本，已有冲突副本仍可恢复。

上述页面交互同时检查浏览器异常；参考数据页面没有 `pageerror`。

## 本次验证记录

- `npx vite build --outDir .run/database-frontend`：通过，20.36 秒；日志 `.run/logs/database-design-build.log`。仅有现有的大体积 chunk 提示。
- 独立端口 4339、上述构建目录下运行 `npx playwright test tests/e2e/databases.spec.ts --reporter=list --output test-results/database-design`：8 passed，23.5 秒；日志 `.run/logs/database-design-e2e.log`。包含最终 Lucide 勾选图标及侧栏对齐修正。
- 最终 `npm run build`：通过，Vite 构建 17.67 秒；日志 `.run/logs/database-final-build.log`。
- 最终 `npm test`：869 passed、5 skipped、0 failed，共 874 项；日志 `.run/logs/database-final-unit.log`。
- 使用最终生产 `dist` 的数据库、Notion 导入和页面导航定向回归：23 passed，51.7 秒；日志 `.run/logs/database-final-regression.log`。
- 另外以独立临时知识库在端口 4359 验证干净的 15 条参考记录与 Page 侧栏，无控制台异常；检查脚本 `.run/database-preview-check.ts`，截图 `.run/logs/database-preview-table.png` 与 `.run/logs/database-preview-peek.png`。
- 较早启动的完整浏览器运行使用旧前端快照，在 612 项中的 434 项后停止，记录为 383 passed、21 failed、30 skipped；日志 `.run/logs/database-full-e2e.log`。该运行未完成，也不是全绿。
- 其中四项非数据库失败已独立复现：一项 callout 用例仍查找旧标签，三项方言默认值断言失败，详见 `.run/logs/database-unrelated-review.log`。其余失败尚未全部分类，不将它们笼统归为已有问题。
- 旧完整运行中的数据库视图测试失败已修复，当前八项数据库专项全部通过。该专项结果不替代未完成的全量浏览器验证。

功能和未实现边界见 [本地数据库](../features/DATABASES.zh-CN.md)，接口见 [API](../reference/API.zh-CN.md#本地数据库)。

## 同日追加：创建入口与页面树

新增根层和嵌套数据库创建、同 UUID 宿主页、记录的宿主父关系，以及侧栏树中的数据库入口。`/database` 仅展示已实现的 **Database - Full page** 和 **Database - Inline**；Inline 使用已有官方引用，嵌入实际数据库工作区。

补充截图：`test-results/database-creation-menu.png` 为真实斜杠菜单；`test-results/database-nested-hierarchy.png` 为 1440 × 1000 下的页面 → 数据库 → 记录层级，记录只显示一次。独立 Chrome 与临时知识库规则不变。

本轮首次集成运行得到 27 passed、3 failed。一个失败是测试错误地把官方 `</database>` 结束标签当作尚未消费的 `/database` 命令，已修正断言；另外两个实际问题分别是内嵌表格的保存状态遮住 New 按钮、以及恢复默认数据库期间过早点击侧栏丢失导航。前者通过内嵌状态布局修正，后者通过启动完成前禁用壳层交互修正；没有用强制点击或放宽启动断言绕过。

本轮生产构建后的验证：

- `npm run build`：通过，Vite 19.06 秒；`.run/logs/database-hierarchy-final-build.log`。
- 最终 `npm test`：883 passed、5 skipped、0 failed，共 888 项；`.run/logs/database-hierarchy-final-unit.log`。
- 定向浏览器回归：36 passed，2.2 分钟；`.run/logs/database-hierarchy-final-e2e.log`。包含层级 5 项、内嵌数据库 2 项、数据库表格／记录面板 8 项、Notion 导入 5 项、官方 MCP 语法 2 项、页面导航 10 项与侧栏拖动 4 项。

后续边界检查还发现：较长的数据库树在拖动期间滚动，可能让 Block Explorer 原生链接移到鼠标下面，浏览器启动原生链接拖动并中断页面拖动。这是实际产品问题，不是简单的测试波动。现在页面拖动手势已开始时阻止原生 `dragstart`，普通独立链接拖动不受影响；同时保留所有页面用于后代环检测，记录本身仍不可拖动。

最终修正后的 `npm run build` 通过，Vite 18.21 秒，日志 `.run/logs/database-tree-drag-fix-build.log`；层级 5 项加侧栏拖动 4 项再次验证，**9 passed，21.1 秒**，日志 `.run/logs/database-tree-drag-fixed.log`。这 9 项属于前述 36 项的重复覆盖，不合计为 45 项独立测试。最新构建没有待处理的本轮层级或拖动失败。

层级测试检查根数据库只出现一次、嵌套数据库与记录深度、宿主页身份、侧栏新建记录、未保存正文的收取、两种斜杠创建及刷新后的关系。旧无宿主数据库的浏览器测试使用只读 API 响应夹具，验证虚拟条目和记录投影不发出写请求；实际旧 metadata 的读取保留由存储单元测试验证。内嵌测试覆盖创建记录、修改单元格后切换源码／打开完整数据库、冲突阻止跳转和原始引用保持。

本轮没有重新运行已知存在失败的全量浏览器套件；上述 36 项通过不改变前文对较早不完整全量运行的记录。

## 同日修复：旧后端缺失数据库接口导致启动失败

实际 `4317` 前端代理到 `4318` 的旧 Node 服务：状态接口为 200，数据库列表为 404。前端曾将数据库列表作为必需启动请求，因此显示 `Unable to open the vault / API endpoint not found`。已重启实际后端并改用 tsx watch；原知识库路径保持原值，未执行迁移或重新生成示例。随后通过实际前端入口检查 status、pages、databases 三个接口均为 200。

前端现在仅对数据库列表的 404 提供旧服务兼容：普通页面可读取、编辑和保存，侧栏及数据库路由提供更新提示与 Check connection；422 等存储错误仍会显示，不伪装成空数据库。服务端状态增加 `capabilities.databases: 1`。

验证：`npm test` 为 883 passed、5 skipped、0 failed；`npm run test:e2e --` 指定旧服务兼容、数据库层级和页面导航三个文件，构建通过且 18 项浏览器测试通过。新增测试覆盖旧接口下保存普通页面、直接数据库路由与服务升级恢复，以及真实存储错误不被吞掉。日志 `.run/logs/database-server-compat-unit.log`、`.run/logs/database-server-compat.log`；测试均使用临时知识库，实际服务只进行只读接口检查。

## 同日追加：图标、统一引用入口与直接创建

本轮按用户追加要求实现：完整数据库标题图标复用 Emoji／Lucide 选择器；子数据库、子页面及页面链接采用同一引用行布局；侧栏、数据库列表和两种斜杠插入直接创建 **New database**，不再先弹出命名确认窗口。完整数据库标题可直接修改；内嵌表格上方引用打开完整数据库后修改名称或图标。

图标参考为用户附件 `C:/Users/Eric/AppData/Local/Temp/codex-clipboard-6ae2bb13-1333-4f65-ad57-e748f7bf0de0.png`。本轮复用现有项目选择器，不宣称完全复制 Notion 弹层：提供 Emoji、Lucide 搜索、自定义符号及 Remove，没有 Upload；Remove 保存空图标并显示通用文档图标。

截图 `test-results/database-icon-lucide-picker.png` 和 `test-results/database-page-reference-styles.png` 已按原始 1440 × 1000 尺寸检查，未缩放。前者验证标题旁选择器的位置、搜索结果和侧栏图标；后者验证子数据库、子页面和页面链接的图标、下划线文字及层级。浏览器还测量三种入口的图标均为 16 × 16 px，链接 padding、min-height、display 与 align-items 一致。

验证使用最终生产 `dist`、端口 4419、独立 Chrome 及自动创建和清理的临时知识库，没有使用用户浏览器或用户知识库：

- `npm run build` 通过，Vite 28.20 秒；`.run/logs/database-icons-build.log`。
- `npm test`：891 passed、5 skipped、0 failed，共 896 项；`.run/logs/database-icons-final-unit.log`。
- 九文件定向运行初次为 33 passed、3 failed，3.2 分钟；`.run/logs/database-icons-final-e2e.log`。三项失败均为测试定位问题：数据库链接没有页面专用的 `data-page-id`；另两项全局 **Page** 按钮定位与合法的同名记录冲突。
- 修正定位后，涉及的三个文件全部复测，6 passed，26.5 秒；`.run/logs/database-icons-recheck-e2e.log`。当前 36 个不同用例均有通过结果，重复通过的 3 项不重复计数；本轮没有重跑全量浏览器套件。

本轮覆盖图标选择、移除、刷新持久化、页面树同步、真实导航返回后的内嵌及链接图标、原始 Markdown 和未知属性保留、旧 revision 图标冲突归档，及无确认创建和随后重命名。还回归数据库编辑、内嵌草稿、旧服务兼容、Notion 导入、子页面／链接原始语义、两种 MCP 方言和页面导航。图标冲突不会覆盖外部的新正文。

截图复查发现子数据库引用仍被通用大块表面规则增加 8 px 外间距。现已排除非内嵌数据库引用，保留内嵌表格的表面间距；重新生成并检查 `database-page-reference-styles.png`，三种入口等距排列。测试增加三个文字标签连续行距差不超过 1 px 的断言，同时保持图标和导航验证。

此间距修正后，`npm run build` 再次通过（Vite 23.79 秒，`.run/logs/database-icons-final-build.log`）；图标、Notion 子页面、Notion 块导入和通用块间距四文件复测 **9 passed，22.8 秒**（`.run/logs/database-icons-spacing-e2e.log`）。其中 6 项是前述重复覆盖，3 项为补充块间距用例；本轮合计 39 个不同定向用例有通过结果，不将重复运行相加。
