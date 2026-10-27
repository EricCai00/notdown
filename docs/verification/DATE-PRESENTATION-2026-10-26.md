# 日期与提醒显示修正（2026-10-26）

## 范围与依据

修正正文及会议标题的日期显示：统一 `@`、相对日期、12/24 小时制、静止无底色、普通日期灰色、提醒末尾闹钟。官方独立日期时间字段不再走通用灰底文本回退；时区放在详情中。日期比较使用声明时区的当天，覆盖午夜、跨年和夏令时。

用户提供的 Notion 截图显示 `@Last Friday` 与红色 `@Last Saturday 9:00 AM`。普通日期灰色与过期提醒红色采用该截图的文字颜色。根据 [Notion 官方提醒说明](https://www.notion.com/help/reminders)，未来提醒为蓝色，Today 或已过期提醒变红；普通日期不因过去而变红。相对格式的星期标签覆盖前后 2–6 天，其余回退完整日期；该边界是当前实现规则，未逐日实测 Notion 全部边界。

## 数据与能力边界

- Notion Enhanced Markdown 返回具体日期及独立时间、时区，不把 `Today` 等显示文字作为日期真相。此次实际页面读取的带时间日期未返回 reminder 字段；不能凭时间推断提醒。
- 官方方言不激活本地提醒或写入格式扩展。初轮将独立时间字段设为只读；下述补修已开放原生日期、时间和时区编辑，并使格式仅在官方节点视图会话生效。编辑保留未知属性和原日期载体。
- 原文未编辑时字节不变；不批量迁移用户文件，不修改真实知识库。
- 本地提醒服务仍依赖应用运行；本次不恢复 Notion 的云端提醒服务。

## 验证

- `npm test`：1,076 项，1,071 通过、5 跳过、0 失败。
- `npm run test:e2e -- tests/e2e/date.spec.ts tests/e2e/meeting-date.spec.ts tests/e2e/meeting-notes.spec.ts tests/e2e/notion-v2-import.spec.ts tests/e2e/inline-context-menu.spec.ts`：类型检查、生产构建及 26 项 Chrome 测试通过。使用独立临时知识库，无用户浏览器连接；未执行全量浏览器套件。
- 新增覆盖两种方言的 v2 日期、`@`、独立时间和时区、源码原文保留、日期编辑和保存重载，以及普通／未来提醒／Today 提醒／过期提醒的颜色与闹钟顺序。
- 最终补充提醒值校验，沿用本地提醒服务的 ISO 时间门槛，避免 `5` 等可被 JavaScript 宽松解析的未知值误显为有效提醒；日期和方言边界单测 12 项通过，日志 `.run/logs/date-presentation-boundary.log`。
- 已查看浏览器截图：`test-results/browser/date-Notion-date-presentat-fcc1c-while-plain-dates-stay-gray/date-reminder-states.png`；导入日期截图位于同级对应 `imported-dates.png`。
- 日志：`.run/logs/date-presentation-unit.log`、`.run/logs/date-presentation-browser.log`；桌面构建记录在 `.run/logs/date-presentation-desktop-final.log`。

桌面安装包单独输出至 `.run/date-presentation-release/`，不覆盖原 `.run/desktop-release/` 产物；当前运行的已安装应用未被关闭或替换。

## 补修：原提醒恢复与完整菜单

用户进一步指出该项原本为 reminder。只读查看 Notion 原页面，确认日期为 2026-10-24 09:00、Timezone 为 PDT，Remind 为 **On day of event**；没有修改远端内容。将用户确认的这一条本地导入记录补回 `reminder="2026-10-24T16:00:00.000Z"` 和 `reminder-offset="0"`。通过 `createVault.update` 与读取时的 `baseRevision` 写入，保留未知属性与其他全部正文；修改前另存 `.run/date-reminder-repair/Blocks-before.md`，并有知识库历史快照。日志 `.run/logs/date-reminder-repair.log` 仅记录 revision 和提醒时间，不含正文。重新加载当前已保存窗口后确认已读到提醒字段。这是针对已核实记录的恢复，不是按“有时间”批量推断。

Notdown 日期不再因含 `startTime` / `endTime` / `timeZone` 而限制菜单。补齐 10 分钟前、2 小时前选项，日期范围、Include time、Date format、Time format、Timezone、Remind 都可操作。IANA 时区通过目标日期解析夏令时，拒绝不存在的当地时间；日期、时间和时区修改会重新计算相对提醒。独立日期字段仍以独立字段保存。官方方言也可编辑原生时间／时区，显示格式仅在节点会话生效，不写入本地扩展。

导入预览对真实日期标签明确警告公开 Markdown API 不提供提醒配置；代码围栏中的日期示例不触发警告，不自动补造提醒。

补修验证：

- 全量 `npm test`：1,078 项，1,073 通过、5 跳过、0 失败，日志 `.run/logs/imported-reminder-unit.log`。
- 类型检查与生产构建通过。28 项相关 Chrome 回归初轮 27 通过、1 项测试选择器因同时匹配 End date 输入和开关失败；改用 textbox 角色后，完整日期文件 10 项复验通过，其余 18 项已在初轮通过。日志 `.run/logs/imported-reminder-browser.log` 和 `.run/logs/imported-reminder-browser-final.log`；未运行全量浏览器套件。
- 浏览器覆盖独立字段设置提醒、时间／IANA 时区修改、跨夏令时提醒重算、范围／时间开关、移除提醒、保存重载、未知属性保留，以及官方格式不落盘。已查看截图 `test-results/browser/date-Notion-date-presentat-9bd1a-eminders-in-their-IANA-zone/complete-imported-date-menu.png`。
- 补修桌面安装包输出至 `.run/reminder-editor-release/`，构建日志 `.run/logs/imported-reminder-desktop.log`；运行中的安装版程序尚未替换，完整菜单需更新安装版后生效。
