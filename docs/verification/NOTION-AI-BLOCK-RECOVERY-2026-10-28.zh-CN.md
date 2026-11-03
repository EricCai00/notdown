# Notion AI block 缓存恢复与 Button 调查（2026-10-28）

[English](NOTION-AI-BLOCK-RECOVERY-2026-10-28.md) · **简体中文**

## 已实现范围

Notdown 方言开启已有桌面缓存选项时，可从只读 SQLite 恢复已识别的 custom v3 AI block 提示词和完整的受支持输出子树。使用现有 `ai-block`，不添加重复正文语法。官方 Notion Markdown、关闭补充、旧缓存或不完整子树均不应用自定义恢复。

公开 Block API 提供当前块身份、类型和编辑时间；缓存限定同账户／工作区，子块要求父指针一致，最多 1,000 个块、30 层、10 MiB。API 仅提供分钟时间时只能核对编辑分钟，不能证明跨来源原子一致。未知配置、提示词提及、未知输出节点与缺失子块保留占位，继续原有公开 API 子内容恢复。采用的原记录与可用 CRDT 原数据进入批次归档，参与身份；不覆盖已编辑的本地副本，不自动执行 AI 或按钮。

实现：`server/notion-private-blocks.ts`、`server/notion-desktop-cache.ts`、`server/notion-block-import.ts` 和 `server/notion-import.ts`。使用说明见 [Notion 导入](../features/NOTION-IMPORT.zh-CN.md)。

## 本机样本

重新读取 Test / Blocks：AI 配置包含 `ai_block_configuration_menu={type:custom,version:3,autofillInstructions:[["hi"]]}`，`content` 指向文字为 `Hi!` 的子块。实际只读缓存与转换函数恢复出 prompt `hi`、结果 `Hi!`。此转换验证使用从缓存构造的模拟 Block API 时间，不是新 token 的真实云端导入验收。连接器重新读取仍将 AI 和 button 返回为 unknown。

Button 原界面可读取名称 `Insert block`、动作 `Insert blocks below button` 和模板 `Inserted block`；SQLite 只有 `automation_id`，相同 ID 在 `automation`、`workflow` 及已检查的 `records` 中均缺失。打开设置后仍未取得缓存定义，因此没有实现普通 button 的自动动作迁移。不得把来源占位描述成已恢复按钮。

本次 HTML 导出省略了该 button 和当时的空 AI block。没有据此判断已生成 AI 结果在所有 HTML 导出中的行为。后续页面内结构化读取仍需真实验证；此次 Chrome 调试连接无法附加，原生开发工具窗口控制也发生超时，未取得可用于通用转换的 action JSON。

## 验证与限制

- 新增四项单元测试，覆盖实际配置形状、空输出、XML 边界、旧缓存、缺失／循环子树、未知配置／mark、账户隔离、SQLite 字节不变、CRDT 保留、方言／关闭补充、原始归档、批次身份和已有本地编辑保护。与已有提醒测试合计 9 项通过。
- 全量 `npm test`：1,189 通过、5 跳过，另有一项既有 child-page-settings 测试在临时目录清理时出现 Windows unlink 错误；该文件单独重跑 9 项通过。没有修改该功能来规避清理错误。
- `npm run build` 通过。后续仅服务端 CRDT 原数据保留与测试细化，另做类型检查和定向单元验证。
- 已添加隔离 Chrome 用例，验证预览／提交／重开后 prompt 和输出、不自动生成及官方方言边界。首次相关用例组在浏览器 context 创建阶段超时；单独新用例重试 60 秒仍在 context 创建阶段超时，未进入断言，不能算浏览器验收通过。机器当时可用物理内存不足 100 MiB；终止本次测试启动的浏览器后仍不足 500 MiB，没有关闭用户应用或其他任务进程。
- 未更新已安装桌面程序，未修改用户知识库或 Notion 源内容。普通 Button 完整迁移与真实云端 token 导入仍未验收。

本地日志在 `.run/logs/notion-private-*2026-10-28.log`、`.run/logs/notion-ai-live-conversion-2026-10-28.json`；实际 HTML 导出在 `.run/logs/notion-blocks-html-2026-10-28.html`。这些日志不作为仓库测试输入。

## 0.1.6 发布复核

后续资源可用时，新增 AI 导入 Chrome 用例通过，验证缓存 prompt／输出在预览、提交、重开后仍为可编辑 AI block，且不自动生成；官方方言继续保留 unknown。全量单元测试也通过（1,190 通过、5 跳过），实际打包程序的 11 项桌面测试通过，已安装版本更新为 0.1.6。普通 Button 和真实云端 token 整链验收仍保留上述限制，详见 [发布验证](RELEASE-0.1.6-2026-10-28.zh-CN.md)。

## 0.1.7：真实连接的 AI 子块读取拒绝

随后使用本机已保存的真实连接，只读预览 Test / Blocks，复现第 15 个 API 请求返回 HTTP 400：AI block 在公开响应中标为 `has_children: true`，但 `/blocks/<AI block ID>/children` 返回 `validation_error`，说明当前连接类型不支持 `ai_block`。0.1.6 在发现后代页面的阶段中止，尚未进入缓存恢复；原测试样本错误地设置了 `has_children: false`，浏览器用例还排除了后代页面，未覆盖真实请求。

