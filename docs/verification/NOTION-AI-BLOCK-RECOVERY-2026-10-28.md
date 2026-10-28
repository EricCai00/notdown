# Notion AI block 缓存恢复与 Button 调查（2026-10-28）

## 已实现范围

Notdown 方言开启已有桌面缓存选项时，可从只读 SQLite 恢复已识别的 custom v3 AI block 提示词和完整的受支持输出子树。使用现有 `ai-block`，不添加重复正文语法。官方 Notion Markdown、关闭补充、旧缓存或不完整子树均不应用自定义恢复。

公开 Block API 提供当前块身份、类型和编辑时间；缓存限定同账户／工作区，子块要求父指针一致，最多 1,000 个块、30 层、10 MiB。API 仅提供分钟时间时只能核对编辑分钟，不能证明跨来源原子一致。未知配置、提示词提及、未知输出节点与缺失子块保留占位，继续原有公开 API 子内容恢复。采用的原记录与可用 CRDT 原数据进入批次归档，参与身份；不覆盖已编辑的本地副本，不自动执行 AI 或按钮。

实现：`server/notion-private-blocks.ts`、`server/notion-desktop-cache.ts`、`server/notion-block-import.ts` 和 `server/notion-import.ts`。使用说明见 [Notion 导入](../features/NOTION-IMPORT.md)。

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

后续资源可用时，新增 AI 导入 Chrome 用例通过，验证缓存 prompt／输出在预览、提交、重开后仍为可编辑 AI block，且不自动生成；官方方言继续保留 unknown。全量单元测试也通过（1,190 通过、5 跳过），实际打包程序的 11 项桌面测试通过，已安装版本更新为 0.1.6。普通 Button 和真实云端 token 整链验收仍保留上述限制，详见 [发布验证](RELEASE-0.1.6-2026-10-28.md)。
