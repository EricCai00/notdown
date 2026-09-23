# 本地对象与服务

2026-09-22 方言边界修正：各方言默认值按上游规范独立定义，仅 Pandoc 自身预设沿用 Pandoc 3.11 快照。九种本地对象改为默认关闭的独立插件，在页面语法面板开启；旧正文不迁移、不删除。已实现默认规则隔离、显式启用、解析／命令／目录统一门控；尚未宣称完整上游一致性或跨端同步。详见[方言核对与插件说明](./DIALECT-CONFORMANCE.md)；下文历史说明如与之冲突，以此修订为准。

2026-09-22。逐项能力见 [对象 Roadmap](../architecture/CONTENT-OBJECT-ROADMAP.md)。implemented 表示具备该行说明的本地编辑／保存路径，不代表任意方言完整兼容或已调用真实外部服务。字符类继续作为文本处理能力展示。

## 编辑与编码

Tabs 的页签标题、正文、选中项和顺序可编辑并撤销。Web bookmark 的 URL、标题、描述及图片由用户填写。Link preview 支持 GitHub 仓库、PR/Issue、代码和 OneDrive / SharePoint 文件的实时只读预览，其他网站保留手填静态卡片；粘贴可选普通链接、行内引用或卡片。凭据、刷新策略和限制见 [Link Preview](../features/LINK-PREVIEWS.md)。Breadcrumb 使用无外框的行内页面图标、名称和斜杠分隔，悬停及键盘聚焦显示背景；路径为空时显示当前页面的父级链，有序页面 ID 路径仍优先采用，缺失／回收站页面显示不可点击的占位。自动路径不写入正文。图片的替代文字与题注分别保存。HTML embed 是禁用脚本的隔离 iframe，与 HTML block 分开。

本地标签包括 `tabs/tab`、`bookmark`、`link-preview`、`breadcrumb`、`button`、`meeting-notes`、`ai-block`、`html-embed`、`web-embed`、`figure`。它们是本地对象编码，**不全部属于 Notion 官方 Markdown 标签**。

HTML embed 可从插入菜单创建空块，点击后上传／拖放 HTML 文件或直接输入 HTML 代码，下方不提供 AI 生成区。Web embed 通过 `<web-embed url="…"/>` 保存 HTTP(S) 链接，属于 `notion_web_embed`，Notdown 默认启用；已有 Typora iframe 继续保留原编码。两种面板确认时各提交一次事务，可撤销；取消不改变块，外部更新或页面切换会关闭旧草稿。HTML 不执行脚本、不自动导入相对资源；Web 不保证目标站点允许嵌入，不提供文件上传或各平台分享链接转换。

```markdown
<tabs active="0">
<tab title="First">
Editable content
</tab>
<tab title="Second">
More content
</tab>
</tabs>

<bookmark url="https://example.com" title="Example" description="Manual metadata"/>

<ai-block prompt="Summarize the following text" model="">
Text to summarize
</ai-block>

<meeting-notes title="Meeting" audio="assets/recording.wav" language="en">
Editable notes or transcript
</meeting-notes>
```

未修改块复用原文；已编辑对象保留未知标签属性。无效或未闭合容器保留原文。各表格编码共用模型，合并操作仅在当前配置能表达跨度时启用。Raw source / Raw TeX 保留目标格式并可编辑源码，不假设浏览器能渲染全部格式。

块属性及正文元数据字段从拖动手柄菜单的 **Properties…** 打开弹窗，不再占用正文中的折叠面板。字段先保存在窗口草稿中，Save 作为一次可撤销更新提交；Cancel／Escape 丢弃草稿，块被更新或删除后禁止覆盖旧值。Tabs 的活动标签及每个 Tab 的标题分别从对应块的菜单编辑。双击行内图片、原始格式内容、提及、引文、脚注引用仍可编辑属性／源码；缩写和替换标记保留属性面板。Pandoc example list 使用 `(@label)`，引用使用 `@label`。Native div/span、Small caps 和行内注释按扩展开关解析。页面 cover 保存到 `properties.cover`；正文元数据字段编辑独立于页面外层 YAML，未知字段保留。MMD 限制见 [元数据规则](../architecture/METADATA-AND-COMPATIBILITY.md)。

## OpenAI-compatible 服务

Settings → OpenAI-compatible services 配置 API endpoint（例如 `https://api.openai.com/v1`）、Text model、Transcription model 和 API key。模型 ID 由服务商提供；应用未硬编码模型。端点接受 HTTPS 或本机 HTTP，不含凭据、查询参数或 fragment。

