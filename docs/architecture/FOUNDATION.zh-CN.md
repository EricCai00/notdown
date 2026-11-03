# 当前基础：ProseMirror 连续文档 + Markdown 文件内核

[English](FOUNDATION.md) · **简体中文**

2026-09-12 更新。根据用户对实际编辑体验的反馈，早期 Vditor 方案已被替换。逐块激活的 Vditor 无法满足每个列表项独立操作、嵌套子树拖动、连续选区/撤销，以及链接始终保持可视化的要求。继续在外围修补会形成两套选区和历史。

当前直接使用 ProseMirror 的 model/state/view/history/schema-list/inputrules；列表层级参考 AFFiNE，页面提及参考 AppFlowy。自有 Markdown codec 保留源切片和扩展，PM 树仅存在于编辑过程中，持久化仍只有 Markdown 与 YAML。没有转用 Yjs 或其他二进制文档作为权威来源。Vditor 依赖和旧编辑器模块已移除。

原有上游 clone 的格式比较仍成立，因此保留下面的初始调研作为历史；其中 Vditor 的实际依赖和已实现边界仅描述旧版。当前模块、证据和限制以 [交互参考](../reference/NOTION-REFERENCE.zh-CN.md) 和 [README](../../README.zh-CN.md) 为准。

---
# 初始选型记录（历史）：Vditor/Lute

本轮选择思源作为页面、块和本地内核设计的主要参考，实际编辑器复用同一 B3log 生态的 MIT 组件 Vditor 4.0.0（其 Markdown 引擎为 Lute），在独立的 `markdown-workbench` 中实现 Markdown vault。这不是直接 fork 思源或复用其 Protyle、同步内核、数据库引擎；当前仓库中的上游 clone 保持独立。

用户最重要的约束是「人和 AI 都能直接读写的 Markdown 源文件」。所以选型以真实持久化格式为优先级，不能仅凭 Notion 风格 UI 或能导出 Markdown 判定适合。

## 本地 clone 对比

| 候选 | 可借鉴/复用 | 与核心要求的距离 | 选择 |
| --- | --- | --- | --- |
| SiYuan | 父子页面、块、属性、内核 API/MCP、本地文件组织 | `.sy` 是 Lute AST JSON；不是 Markdown 正文。完整应用 AGPLv3 | 主要架构参考；不迁移 `.sy` 内核 |
| AFFiNE / BlockSuite | 块拖动、斜杠、数据库、白板、扩展转换器；BlockSuite MIT | 持久化为 Yjs 二进制更新；Markdown 是 snapshot 转换；侧栏树为文件夹组织 | 强力块编辑备选；本轮不整库 fork |
| AppFlowy | Flutter 多端、真正的父子页面、块编辑和数据库 | Flutter + Rust + Collab/yrs + RocksDB；Markdown 为导入导出 | 原生 Flutter 路线的备选，当前重构成本高 |
| Anytype ts + heart | 对象、属性、关系、集合视图、去中心化设计 | 独立对象/同步模型；当前 clone 使用 Any Source Available License | 借鉴属性视图，暂不作为代码基础 |
| AnyBlock | 公开格式、转换工具、可读交换结构；MIT | 当前 README 定义它为 Anytype 交换格式项目，非独立笔记 UI；v2 是 JSON 交换格式 | 可作为后续导入导出适配参考 |

## 可复查的本地证据

以下路径相对于工作区 `D:\Workspace\note-app`，行号来自本轮检查，不代表上游今后版本。

