# People 本地通讯录

People 是当前知识库的联系人目录，不创建账号、协作成员、访客、权限或通知。

## 使用

- People 快捷入口默认隐藏；在 **Workspace settings → Sidebar → People** 开启。正文中的联系人提及和管理入口仍可使用。
- 侧栏 **People → New person**，填写姓名，以及可选邮箱、电话、组织和备注，选择 **Save person**。
- 搜索支持上述字段，大小写不敏感，多词可以匹配不同字段。同名联系人保留不同 ID，选择时显示组织或邮箱帮助区分。
- Page／Split 富文本区输入 `@` 后搜索联系人，鼠标或方向键／Enter 选择，Esc 取消。没有联系人时可进入 **Manage people…** 新建，再点击 **Mention person** 返回原输入位置。
- `/Mention person` 打开同一联系人选择界面。源码区通过插入菜单写入标签；源码不提供 @ 自动补全。
- 点击已有提及打开联系人详情。改名后不批量迁移正文；删除后不再出现在提及建议中，已有提及仍显示并标识删除；**Show deleted people → Restore person** 恢复原 ID。
- 日期建议继续显示在同一 @ 菜单中。禁用 `notion_mentions` 后不补全；代码块、行内代码、邮箱内部不触发。

## 文件

Each contact is stored in `vault/people/<uuid>.yaml` with `id/name/email/phone/organization/notes/deleted/created/updated` and an optional `notionUserId`. Names are required; other text fields may be empty. Existing `.yaml` / `.yml` paths, unknown fields and YAML comments survive updates. Ordinary contacts use independent UUIDs; imported Notion users use UUIDs derived from their source identity. No MyBase IDs are assigned. The API-only `revision` is the complete file's SHA-256 and is not written into YAML.

正文仍以 `vault/pages/*.md` 为真相：

```xml
<mention-user url="person://550e8400-e29b-41d4-a716-446655440000">Eric Cai</mention-user>
```

`person://` 是本地联系人身份；外部 `user://`、未知属性与原文不自动迁移，也不会按名称关联同名联系人。正文标签中的姓名为后备显示；联系人缺失或导出至外部 Markdown／HTML 时保持可读。编辑器读到目录后显示当前姓名；目录变化只刷新联系人视图，不生成正文事务或采用新的页面 revision。

Notion `user://` mentions match contacts by `notionUserId`, or through an explicit binding in **Import → External references**. Unmatched users appear as gray, non-clickable “@Unknown user” labels. Later imports with complete user profiles or manual bindings reveal the contact's name and allow opening its details. ID-only partial users never create invented contacts. Complete named users may create local contacts during import; existing contacts are never overwritten or restored. See [External references and users](NOTION-IMPORT.md#external-references-and-users).

## 并发与恢复

`createVault.people` 与页面写入共用队列。编辑、删除、恢复必须携带读取时的 `baseRevision`，失配返回 409；不强制重试。更新前保存原 YAML 到 `.history/people/<id>/<revision>.yaml`。冲突将磁盘版本和拟写版本分别保存为 `.history/people/conflicts/<conflict-id>.current.yaml` 与 `.proposed.yaml`，并保存 JSON 索引。

表单保留原始 revision，后台更新不会覆盖正在编辑的字段。冲突界面可比较各字段并显式加载磁盘版本；恢复自己的版本可查看冲突文件后手动合并。联系人冲突独立于页面冲突列表，尚未提供通用联系人历史浏览器。关闭／重开 People 保留当前窗口尚未保存的表单；整页刷新前应保存联系人。

测试使用临时知识库和独立 Chrome，不写用户 `vault/`，不连接用户浏览器。
