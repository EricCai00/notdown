# 当前自定义正文写法与背景色迁移

2026-10-27。检查当前解析器、写入器、对象样例和属性边界，并对照 [Enhanced Markdown v1 官方规范](https://developers.notion.com/guides/data-apis/enhanced-markdown)与 [Notion-flavored Markdown v2 官方规范](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)。这份记录覆盖旧审计中已过时的分类。标签是官方的，不表示本地附加属性也是官方的；内部模型字段、DOM data 属性与正文编码分开核对。

## bg_color 已退役

所有 Notdown 颜色编辑路径统一输出现有 `span color`，包括没有 v2 标记的 Notdown 页面：

```md
<span color="red"><span color="yellow_bg">红字黄底</span></span>
```

自创正文属性 `bg_color` 不再参与颜色解析；遇到整个 span 时保留字面源码。内部模型中的背景通道仍存在，以便独立编辑与渲染，但不会以这个属性写入 Markdown。Notion Markdown v1 的菜单能力保持原有单颜色限制；v2 的两个通道可独立设置。嵌套形式有官方语法依据，本地显示与保存已验证，未宣称 Notion 远端能往返保留同一行内范围的双颜色。

用户明确授权迁移 **Default 和 Notion test**，覆盖本项目通常不批量迁移用户内容的默认规则。先保存并退出桌面程序，再备份两个完整知识库；不自动扩展到其他库。

| 知识库 | 扫描活动 Markdown | 修改页面 | 转换 span |
| --- | ---: | ---: | ---: |
| Default | 219 | 2（Subpage、Tests） | 5 |
| Notion test | 50 | 0 | 0 |

完整备份目录为 `D:/ProgramData/Notdown/backups/bg-color-retirement-20261027-011206/`，包含 `Default.zip` 与 `Notion-test.zip`。归档已解包读取，并核对所有页面和 metadata 与迁移前内容的 SHA-256；迁移记录位于本机 `.run/logs/bg-color-migration.json`。

转换只定位可遍历源码中的配对 span，不全局替换：跳过围栏、行内代码、未知容器和字面提及。保留未知属性与文本；迁移前后解析结果去除源码缓存并规范化颜色后逐项比较。实际保存经 `createVault.update` 传入读取时的 `baseRevision`，没有冲突重试。已有导入归档、备份和历史正文不转换；正常保存仍记录新的版本。

## 仍存在的自定义写法

下表列出的是本地约定，并非把整个同名官方标签判为私有。本轮仅移除 `bg_color`，其余项目未修改。

| 类别 | 当前项目写法 | 判断与已有替代 |
| --- | --- | --- |
| 网页嵌入载体 | `<web-embed url="…" title="…" caption="…" width="…" height="…" align="…"/>` | 项目自定义载体。官方 v2 已有 `<embed source="…">题注</embed>`；Typora/raw HTML 另有 iframe。尺寸、对齐、标题等补充字段需另行安置，不能不验证就替换整个块。 |
| 卡片补充编码 | 本地 `<bookmark url="…" title="…" description="…" icon="…" image="…" caption="…"/>`；带 `title/description/image` 的本地 `<link-preview>`、`<mention-link>` | Bookmark 与 link-preview 本身已有官方形式；上述卡片元数据和本地可创建行为是项目扩展。官方 v2 link-preview 是只读标记，本地卡片不能仅改名就声称等价。 |
| 非拥有关系的页面块 | `<page-link url="…">标题</page-link>` | Link to page 的项目载体。官方 `<page>` 表示当前页的子页面；改成 page 会混淆拥有关系。普通 Markdown 链接/提及可导航，但不是同一个块类型。 |
| 面包屑 | `<breadcrumb path="…"/>` | 项目载体与路径字段。空路径时按本地页面层级计算导航。 |
| 动作按钮 | `<button label="…" icon="…" variant="…" actions="JSON"/>`，旧 `action/target` | 项目动作协议，不是 HTML button 原生行为，也不是官方 Markdown 按钮契约。 |
| AI block | `<ai-block prompt="…" model="…" generate="…" using="…" context="…" search="…">…</ai-block>` | 项目容器及本地服务配置。 |
| 官方块的本地属性 | embed 的 `title/width/height/align`；折叠/标题的 `open`；代码题注；列的旧 `width-ratio`；表格额外属性 | 属性语义由项目补充。官方列宽已有 `ratio`，新建采用它；只有旧列宽的文件在拖动时仍可能写旧别名。代码围栏属性、表格跨度/题注可复用 Pandoc 等已有语法，借用语法不等于这些属性属于官方 Notion。 |
| 日期增强 | `reminder/reminder-offset/date-format/time-format`、旧 mention-date 的 `time-zone` 与 ISO start/end 约定 | 提醒与显示格式是本地扩展。**官方 v2 `<date time-zone="…">` 本身是官方属性**，不可因同名而整体判私有。 |
| 本地同步控制 | synced block 的 `id/source-revision/snapshot-hash/auto-refresh/auto-sync` | 标签有官方依据，这些本地定位、版本和刷新控制是项目扩展。 |
| 会议笔记配置 | `meeting-config`，以及旧 `title/audio/language/transcript` 属性形式 | meeting-notes 与分区标签是官方的；转写服务配置、本地音频关联和旧属性式标题属于项目补充。新建笔记用官方标题正文和分区。 |
| 旧 Tabs 属性 | `<tabs active="…"><tab title="…">…` | tabs/tab 是官方标签；`active` 和属性式 `title` 是旧本地格式，尚能读取并编辑旧内容。新建采用官方标题正文。 |

另有本地地址约定 `#page/<uuid>`、`person://<uuid>`，分别指向本地页面和联系人；它们借用现有链接/提及语法，不是新的 Markdown 定界符，但其他应用未必能解析。本地联系人不能冒充 Notion 的 `user://` 身份。

## 不属于当前自创语法的内容

- `<span underline="true">…</span>` 是官方 **v1** 文档明确列出的下划线形式，v2 才改为 `<u>…</u>`；不能因为只对照 v2 就把 v1 写法归为自创。不同版本的官方语法应按版本区分。
- `<page>`、`<folder>`、`<database>`、`<tabs>/<tab>`、分区 `<meeting-notes>`、`<mail>`、`<custom-block>`、`<external_object_instance>`、v2 bookmark/embed/link-preview：均有官方依据，要区分版本及附加属性。
- Pandoc 属性/表格/引文、MultiMarkdown、CriticMarkup、Obsidian wiki 与块引用、Quarto/R Markdown、GFM 等已有语法，不因进入 Notdown 合集就变成自创。
- 实际 Notion REST 输出中见到的 `<code>…</code>` 是上游观测形式，未列入所查 v2 文档。Notdown 限定读取它，严格官方模式保留字面源码；它不是项目新设计的持久协议。
- 已停用的 `:::nest`、`:::columns`、`::page`、`html-embed`、独立 figure 属性载体，以及 Lab 的旧 bookmark 围栏，不应作为当前新建输出列出。未知原文可恢复保留不代表兼容执行。

## 实现与验证

主要依据：[颜色写入](../../src/document/editor-markdown.ts)、[通用解析](../../src/markdown-engine/codec.ts)、[Notion 解析](../../src/document/notion-markdown.ts)、[对象编码](../../src/document/object-codec.ts)、[对象字段](../../src/document/object-model.ts)、[属性边界](../../src/document/notdown-boundary.ts)、[v2 编码](../../src/document/notion-v2.ts)。

- 定向颜色/Notion 单元测试：53 通过。
- 全量单元测试：1107 通过、5 跳过、0 失败。
- `npm run build` 通过。
- 独立临时知识库的 Chrome 回归：`selection-menu.spec.ts` 与 `notion-v2-import.spec.ts` 共 19 通过，覆盖旧版 Notdown/v2 的双色菜单、清除、撤销、保存、重开及导入补色。这不是全部浏览器用例验收。
- 迁移后重新读取确认两个库活动正文的旧属性均为 0；两个已修改页面与迁移记录哈希一致，Notion test 的 289 个已有导入归档文件逐项哈希不变。
- `npm run desktop:dist` 通过，安装包为 `.run/desktop-release/Notdown-Setup-0.1.3-standard-colors-x64.exe`（205187293 字节）。本轮生成安装包，未覆盖已安装程序；旧程序已保存并退出。