- 思源 `.sy` 的定义：`siyuan/docs/SY-FORMAT.md:11` 明确正文是 Lute AST 序列化 JSON；`:27` 描述 API/MCP/CLI 与索引维护。`siyuan/kernel/model/file.go:1303` 通过 `Md2BlockDOM` 转換 Markdown；`:1195` 经 `filesys.WriteTree` 写树。`siyuan/LICENSE:1` 为 AGPLv3。思源提供这些模型和 API，不能由此推断其 `.sy` 就是 Markdown。
- AFFiNE 的底层：`AFFiNE/blocksuite/framework/store/src/model/store/store.ts:191` 描述 store 基于 Y.Doc；`.../store/crud.ts:75` 创建 Y.Map。`AFFiNE/packages/common/nbstore/README.md:23` 的正文载荷是 `bin: Uint8Array`。`AFFiNE/blocksuite/affine/shared/src/adapters/markdown/markdown.ts:254` 和 `:325` 是 snapshot 与 Markdown 的双向转换。
- AFFiNE 层级：`AFFiNE/packages/frontend/core/src/modules/organize/entities/folder-node.ts:27` 仅为 folder 枚举子节点；`:107` 拒绝非 folder 父节点。这个侧栏模型仍需改成页面父子树。
- AFFiNE 许可：`AFFiNE/LICENSE:5` 将 backend 与 common/native 指向 backend/server/LICENSE；其包含 EE 条款及 CE 的 MPL2 部分。`AFFiNE/blocksuite/framework/store/package.json:11`、`blocksuite/affine/shared/package.json:11` 声明 MIT，不能把整个服务端概括为 MIT。检查提交 AFFiNE `b4331cbe1e`。
- AppFlowy 持久化：`AppFlowy/frontend/rust-lib/collab-integrate/src/collab_builder.rs:288` 安装 RocksdbDiskPlugin，`:389` 写入 `encoded_collab.doc_state`。`AppFlowy/frontend/appflowy_flutter/lib/shared/markdown_to_document.dart:13` / `:27` 是 Markdown 导入/导出；`frontend/rust-lib/flowy-folder/src/manager_observer.rs:183` / `:185` 读取父视图及其子视图。`AppFlowy/LICENSE:1` 为 AGPLv3。检查提交 `5cf3a365d`。
- Anytype 与 AnyBlock：`anytype-heart/README.md:2` 标识 heart 为中间层，`anytype-heart/LICENSE.md:7`、`anytype-ts/LICENSE.md:7` 列出使用范围；`any-block/README.md:3` 定义交换项目，`:5` / `:7` 区分 protobuf v1 与可读导入导出/API v2，`any-block/LICENSE.md:1` 是 MIT。
- 本项目直接依赖：`markdown-workbench/node_modules/vditor/package.json` 的版本为 `4.0.0`、许可为 MIT。实际使用范围是编辑器组件，正文存储、扩展渲染和同步冲突逻辑是本项目新代码。

## 为什么复用 Vditor

Vditor 的公开接口以 Markdown 为输入/输出，已有即时渲染（类似 Typora）、所见即所得和源码分屏模式，满足「默认不用打开源码、仍可编辑源码」的起点；Lute 是同一生态的结构化 Markdown 引擎。这比把 CRDT JSON/二进制文档的导出结果再镜像成 `.md` 更直接。[Vditor 官方仓库](https://github.com/Vanessa219/vditor)、[Lute 官方仓库](https://github.com/88250/lute)。

BlockSuite 官方文档也确认 store 原生建立在 Yjs 之上，因此其 Markdown adapter 的存在不能消除持久化模型差异。[BlockSuite store](https://blocksuite.io/guide/store)。独立的 appflowy_editor 许可也与 AppFlowy 整体不同，目前为 AGPLv3/MPL2 双许可；若以后转向 Flutter 应单独评估。[appflowy_editor LICENSE](https://github.com/AppFlowy-IO/appflowy-editor/blob/main/LICENSE)。

## 实现边界与后续门槛

当前最先落地的是 Markdown vault、父页/属性模型、Notion 风格界面、源码/可视编辑、源码保留的块操作、双链/子页/两栏、派生大纲和视图、HTML 导出、版本冲突副本。分栏与双链由本项目 parser rules 解释，不能宣称是未修改 Vditor 的原生能力。

完整多设备云同步仍需要身份验证、附件传输、离线队列、删除/重命名冲突和跨设备测试。冲突 fork 能保护数据，但不等同于完成 Git 或成熟 CRDT 协同。MyBase 的真实协议已确认，元数据导出已实现；Query 和双向同步尚未接入。独立的标准 stdio MCP 已通过真实客户端读写和冲突测试。Protyle 的细粒度拖动体验、完整数据库查询和移动端打包仍需后续逐项实现，不能因参考产品名称就视为已完成。
