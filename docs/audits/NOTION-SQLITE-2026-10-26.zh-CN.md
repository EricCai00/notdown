# Notion 桌面 SQLite 与公开 API 对照（2026-10-26）

[English](NOTION-SQLITE-2026-10-26.md) · **简体中文**

## 2026-10-27 补充：双颜色的实际恢复来源

针对用户指定的 Minor tests 页，核对了本机缓存、该页三次导入的原始 API 归档以及连接器重新取得的 Markdown。仅做只读调查和独立副本验证，未修改 Notion 或现有知识库。

发现同一文字片段可以在缓存 `properties.title` 的同一组格式数组中同时带两条 `h` 标记，例如 `pink_background` 与 `red`，另一片段为 `yellow_background` 与 `blue`。这证明双颜色在本机缓存里仍存在，不需要根据截图猜色；不能由公开 Rich Text 只有一个 color 字段推断内部也只保存一项。

更直接的发现是这页的公开接口投影互补：归档 Markdown v2 保留了两段的红字／蓝字，Block API 同块对应 rich-text 范围保留了粉色／黄色背景。合并两者即可恢复这两处样式，结果与缓存独立吻合。它是这次真实样本的验证结论，不是所有页面、颜色或版本都会互补的保证。

验证脚本要求唯一的完整块纯文本匹配，并只处理已确认的文本 run 范围；没有通过全局替换或重复短语猜位置。恢复后重新解析，断言正文和全部非颜色行内格式不变，再与缓存的双标记核对。独立 Chrome 检查两段恢复后的计算文字色与背景色，均正确。样本 API 块时间为分钟粒度、缓存为毫秒粒度；同一分钟加文字相同不能作为将来任意快照都同步的证明。自动接入时仍须区分不同时期、重复文字、非文字对象和冲突颜色，不能无条件拼接旧 API 与新缓存。

