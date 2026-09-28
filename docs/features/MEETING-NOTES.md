# Meeting notes

会议笔记使用专用 NodeView：标题与日期、参与者入口、Notes / Summary / Transcript 标签、Settings 与 Start transcribing、底部摘要指令与同意提示。空笔记显示占位说明，正文仍属于单个 ProseMirror 文档；标签仅隐藏分区，不搬运或复制正文。标题可双击或从设置重命名；新建会议使用当天的明确日期值，不会随重新打开漂移。

日期使用既有 `mention-date` 标题语法，直接复用正文 mention 的 `DateMentionView` 与 `date.css`，没有独立会议日历。Notdown 下共用月历、日期范围、时间、格式、时区、提醒、键盘操作与视口定位；会议标题提醒进入既有本地提醒服务。官方方言及带官方独立时间属性的日期仅开放开始/结束日期，保留原时间字段，不写入 Notdown 扩展。修改接入既有统一撤销历史；清除、重新添加、视图切换、外部标题更新均清理旧面板。参与者入口添加 People 本地联系人的既有人物提及，不发送邀请。旧的属性式标题保留原编码，仍可从设置编辑。

摘要指令包含 Auto、Candidate Interview、Customer Call、Stand-Up，可编辑提示词、设置当前会议的默认项、从菜单隐藏或新增自定义项。语言菜单提供中英文等选择。菜单支持键盘操作、Escape 和点击外部关闭。默认项和菜单自定义作用于当前会议，不修改全局设置。

## 语法与保存边界

官方 `<meeting-notes>` 保留 title-first 标题以及 `<summary>`、`<notes>`、`<transcript>` 分区。未知属性与代码围栏原文保留，不迁移已有用户文件。

仅 `syntax.variant: notdown` 解释、写入块属性 `meeting-config`。它是 JSON 字符串，由 XML 属性转义，字段包括 `language`、`audio`、`selected`、`default`、`hidden`、`custom` 和 `prompts`。未知字段合并保留；无法解析的既有配置拒绝覆盖并显示提示。该属性补充官方格式未提供的会议 UI 属性，不新增正文块协议。`notion-markdown` 下界面配置只在当前节点视图会话有效，导入含此属性的内容保持原文，不激活扩展语义，显式扩展开关不能绕过边界。

设置变更使用文档事务、撤销及既有 createVault / baseRevision CAS 保存链路。复制正文不修改文档。Notdown 下复制块或标签链接复用 Obsidian 块锚点；尚无锚点时会新增锚点并需随页面保存。官方方言无可用位置锚点时复制页面链接并明确提示，不伪造不可解析的定位 URL。

## 服务边界

- Start transcribing 要求确认所有录音参与者同意，再选择音视频或使用已上传文件；文件经既有 `/assets` 上传接口保存。
- 转写调用 Settings 中配置的兼容服务；尚无实时麦克风录音、系统音频采集或说话人识别。
- 官方分区容器的转写结果写入 Transcript，不覆盖 Notes / Summary。旧本地容器保持其 Markdown 编码，结果追加到原正文之后。
- Generate summary 按选定指令向已配置文本服务发送当前笔记与转写内容，显式生成 Summary，不自动后台执行。
- 请求返回时会议已改变，结果只显示为可恢复文本，不覆盖新编辑；移除节点或离开页面后不回写旧视图。
- 同意提示可朗读；不包含 Notion 的演示、反馈、跨页面 Move to 或在线成员邀请。

验证使用临时知识库与独立 Chrome，见 `tests/e2e/meeting-notes.spec.ts` 和 `tests/unit/meeting-notes.test.ts`。
