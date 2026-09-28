# HTML / Web embed 验证（2026-09-27）

范围为 Notdown 嵌入容器与操作，依据用户提供的六张 Notion 截图。前四张为 HTML，后两张为网页。嵌入网页的商标、图片和正文属于外部内容，不由容器复刻。使用现有 Notdown 字体、Lucide 图标、Markdown codec 和临时测试知识库。

## 视觉对照

- 来源：`C:/Users/Eric/AppData/Local/Temp/codex-clipboard-dd91a72e-bfbe-4da8-84cd-e3960c8b89b0.png`（1057×285，HTML 悬停）、`codex-clipboard-a965d0d2-8db0-4d29-b9fa-2578c0bb4fce.png`（1146×496，HTML 菜单）、`codex-clipboard-c5255006-8e1a-4e62-9e27-5846b15621be.png`（1435×481，网页悬停），均为该 Temp 目录中的用户附件。
- 独立 Chrome，桌面 viewport 1440×1000，窄屏 390×844，deviceScaleFactor 1。预览 HTML 容器 708×261 CSS px，网页容器 708×433 CSS px；页面内容宽度遵循 Notdown，拖拽高度由正文属性决定。
- 实现：`.run/logs/embed-preview-html-hover.png`、`embed-preview-html-active.png`、`embed-preview-web-hover.png`、`embed-preview-page.png`；自动化菜单截图为 `test-results/embed-html-menu.png`、`embed-web-menu.png`、`embed-mobile-menu.png`。
- 并排比较：`.run/logs/embed-compare-html-hover.png`、`embed-compare-html-menu.png`、`embed-compare-web-hover.png`。以原始像素并排排列；菜单裁出编辑内容区域，不缩放源图。不同页面宽度/外部正文不用于像素一致性判断。容器与菜单在这些图中可读，不另做放大局部图。

### 发现与复查

1. 首轮 [P1] Interact 白字被编辑器的通用按钮颜色覆盖，对比度不足。提高局部选择器优先级后重新构建、截图；第二轮按钮白字清晰，并用浏览器断言验证 `rgb(255, 255, 255)`。
2. 首轮网页截图停留在 iframe 中，未展示工具栏悬停状态。改为悬停工具栏，等待其 opacity 为 1 后重新截图；浮动按钮、两侧/底部/角落拖拽柄均清晰可见。
3. 第二轮无容器范围内的 P0/P1/P2 未解决问题。HTML 有文件名、细边框、遮罩及黑色交互按钮；激活后可选中内容并使用表单；网页没有 HTML 文件标题或遮罩。说明位于框外下方，选中背景为淡蓝色。

五项表面检查：字体沿用应用字体，菜单 16px、说明 14px；间距保持独立文件头、预览框与说明；颜色使用灰色控件、白色菜单、淡蓝选中及黑白 Interact；无需新增图像资产，外部网页自带图像保持 iframe 内容；按钮文案对应实际能力。菜单直接呈现全屏/打开和对齐选项，复用原有块手柄菜单提供源码、属性与类型转换。没有伪造 Notion 评论、建议修改、AI 或跨页移动入口。官方 Notion `<embed>` 不增加自定义布局，保留其原生 caption。

## 功能与数据验证

- `npm test`：841 passed，5 skipped，0 failed（新增属性用例另行执行）。
- `npx tsx --test tests/unit/embed.test.ts`：4 passed，覆盖说明转义、多行/中文、布局与未知属性、撤销、方言边界。
- `npm run test:e2e -- tests/e2e/embeds.spec.ts`：构建成功，7 passed；后续增加下载检查后再次独立运行同组，7 passed。
- 测试覆盖：上传/拖放/取消/失败/外部刷新竞态、脚本隔离、URL 校验、替换、说明实时保存、拖拽/键盘尺寸、取消拖拽、对齐、全屏、HTML 下载、搜索菜单、复制/删除/撤销、刷新恢复、窄屏边界、官方 caption 与 Typora 原编码。
- 临时预览的独立 Chrome 检查：`pageerror` 数量 0。预览使用临时知识库，不写用户 `vault/`。
- 扩展回归：嵌入、选择菜单、方言边界合计 15 passed / 2 failed。失败分别为 `notdown-boundary.spec.ts:17` 找不到表格 Merge right 按钮、`selection-menu.spec.ts:244` 找不到窄屏 Text and background color 按钮；两份失败用例不含 embed。未改动相关表格/文字选择实现。详情保留于 `.run/logs/embed-final-e2e.log`，不宣称整个浏览器测试套件通过。