可用顺序：同批 Markdown + Block API 的互补信息 → 同账户／工作区且内容和版本可核验的本地缓存 → HTML 导出或浏览器渲染结果人工核查。官方支持[HTML 导出](https://www.notion.com/help/export-your-content)，但本次没有导出该页验证，不能保证 HTML 导出一定保留两项颜色。

研究脚本与私有证据仅放 `.run/`：`inspect-notion-color-recovery.mjs`、`recover-minor-test-colors.ts`、`render-color-recovery.mjs`，输出为 `.run/logs/notion-dual-color-recovery-audit.json` 与 `.run/logs/notion-color-recovery-proof.json`。恢复副本、HTML 预览和截图位于 `.run/color-recovery/`，未作为用户页面写入知识库。这次调查先完成实际样本的可行性验证；后续同日已[接入正式导入预览](../verification/NOTION-COLOR-RECOVERY-IMPORT-2026-10-27.zh-CN.md)，当前范围与边界以该记录和功能文档为准。

## 范围与方法

对本机 `%APPDATA%/Notion/notion.db` 使用 Node `node:sqlite` 的 `readOnly: true`，在事务内读取。所有块仅统计类型、字段名和 CRDT 存在情况；实际属性值限于用户提供的 Test / Blocks 页及其 `content` 后代。没有读取认证记录值、cookie、令牌，也没有修改 Notion 或现有知识库。统计包含历史、删除及账户维度的缓存行，不代表当前工作区总量。

本次快照：27,936 个 block 缓存行、44 种内部类型，22,936 行带 `crdt_data`。Blocks 页沿 `content` 遍历共 90 个唯一块（含根及子页面），缺失引用 0。此数字仅证明这条遍历路径的旧式内容记录齐备，未覆盖数据库查询结果、附件字节、同步引用和其他指针。

活跃块属性中共见 115 个日期对象：96 个 date、18 个 daterange、1 个 datetime；10 个声明 relative 格式，其余 105 个未声明格式，只有目标 datetime 带提醒。当前本机提醒实值只覆盖 `day/value:0/time:09:00` 这一种；其他提前量和 DST 的自动化测试不等于真实客户端所有提醒形态已验收。

本地调查输出位于 `.run/notion-cache-audit.json`、`.run/notion-cache-details.json` 和 `.run/notion-cache-shapes.json`，不提交私人内容快照。最初日期专项脚本为 `.run/read-notion-reminder-cache.mjs`。

## 字段差异

| 数据 | SQLite 实测 | 当前公开接口对照 | 结论 |
| --- | --- | --- | --- |
| 行内日期／提醒 | `properties.title` 的 `d` 标注含 `reminder`、`date_format`、时区和时间 | 原始 Block 日期只有 `start/end/time_zone`；原始 v2 `<date>` 缺提醒和格式 | 已接入可验证的 reminder、已知日期格式补充；不是凭时间猜测 |
| 普通正文、1–4 级标题、列表、待办、引用、折叠、公式 | `properties`、`content`、颜色等 | Block API / v2 已提供大部分语义；当前 API 已支持 `heading_4` | 不能算缓存独有能力；缓存可作离线转换来源 |
| 简单表格 | `table_block_column_order`、`table_block_column_format`、行列标题 | Block API 表格不含具体列宽，但本页原始 v2 已有 `<col width="239.666…"/>` | 列宽不能笼统归为所有 API 都无法获得 |
| 分栏 | `column_ratio` | Block API `width_ratio`、v2 `column ratio` 已有 | 无需额外私有协议 |
| 图片、音视频、embed | `block_width/height`、`block_full_width/page_width`、`block_aspect_ratio`、`block_alignment`、`image_edit_metadata`、`original_source` 等 | Block API 主要提供文件和题注；本页 v2 视频未带这些尺寸设置 | 存在额外显示信息；本次未将这些字段自动转为本地样式。不是所有块都带全部字段 |
| 页面显示 | `page_full_width`、`page_small_text`、`page_cover_position`、`block_locked`、`page_floating_table_of_contents` | Page API 不提供同等完整客户端显示配置；图标、封面本身是公开字段 | 可研究补充外观；不把锁定、权限直接移植成 Notdown 安全规则 |
| 按钮 | 本页 `format.automation_id` | Block API 为 `unsupported` + `block_type: button`，v2 为 unknown | 真正动作需要关联 workflow；本页关联 ID 在 `workflow` 和通用 `records` 中都没找到，不能恢复成可执行动作 |
| AI 块 | 本页 `ai_block_configuration_menu: {type: custom, version: 3}`；其他缓存还存在 `ai_prompt_key`、`ai_last_edited` 字段名 | 原始导入只有 unknown / unsupported，不暴露完整配置 | 具备额外配置线索；没有据此取得完整提示词，更没有可迁移的模型凭据或运行能力 |
| 表单 | `form_layout_pointer` | 表单块内容仍可能 unsupported；View API 已支持 form 配置 | 指针不是布局本体；须解析关联记录，不能据字段存在宣布表单已恢复 |
| 会议记录 | `transcription_state/history`、默认标题、notes/summary/transcript ID、模型及模板字段名 | 当前 API `meeting_notes` 与 v2 可提供已生成内容 | 运行状态、历史及内部关联信息更丰富；正文并非一概无法从 API 获取 |
| 同步块、alias | `transclusion_reference_pointer`、`alias_pointer`、源块 ID | 同步块源 ID 公开；v2 alias 可能只给 unknown | 指针能辅助定位，源块缺失／不在范围时不可当成完整正文 |
| 外部对象、Drive、Figma | 外部属性、URI、集成 ID 等 | 某些为 unsupported，Markdown 能力依类型不同 | 本地只缓存快照和引用，不包含外部服务完整内容或授权能力 |
| 数据库与视图 | `collection.schema`、`collection_view.format/query2/page_sort`，包括列显示、冻结、分组、gallery、timeline、chart 等 | 当前 View API 已公开 `filter/sorts/configuration` 和多种布局 | 不能再说视图都无法用公开 API 读取。内部细项是否缺失须逐项对照，现有 Notdown 未复现全部视图不等于 API 缺失 |
| 评论、权限、用户等 | 单独表、discussions 和若干标注 | 有公开 Comment / User 接口，但能力与共享范围受限 | 不将“当前导入器没调用”误称为“API 不支持”；权限和账户不导入 |
| 编辑内部信息 | `version`、`crdt_data`、复制来源、毫秒编辑时间等 | 公开 API 没有完整 CRDT 操作状态与客户端版本向量 | 对恢复、诊断有价值，但不是可直接追加到正文的块内容 |

44 类内部 block：text、bulleted_list、to_do、sub_header、page、numbered_list、image、sub_sub_header、code、table_row、header、quote、divider、column、header_4、embed、column_list、table、toggle、alias、link_to_page、equation、collection_view、bookmark、collection_view_page、table_of_contents、file、callout、video、transcription、external_object_instance、transclusion_container、tab、pdf、audio、ai_block、button、breadcrumb、transclusion_reference、figma、drive、copy_indicator、personal_home_page、form。上述分类依据字段形状和选定页面实值，未声称逐个对象都完成全量还原。

## 多久缓存一次

不能给出固定 N 分钟。Notion 官方技术说明：离线页订阅页面版本更新推送，收到后拉取变化；重新联网时比较客户端 `lastDownloadedTimestamp` 与服务器更新时间以补齐。普通 SQLite 缓存的覆盖和保留时间原本是 best effort。[官方存储与同步说明](https://www.notion.com/blog/how-we-made-notion-available-offline)

本机 `offline_page` 目前 0 行，Blocks 页也未标记为完整离线页。`offline_download_metadata.last_executed_at` 记录的是任务执行时间；`meta_last_access_timestamp` 是访问时间；`last_edited_time` 是编辑时间；数据库文件修改时间也不能当成某页面下载完成或云端最新的证明。本次没有人为修改源页来测量延迟，不承诺实时缓存。

建议在 Notion 桌面端打开所需来源页并等待同步。需要可靠离线内容时可在 Notion 设置 **Available offline** 并等待下载完成。官方当前说明：子页面需单独下载，数据库只自动带第一视图前 50 行；付费方案自动下载最近访问和收藏页。不能由“本页有缓存”推断整个工作区齐全。[官方离线说明](https://www.notion.com/help/use-pages-offline)

## 能否只用 SQLite 导入

可以实现针对已缓存页面的本地快照导入：选根页和账户 → 遍历并核验引用图 → 将已知内部块转换为现有 Markdown 方言 → 缺失／未知保留来源和原记录 → 预览 → 通过 `createVault.importBatch` 创建副本。提醒和部分外观会比纯公开 API 更完整，而且核心文字可以不依赖 token 或网络。这是技术可行性结论，本次交付是 API + SQLite 日期补充，尚未提供 SQLite-only 导入入口。

不能把 SQLite 文件当作全工作区导出：本机没有完整离线页保证；数据库记录由查询决定而非单看 `content`；附件记录多为 URL 而非文件字节；workflow/form/AI 的关联对象可能没下载；同步、alias 和外部集成存在额外依赖。22,936 行 CRDT 数据也不能只当无用字段丢弃后宣称无损，须确认 `properties/content` 的物化状态与 CRDT 一致并保留未知数据。表结构属于客户端内部实现，升级可能改变。

因此当前优先使用公开 API 获得可访问页面和完整分页，SQLite 补充缺失字段。独立 SQLite 导入器须显式展示缺失块、缺失数据库记录范围、远程附件和缓存时间，不默默跳过，不执行来源中的按钮或自动化。

## 本次接入与验证

实现位于 `server/notion-desktop-cache.ts`、`server/notion-import.ts` 和导入对话框。服务端只接受 `useDesktopCache` 布尔选择；固定 Windows 路径，不接受任意本地路径参数；SQLite 只读事务、账户/工作区限定、块数和字节数上限。只采用 API 已读取的块，核对日期列表和单页唯一性；API 时间为分钟粒度时比对编辑分钟，返回亚分钟精度时要求精确相等。每次 Preview 针对需要补充的页面重新读取缓存，不保留 Notdown 侧轮询缓存。实际采用的原始日期对象与块版本归档，参与导入身份，不修改已有用户页面。

实测提醒：2026-10-24 09:00 America/Los_Angeles，内部 `reminder={unit:day,value:0,time:09:00,defaultTimeZone:America/Los_Angeles}`，转换为 `2026-10-24T16:00:00.000Z`。真实缓存字段读取已验证；在线公开 API 的新快照未重新用 token 拉取，自动化接入验证使用模拟 API 与临时 SQLite，不能称为已完成真实云端端到端验收。

单元覆盖只读与账户隔离、真实结构转换、旧缓存、重复日期、未知设置、DST、原文边界、归档、幂等身份、官方语法及关闭补充；浏览器覆盖预览选择、提醒保存／重新打开后的菜单。

- 全量单元串行运行 `npx tsx --test --test-concurrency=1 tests/unit/*.test.ts`：1,088 项，1,083 通过、5 跳过、0 失败。日志 `.run/logs/notion-cache-unit-serial.log`。默认并发 `npm test` 曾先遇到旧提醒提示文案断言，修正文案后两轮分别遇到 Node `UNKNOWN` 源文件读取和临时知识库写入错误；没有改动相关 page-order/sync 实现来规避，降低测试并发后全量通过。
- 编辑时间精度补充校验后，新增 5 项定向单测再次全通过：`.run/logs/notion-cache-targeted-final.log`。
- 实际本机 SQLite 读取与旧 API 归档拒绝补充验证：`.run/logs/notion-cache-live-read.json`；只有新缓存字段被读取，没有将 10 月 23 日的旧接口快照与 10 月 26 日缓存混用，更未改写本地已修改日期。
- 生产 `npm run build`、桌面构建与最终类型检查通过。安装包内运行时确认 Electron 44.4.5 / Node 24.21.0 / SQLite 3.53.4，日志 `.run/logs/notion-cache-electron-runtime.json`。
- Chrome 日期和会议日期 13 项通过；v2 导入 4 项复验通过（`.run/logs/notion-cache-browser.log`、`.run/logs/notion-cache-browser-final.log`）。首轮新增重复预览测试漏填已按既有安全行为清空的 token，已改正；同轮旧导入用例等待标题超时，独立复验通过。未运行全量浏览器套件。
- 最终将上述 17 项合并重跑，全部断言通过。隔离服务退出阶段停滞；核对独占端口 4341、PID 与 `node --import tsx tests/e2e/server.ts` 命令后，仅结束该临时服务，runner 随后以 0 退出并报告 17 passed。没有停止用户 Notdown/Notion 进程。日志 `.run/logs/notion-cache-browser-complete.log`。
- 安装包 `.run/notion-cache-release/Notdown-Setup-0.1.3-x64.exe`，本机现有安装未自动替换；需要安装新包后重新预览导入。缓存只在本次预览中使用，不自动批量修复既有用户内容。

## 对照来源

- [Block API](https://developers.notion.com/reference/block)：支持的块字段、unsupported、表格和媒体。
- [Rich text](https://developers.notion.com/reference/rich-text)：公开日期 mention。
- [View API](https://developers.notion.com/reference/view) 与 [Working with views](https://developers.notion.com/guides/data-apis/working-with-views)：现有视图能力，避免沿用过时的“视图均不开放”结论。
- 原始公开 API 和 Enhanced Markdown 证据见[此前提醒验证](../verification/ATTACHMENT-UUID-CLEANUP-2026-10-26.zh-CN.md#notion-reminder-证据与边界)。
