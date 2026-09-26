# 内容对象与节点身份

更新：2026-09-24。

内容节点直接使用内容目录的完整 object ID 作为 ProseMirror 节点名。`resolveContentObject(node)` 直接查询 `node.type.name`，不再维护另一份“节点名到内容类型”的映射表。节点 JSON 只是内存中的编辑结构；正文仍以 Markdown 文件为真相。

| 内容对象 / 节点名 | Markdown 编码或含义 |
| --- | --- |
| `block.paragraph` | 段落 |
| `block.quote` | 引用块 |
| `block.definition_list_item` | 一个术语及其全部定义；定义内的段落、列表、代码保留自身块身份 |
| `block.heading` / `block.toggle_heading` | 普通标题 / 折叠标题 |
| `inline.internal_link` | 页面提及、Wiki 引用、位置引用 |
| `inline.mention_person` | `<mention-user>` |
| `inline.date_or_reminder` | `<mention-date>` |
| `inline.mention_page_or_data_source` | 数据库 / 数据源提及 |
| `inline.link` | 本地行内链接卡片 `<mention-link>` |
| `block.audio` / `block.video` / `block.pdf` / `block.file` | 对应媒体块 |
| `block.diagram` / `block.block_comment` / `block.file_transclusion` | 图表、块注释、文件引入 |
| `metadata.yaml_front_matter` / `metadata.pandoc_title_block` | 文档属性块 |
| `block.unsupported` | 未支持内容及其可恢复原文 |

## 结构节点与格式标记

表格行、列表分组、分栏容器等使用 `structure.*` 名称，例如 `structure.table_row`、`structure.bullet_list`。脚注内文和保留的行内源码也是组成内容对象的结构，不另增产品内容类型。`doc`、`text` 保留引擎基础名称。

定义列表由 `structure.definition_list` 容纳多个 `block.definition_list_item`；每项包含一个 `structure.definition_term` 和一个或多个 `structure.definition_description`。定义正文容器内的块可独立操作，术语行的手柄则操作整项。

粗体、链接等 mark，以及实体转义、emoji 等文字处理能力，不会为命名一致而改成独立节点。它们继续使用富文本标记或文字，内容目录通过标记解析器识别其语义。

内容身份由节点类型确定，而不是由调用者传入的显示上下文改写。例如 `inline.image` 放在独立段落中仍是该节点；显式图片块使用 `block.image_block`。`block.child_page` 对应明确子页角色，普通 `<page>` 引用使用 `block.link_to_page`；页面所属关系仍由知识库 metadata 决定。

## 编码与编辑实现

`src/document/node-identity.ts` 将 codec 的表示种类连接到规范节点名。普通编辑代码使用 `schema.nodes["block.paragraph"]` 这样的完整 ID；解析依赖属性的 mention、媒体、源码对象时，使用 `createEditorNode` 选取相应类型。schema 不注册 `paragraph`、`mention`、`page_link` 等旧名称别名。

同一对象可有多个原文编码。例如 HTML 块与 `{=html}` 源码共用 `block.html_block`。必要时，内存属性 `editorRepresentation` 区分编辑视图及写回路径，不写入用户 Markdown。节点视图在表示种类改变时重新创建，避免沿用不兼容的编辑器。

ProseMirror 内容表达式不能直接使用带点的名称。schema 以内部 group 表达嵌套规则；实际 NodeType 名称和节点 JSON 中的 `type` 仍是完整 object ID。

重命名不改变 Markdown 方言边界，不迁移知识库文件，不新增正文协议。`<mention-agent>` 继续保留原文，尚未实现 Agent 对象；`<mention-link>` 仍属于 Notdown 扩展。

## 验证

`tests/unit/node-identity.test.ts` 检查实际 NodeType 名称、旧名称不可用、mention / 媒体 / 源码对象的解析身份、CRLF 与未知属性保留、编辑及撤销、视图表示切换，以及结构合法性。其余 codec、编辑命令和浏览器测试继续覆盖原有交互。