## 实现清单

- [x] HTML / 网页视图分离及实际交互。
- [x] 布局、说明进入 PM 事务与现有 CAS 保存路径。
- [x] 原载体、未知字段和方言边界保留。
- [x] 定向浏览器验证、原始截图与复查记录。
- [x] 中英文 README 和 FORMAT 边界更新。

## 用户反馈后的修订：独立入口、菜单差异与居中缩放

本节覆盖前面的首轮结论。首轮遗漏了两个实际问题：HTML 与 Web 共用插入入口；通用 `.pm-document > * { margin: 0 }` 覆盖默认居中的自动边距，导致缩窄后偏左。不能用此前只检查属性值的结果代替实际位置验证。

- [P1，已修复] 插入菜单同时提供 HTML embed 与 Web embed，使用不同图标、搜索词、空态与表单。HTML 新建复用原生 `<embed>`，只上传/替换 HTML 文件；Web 只接受网址。旧 HTML `web-embed` 文件仍按原载体保存。空 HTML 块保存、重载、撤销后也不会变成 Web 插入表单。
- [P1，已修复] HTML 顶栏只保留全屏与更多；菜单提供 Turn into → File、下载、Align 子菜单，以及 More options → Full screen / Open in browser。Web 悬浮栏提供对齐、说明、打开和更多，菜单直接列出全屏/打开/原始链接，不出现 HTML 文件操作。HTML 仅有底部/角落拖拽柄；Web 另有两侧拖拽柄。
- [P1，已修复] 提高居中/左右对齐规则的选择器优先级，缩放按父容器内容宽度计算。浏览器验证直接读取 boundingClientRect：HTML 与 Web 的中心点在拖拽中、松手后、保存重载后均与父容器中心相差小于 1px；分栏内键盘缩放也保持中心不变。
- [P1，已修复] 子菜单初版先 hover 再 click 时触发原生 auto popover 的自动关闭。子菜单改为 manual，由父菜单统一关闭；重新测试鼠标、Escape、文件转换及撤销均通过。

最新截图：`test-results/embed-distinct-insertions.png`、`embed-html-menu.png`、`embed-web-menu.png`、`embed-html-centered.png`、`embed-web-centered.png`；桌面 1440×1000，密度 1。最新预览截图仍在 `.run/logs/embed-preview-*.png`，HTML 为 566.39×261 CSS px，Web 为 637.19×413 CSS px（80%/90% 居中宽度）。同源参考图与最新实现重新生成并排图 `.run/logs/embed-compare-*.png` 并检查：文件头、灰色交互遮罩、工具栏、菜单层级、边角拖拽柄及框外说明均与对应类型的参考一致。应用字体、不同宽度及测试 iframe 正文为明确的产品/样本差异。未实现的 Notion 评论与 AI 功能不显示虚假按钮。

最新验证：

- `npm test`：846 passed，5 skipped，0 failed，日志 `.run/logs/embed-split-unit.log`。
- 最后标签与菜单修订后的定向单元测试：14 passed，日志 `.run/logs/embed-split-final-unit.log`。
- `npm run build -- --outDir .run/embed-frontend`：通过，日志 `.run/logs/embed-split-final-build.log`。
- 独立端口 4347、独立构建运行 `playwright test tests/e2e/embeds.spec.ts`：10 passed，日志 `.run/logs/embed-split-final-e2e.log`。原 `npm run test:e2e` 的默认端口与仓库另一组测试冲突，因此本轮最终浏览器运行隔离端口和产物。
- 预览使用独立临时知识库；独立 Chrome 检查 `pageErrors: []`。未操作用户知识库。

修订后无本次范围内未解决的 P0/P1/P2。

final result: passed
