# 附件 UUID、页面删除清理与提醒导入核查（2026-10-26）

[English](ATTACHMENT-UUID-CLEANUP-2026-10-26.md) · **简体中文**

## 实现范围

- 新上传、Markdown 文件夹导入和 Notion 下载共用 `assets/<UUIDv5>.<扩展名>`，格式为带连字符的 `8-4-4-4-12`。UUID 由附件专用身份前缀、内容 SHA-256 与规范扩展名确定，继续跨入口去重。共享 UUID 计算函数重构不改变既有页面 UUID。
- 保留原文件名、未知元数据、目标字节校验与冲突恢复；旧哈希、UUID、批次、`notion-` 和嵌套路径继续读取，不自动重命名或重写旧正文。Markdown 导入的格式身份更新，避免把旧命名批次的已完成标记误用于新附件路径。
- 移入应用 Trash 不清理附件，恢复页面不破坏原引用。彻底 Delete 一个已在 Trash 的页面及子树后，只检查这些页面引用过的附件；其他页面（包括 Trash）、图标、封面、属性、冲突草稿及非页面全局元数据仍保护文件。不会清扫无关的已有孤立上传。
- HTML/SVG/CSS 静态依赖按相对路径递归保护。动态脚本、无法可靠解析的来源和依赖、符号链接或并发版本变化阻止清理并提示。
- 回收前保存附件原字节及未知登记信息到 `.history/deleted-assets/`，重新检查页面／冲突版本和附件字节，再使用与页面相同的系统回收站适配器。成功后以 metadata CAS 移除对应资产条目，不覆盖其他字段。返回 `deletedAssets` 和 `warnings`，界面显示清理数量或保留原因。
- 多文件回收不是原子事务；页面或附件操作中断可能留下未清理附件。未保存的其他窗口草稿无法纳入关联分析，保留恢复副本；不做永久删除回退或强制重试。

## Notion reminder 证据与边界

核对实际导入批次的原始 Block API 归档：原 reminder 的 `mention.date` 只有 start/end/time_zone，`annotations.color` 为 `default`，`plain_text` 是 ISO 时间，href 为 null；完整 JSON 中未找到 reminder/alert/notification 字段。抽取结果在本地 `.run/logs/notion-reminder-evidence.json`，没有重写实际知识库。

公开 API 的日期对象与官方 SDK 类型也只有这些日期字段。参见 [日期属性](https://developers.notion.com/reference/page-property-values#date)、[官方 SDK common.ts](https://github.com/makenotion/notion-sdk-js/blob/main/src/api-endpoints/common.ts)。不能仅凭时间或客户端红色推断提醒。

需要区分公开集成 API 与客户端内部数据。历史非官方客户端 [notion-py](https://github.com/jamalex/notion-py/blob/master/notion/collection.py) 的 `NotionDate.from_notion` 明确读取内部 date 对象的 `reminder`。这说明内部数据存在过恢复路径，不证明当前版本的私有接口仍可直接使用；本次没有调用私有接口、读取登录凭据或接入该导入方式。

当前导入对话框在预览前直接提示提醒配置缺失；未知块恢复后的日期同样触发预览警告，代码示例不触发。导入后的日期菜单可按原页设置补回本地提醒；重复提交同一快照不覆盖已修复的本地提醒。不会将所有带时间的日期自动转换成 reminder。

### 后续实测：当前客户端本地缓存可读取提醒

2026-10-26 按用户要求只读打开本机 Notion 的 `notion.db`（Node SQLite `readOnly: true`），在同一事务快照中读取指定页面的直接子 block，没有读取 Cookies、登录凭据或修改数据库。普通日期对象没有 reminder，目标 datetime 对象仍有明确的 `reminder: { unit: "day", value: 0, time: "09:00", defaultTimeZone: "America/Los_Angeles" }`，其 start_date 为 2026-10-24、start_time 为 09:00。

对应 text block 为 `402e9d4d-a1d7-806a-99b4-f89e6f2799e2`，缓存 version 为 117、last_edited_time 为 `2026-10-26T15:53:59.832Z`；字段位于 `properties.title.4.1.0.1.reminder`。局部导出 `.run/notion-reminder-field.json` 包含源 page/block 身份、缓存版本与提取时间；可重复只读提取脚本为 `.run/read-notion-reminder-cache.mjs`。没有导出整个数据库或无关页面正文。

这一实测证明当前本机客户端缓存仍可提供真实 reminder，不再只是历史非官方客户端的线索。它不证明公开 API 提供该字段，也不证明缓存与此刻云端完全一致；本次未重取云端数据、未调用私有 HTTP 接口、未修改本地知识库或 Notion 页面，尚未接入自动导入。后续补充导入需要校验缓存新鲜度、原页／原块身份和日期位置，不能仅凭相同日期覆盖本地修改。

### 后续接入

同日后续已实现 API + SQLite 日期补充，原始证据与上面“尚未接入”的时点分开记录。当前导入流程、缓存更新方式及其他块字段调查见 [Notion SQLite 审计](../audits/NOTION-SQLITE-2026-10-26.zh-CN.md)，用户操作见 [Notion 导入](../features/NOTION-IMPORT.zh-CN.md)。既有本地页不自动覆盖。

## 验证

- 全量 `npm test`：1,083 项，1,078 通过、5 跳过、0 失败。日志 `.run/logs/asset-uuid-cleanup-unit.log`。
- 类型检查、生产构建和桌面构建通过。定向资产／页面／导入单测 25 项以及新增清理边界单测 5 项通过。
- Chrome 相关回归共覆盖 29 项：首轮新增测试语法错误修复后重跑，28 通过、1 项既有附件筛选断言因新增共享附件而不再唯一。改为按名称精确筛选后，附件文件 7 项复验通过，剩余 22 项已在上一轮通过。复验用例全部完成后隔离测试服务退出停滞，核对进程身份后只结束该测试服务，runner 正常退出并报告 7 passed。日志 `.run/logs/asset-uuid-cleanup-browser.log`、`.run/logs/asset-uuid-cleanup-browser-final.log`、`.run/logs/asset-uuid-cleanup-attachments-final.log`。未运行全量浏览器套件。
- 测试使用临时知识库、独立 Chrome 和专用回收站替身，覆盖独占／共享附件、Trash 和恢复、子树、未知属性与字节恢复、冲突草稿、HTML 依赖、全局元数据、符号链接及回收失败。没有以用户文件测试删除，也没有运行真实系统回收站验收。
- 桌面安装包：`.run/attachment-uuid-release/Notdown-Setup-0.1.3-x64.exe`。日志 `.run/logs/asset-uuid-cleanup-desktop.log`。当前已安装程序未替换，新命名与自动清理需安装后生效。
