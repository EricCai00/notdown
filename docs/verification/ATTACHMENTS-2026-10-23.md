# 附件库首版验证（2026-10-23）

范围：桌面／浏览器应用的附件库。入口为侧栏 Attachments、页面菜单 Page attachments 和插入菜单 From attachments。使用方式与边界见[媒体与嵌入](../features/MEDIA-AND-EMBEDS.md#附件库)。

## 实现范围

- 扫描现有本地附件与子目录；按名称、路径、类型筛选并排序，预览、下载、复制路径。
- 上传文件的原名称、类型、大小与时间登记在 `metadata.json.assets`；保留其他元数据、旧文件路径和页面 revision。
- 从真实方言解析树和有效页面属性提取引用，涵盖图片、链接、媒体、嵌入、封面、图标及数据库记录文件字段；代码示例不算引用。
- 标识缺失路径与 Trash 中的引用；点击正常页面引用可导航。复用只增加正文引用，不复制附件。
- 上传与共享 JSON 更新经过知识库队列和本地锁，外部修改导致冲突时保留文件、外部版本与恢复提议。

## 验证结果

- `npm test`：947 通过、5 跳过、0 失败。此数字包含当前工作目录的全部单元／服务测试，不仅是附件测试。
- 附件专项测试 9 项：覆盖元数据持久化、旧文件和子目录扫描、代码排除、缺失文件、回收站、并发上传、外部元数据冲突、目录链接隔离和 HTTP 服务。
- `npm run build -- --outDir .run/attachments-dist`：TypeScript 检查和 Vite 构建通过。
- 独立 Chrome、端口 4366、临时知识库：`attachments.spec.ts`、`media.spec.ts`、`sidebar-layout.spec.ts`、`embeds.spec.ts`，共 22 项通过。未运行其余浏览器测试文件。
- 实际截图检查桌面双栏与 480 px 窄屏：预览、操作按钮、引用信息和滚动区域正常，无横向溢出。
- 浏览器验证包含原文件名重开保留、图片解码、同一附件复用、File 卡片语义、普通 Markdown 链接回退、源码光标位置与未保存输入，以及旧后台报错后刷新恢复。

本地日志为 `.run/logs/attachments-unit-final.log`、`attachments-unit-safety.log`、`attachments-build-final.log`、`attachments-e2e-verified.log`；截图位于 `test-results/attachments-verified/`。临时知识库由测试服务器创建并清理，未使用用户 `vault/`。

## Notion 导入接入附件库

同日补充：Notion 下载器把可获取的文件名和类型传给 `importBatch`，提交时登记 `metadata.json.assets`。默认导入图片、音视频、PDF、普通文件、邮件附件、数据库 Files、封面和图标到同一个 Attachments 入口；字节内容仍使用原有哈希路径去重。相同已完成批次可以补齐旧登记，保留本地页面修改与未知元数据；文件丢失或被替换时停止补登，不重建用户删掉的文件。

- 全量 `npm test`：955 通过、5 跳过、0 失败。
- Notion、数据库 Files、附件与 Markdown 导入专项：26 项通过，覆盖空文件、下载文件名、签名参数排除、旧批次补登及原始归档保留。
- `npm run build -- --outDir .run/notion-attachments-dist`：通过。
- 隔离 Chrome、端口 4368：`notion-v2-import.spec.ts`、`notion-import.spec.ts`、`attachments.spec.ts` 共 12 项通过。实际查看导入附件的预览、原名称和引用位置截图。
- 使用模拟 Notion API 和临时知识库；未对用户现有知识库执行批量迁移，未用真实 Notion token 验证在线导入。

日志位于 `.run/logs/notion-attachments-*.log`，截图位于 `test-results/notion-attachments/`。原有单附件与整批大小限制仍适用，下载失败保留来源并警告。

## 当前边界

引用统计仅涵盖已保存页面及有效属性，不包含历史快照、其他窗口未保存草稿或附件内部依赖。未知源码会提示检查不完整；零引用不代表文件可安全删除。本版未提供删除、自动清理、重命名、去重或手机附件库界面。未登记旧文件的原名称显示为未记录。
