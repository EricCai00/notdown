# Date / reminder 交互验证

2026-09-22。本次以用户提供的日期空态截图、[Notion 日期提醒说明](https://www.notion.com/en-gb/help/reminders)和 [@ 提及指南](https://www.notion.com/help/guides/reminders-and-mentions)为交互参考。Notdown 使用自己的 ProseMirror 节点视图与 Markdown codec，不接入 Notion 通知服务。

## 实现与边界

- `/date` 插入行内 `@Mention a date…` 空态，并打开 Today / Remind me 菜单；普通日期显示相对日期，提醒有时钟图标和蓝色／到期红色。
- 正文 `@` 支持 today、tomorrow、yesterday、今天／明天／昨天、ISO 日期、英文星期，以及 `@remind tomorrow 9am` 等明确日期时间组合。不是通用自然语言日期解析器；代码块、行内代码、邮件地址不触发日期替换。
- 日期弹层提供翻月、日历选日、起止日期、时间、提醒提前量、日期和时间显示格式。支持本地时区、UTC 和固定偏移；不提供完整 IANA 地区时区目录。
- 日历支持方向键、Home/End、PageUp/PageDown、Enter，Escape 和点击外部关闭。有效字段输入立即进入文档事务；错误日期／倒置区间不覆盖上一个有效值。
- 使用原来的 `<mention-date>` 与 CAS 保存，保留未知属性及导入标签文字（显示在日期提示中）；日期标签根据 `start` 生成。源码切换、撤销与刷新都保留日期。导入的独立提醒时间不会因编辑日期而被擅自改为相对提醒。
- 本地提醒沿用现有应用内调度，应用打开时触发，重新打开补发；没有邮件、重复提醒或应用关闭时的操作系统后台调度。

## 自动验证

- `tests/unit/date-mention.test.ts`：5 项通过，涵盖本地日期、闰年、英文／中文输入、无效日期、代码边界、Markdown 未知属性及代码围栏保留、提醒绝对时间、损坏导入属性。
- `npm run test:e2e -- tests/e2e/date.spec.ts tests/e2e/object-editing.spec.ts --output test-results/date-final-browser --reporter=list`：构建通过。弹层避让修订前 11 项全部通过；修订后 9 项通过、2 项失败，失败位于定义列表和同步块测试。5 项日期交互及 1 项提醒去重测试全部通过。独立临时知识库，Chrome 独立无界面实例，端口 4344。
- 浏览器覆盖：菜单插入、起止日期、时间／时区／提前提醒保存与刷新；源码切换；键盘选日、撤销；窄屏可达性；空态取消；导入无效日期修正；代码中输入保持字面内容；到期提醒跨刷新去重。
- 截图：`test-results/date-quick.png`、`test-results/date-calendar.png`。已检查日期空态、快捷菜单、日期区间、提醒设置与弹层布局。

完整工作区回归的日志位于 `.run/date-unit-final.log` 与 `.run/date-e2e-full.log`。最新单元测试 413 项通过、2 项失败、1 项跳过；失败位于 `tests/unit/notdown-dialect.test.ts` 的默认扩展和 Lab 预览断言。执行期间工作区的扩展分类／方言代码存在同时进行的变更；完整回归结果与上述日期定向验证分别记录，不把日期外的失败描述为全部通过。

完整浏览器回归计划执行 216 项，任务续接后原进程已结束且没有完成报告；日志最后记录 171 项通过、8 项失败，剩余 37 项未完成。因此本次只确认日期专项及上述已执行用例，不宣称全量浏览器回归通过。