修复只对首批子块请求中这一明确的类型不支持错误降级为警告，继续可读 Markdown 与已核验缓存恢复。不扩大到其他必需读取的 400，不允许子块分页中途的 400 生成部分预览。错误正文至多读取 16 KiB，只提取白名单错误码和严格匹配的块类型；普通失败提示请求路径，不显示上游消息、URL 或凭据。API 错误码的含义参见 [Notion 状态码文档](https://developers.notion.com/reference/status-codes)。

修复后的同一真实连接预览成功，返回 2 个页面，AI 提示词和输出从匹配缓存恢复，普通 Button 继续保留来源占位；还恢复了一个已核验提醒。此次真实预览关闭附件下载，未向用户知识库提交副本，不构成附件、整库迁移或所有 AI 配置的验收。

验证：全量单元测试 1,192 通过、5 跳过；修正后的隔离 Chrome 用例组 10 项通过，包含实际导入弹窗在 AI 子项被拒绝后仍到达 Ready、显示警告、允许提交，以及 AI prompt／输出重开后保留、官方方言边界和保存失败保护。测试样本现在与真实响应一致，明确返回 AI 子项 HTTP 400。0.1.7 的 TypeScript、Vite、Electron 与 NSIS 构建通过，实际打包程序的 11 项桌面测试通过。

通过应用菜单正常退出 0.1.6 并备份原程序后，NSIS 静默升级退出码为 0，已安装产品版本为 0.1.7.0。安装后的 exe 与 `app.asar` SHA-256 均与经过桌面测试的产物一致，知识库选择配置和加密保存的连接 token 哈希不变。未通过此次诊断向用户知识库提交导入副本。

本地证据位于 `.run/logs/notion-http400-*`，不进入源码 Git；不保存明文连接 token。

## 0.1.8：Button 的专用块复制数据

继续只读调查后，公开连接器仍返回 Button unknown，SQLite 中的自动化、动作模板和关联 records 仍缺失；Button 的 CRDT 只有空标题，没有动作定义。新发现是 Notion 的块复制通道：选中来源按钮再 Ctrl+C，Windows 剪贴板中的 `text/_notion-blocks-v3-production` 包含完整的 `blockSubtree`，以及 `automation`、`automation_action` 和模板子块；普通 HTML 部分只有来源标记。此通道与原 HTML 导出不同，早期“未取得动作定义”的结论仅适用于当时检查的接口与缓存。

实际样本的自动化名称为 `Insert block`，触发器为 button，唯一动作是 `duplicate_blocks`，其空 text 容器持有文字 `Inserted block` 的模板子块。与 Notion 的编辑界面对照，动作位置为 below button，模板只显示该文字。未执行 Notion 来源按钮，也未修改其动作。

新增桌面弹窗的显式 **Read copied Notion blocks**，只提取已复制的 Notion 专用格式；不后台采集剪贴板或登录凭据，不写回剪贴板。快照只存在当前弹窗，清除、重读、切换输入会使旧预览失效，关闭弹窗即清除。恢复只用于 Notdown 方言且独立于 SQLite 补充开关。API 身份、类型、父级与编辑时间，以及复制数据中的工作区、自动化和模板父子链必须通过核对。

当前转换范围是完整的静态“在按钮下方插入块”流程，可保留动作顺序和完整受支持模板；未知动作、位置、条件、变量、格式、缺失／循环模板或冲突整体保留占位。采用现有本地 `button` 和 `actions` 协议，不自动执行、不迁移云端自动化服务；采用记录归档到 `copied-blocks/<buttonId>.json` 并参与批次身份。页面复制快照最多 5 MiB，模板最多 1,000 块、30 层，动作最多 50 步。

以实际复制数据和本机真实连接进行只读预览，成功返回 2 页，恢复 Button、模板和来源归档，AI block 同时保持恢复。此次真实预览关闭附件下载，未向用户知识库提交副本。自动化测试使用去除真实身份的同形 fixture。

验证结果：全量单元测试 1,196 通过、5 跳过；相关独立 Chrome 回归 15 项通过，包括复制补充读取／清除、预览失效、导入后点击执行、单步撤销、保存重开，以及 AI、连接和导入进度回归。0.1.8 的 TypeScript、Vite、Electron 和 NSIS 构建通过；实际打包程序的 12 项桌面测试通过，新增 IPC 用例用测试进程内的剪贴板替身，验证只有显式读取才调用桥接、来源页自动填入、关闭弹窗清除快照，不改系统剪贴板。

旧版正常退出并备份后，安装程序退出码为 0，本机产品版本为 0.1.8.0；exe 和 `app.asar` 的 SHA-256 与经过测试的产物一致，知识库选择配置与加密 token 哈希不变。程序更新不替换已有笔记中的占位；需读取复制数据并重新预览，导入新副本。

本地调查和验证日志为 `.run/logs/notion-button-*`，真实复制数据不进入 Git。