- Generate：POST `/chat/completions`，非流式，发送 prompt、当前块文字和模型。结果是可编辑段落，可撤销。
- Transcribe：POST `/audio/transcriptions`，multipart 文件及模型，可选 language；音频必须位于本知识库 assets，最大 25 MB（应用上传限制另为 20 MB）。结果是可编辑段落。
- 请求期间编辑过该块时，结果仅显示在状态区，不替换新内容。失败保留原文。最多两个并行请求，120 秒超时。

设置保存到当前知识库 `.notdown/services.json`，API key 是本地明文字段，不进入页面 Markdown、浏览器持久设置或 GET 设置响应。空密码框保留旧密钥，勾选 Remove saved API key 才清除。备份知识库时需按自己的密钥管理方式处理该文件。仅点击对应动作时发送相应文字或音频。

协议依据：[Chat Completions](https://platform.openai.com/docs/api-reference/chat/create)、[Audio transcriptions](https://platform.openai.com/docs/api-reference/audio/createTranscription)。兼容服务可能只支持其中一个接口；自动化测试使用模拟服务，真实账号由用户在应用中配置。

## 本地执行边界

### Button

参考 [Notion Buttons](https://www.notion.com/help/buttons) 的点击执行、齿轮配置、多步骤动作与四种插入位置；外观参考[官方配置截图](https://www.notion.com/help/guides/automatically-generate-blocks-pages-with-buttons)。Notdown 的 `<button>` 是 `notion_button` 插件编码，不是 Notion 官方 Enhanced Markdown 自动化格式。

按钮正文只显示名称与可选 emoji，不再显示另一个 Run button 控件。悬停／键盘聚焦显示齿轮，Properties… 也打开同一内联配置。名称、图标和样式实时预览；Done 提交，Cancel／Escape 撤销配置草稿，外部更新不会覆盖成旧值。支持动作增删、复制、上下移动，最多 50 步。

`actions` 为 XML 转义后的 JSON 数组；已有 `action/target` 兼容读取，存在 `actions` 时优先，非法 JSON 不回退执行旧动作。未修改原文逐字保留，修改后仍保留未知标签和动作字段。

```markdown
<button label="New task" icon="＋" variant="default" actions="[{&quot;type&quot;:&quot;insert-blocks&quot;,&quot;position&quot;:&quot;below&quot;,&quot;content&quot;:&quot;- [ ] New task&quot;}]"/>
```

- `insert-blocks`：`content` 是按当前页面方言解释的 Markdown，配置界面提供源码输入与预览；`position` 为 `above/below/start/end`。多个同位置步骤保持配置顺序；解析后检查模板边界，不允许未闭合代码／容器吞并邻接内容。
- `confirmation`：`message` 为纯文本。所有确认通过后统一提交正文，任一取消则整组不修改正文。等待时页面发生修改则终止，重新点击才能重试。
- `open-url`：`target` 为 `#page/<id>` 或 HTTP(S) URL，只能作为最后一步；本地页走现有收取输入和保存导航，外链新标签打开并提供浏览器拦截时的链接回退。
- 旧 `insert-text` 保持纯文本语义，旧 `toggle-tasks` 保持当前页待办反转行为；二者只为兼容已有配置，不冒充 Notion 原生动作。

一次执行对应独立撤销记录，仍经页面 `baseRevision`／CAS 保存。只读预览不能执行或改配置。不支持数据库增改、通知、邮件、Webhook、变量公式、云端联动或原生块模板编辑器；样式当前提供默认描边、灰底和蓝底。

### 日期提醒与同步块

日期提及的 reminder 为 ISO 日期时间，例如 `<mention-date start="2026-10-01" reminder="2026-10-01T09:00:00+08:00">Review</mention-date>`。应用打开时检查，重新打开时补发未确认提醒；系统通知需在 Settings 授权。它不是后台操作系统任务。

Synced block 的源使用 `<synced_block id="shared">…</synced_block>`，引用 URL 为 `#page/PAGE_ID#block=shared`。Refresh from source 更新快照并记录 revision；Publish to source 携带该 revision，来源改变时生成可恢复 CAS 冲突，不强制覆盖。Toggle live refresh 每四秒检查本地源页，本地编辑后暂停自动替换。实时协作和跨设备传输未实现。

Pandoc 引文预览读取本知识库 bibliography，可选本地自包含 CSL，使用已安装 Pandoc 的沙箱 citeproc。不执行任意 filter，不下载 CSL；失败保留引用。HTML 导出保留引文标记，不等待异步 citeproc。

`sourcepos` 提供块级行范围；`rebase_relative_paths` 处理具有 sourcePath 的 Markdown 链接／图片；`markdown_in_html_blocks` 支持 Div 容器；`gutenberg` 用于纯文本导出。这些本地执行路径不等同于 Pandoc 所有 reader/writer 的完整行为。
