# MyBase 互操作

[English](MYBASE.md) · **简体中文**

已只读核对本机 `D:/Workspace/mybase`。当前应用提供 `src/integrations/mybase.ts` 的纯函数 `toMyBase(page)`，返回元数据 `.mybase` 文本；不连接、不写入、不重建现有 MyBase。Markdown 正文不复制进导出。

## 已实现的导出契约

输入为 `{id, title, body?, properties?}`。`id` 必须为 UUID；`properties` 接受字符串、有限数字、布尔值或同类型数组，空数组不导出。不支持嵌套对象、null、混合类型数组、原始 MBN、qualifier、reference 或 Formula，遇到这些值明确拒绝导出。

```mybase
name^prop%String
note URI^lprop%Url
note property status (String)^lprop%String
note property priority (Quantity)^lprop%Quantity

[Note 550e8400-e29b-41d4-a716-446655440000]^lind%document
    name: "阅读笔记"
    note URI: <note:550e8400-e29b-41d4-a716-446655440000>
    note property status (String): "reading"
    note property priority (Quantity): 2
```

`name^prop%String` 与现有属性一致；`document` 是已有全局 class。笔记实体用 `^lind`，生成属性用 `^lprop`。MyBase 按唯一 label 合并记录，故实体 label 是不可变 `Note UUID`，标题只写入 `name`。MyBase 自身分配 `LQ…`、`LP…`，应用不擅自分配注册表 ID。

`note:` 是本应用的页面身份 URI，使用 MyBase 支持的 Url datatype；目前不注册操作系统协议处理器。它不受本机路径和文件名变化影响。

临时属性命名空间为 `note property <原字段名> (<datatype>)`，以免把普通 YAML 字段误绑定到既有属性。同一字段在不同页面使用不同类型时会生成不同属性，避免向 MyBase 声明互相冲突的 datatype。字符串与布尔值导出 String（布尔值为 `"true"`、`"false"`）；数字导出 Quantity；数组成为多条声明。布尔值在此投影中是文本语义；未来应通过显式属性绑定提供类型更准确的模型。

字符串使用 JSON 转义，且转义 Python `splitlines()` 识别的 Unicode 换行，避免标题或属性值注入新实体。属性名拒绝控制字符并转义 MyBase 标点。正文、父子顺序、图标和编辑历史仍由 Markdown 应用保存，导出不是完整知识库备份。

## MyBase 当前模型

- 权威知识源为 `knowledge/**/*.mybase`；当前构建器只扫描 `.mybase`，不会自动读 Markdown frontmatter 或代码块。
- 运行时有序数据为 `data/store/mybase_all.json`。`mybase_all.ttl`/RDF 是交换与 SPARQL 投影，不保存正文布局、注释、文件边界和原始顺序。
- RDF 很适合表达“某页属于 document、关于某实体、有某属性”等语义，但不应取代 Markdown 正文和页面排序。
- `local` 是个人知识库的语义作用域，不是权限或加密机制。
- 相同 label 的重复 MBN 块会合并，不能通过重复追加导出文件实现更新；重导入应替换该页面专属投影，避免保留旧标题、旧属性值。

依据：[格式规范](../../../../mybase/doc/MYBASE_NOTATION.md)、[MyBase README](../../../../mybase/README.md)、[document 类](../../../../mybase/knowledge/init/art.mybase)、[属性声明](../../../../mybase/knowledge/init/properties.mybase)。

## 可复用的查询能力（尚未接入此应用）

MyBase 默认监听 `http://127.0.0.1:8080`；当前笔记应用没有探测或启动它。

| 功能 | 已有 MyBase API |
| --- | --- |
| 属性与类型搜索 | `GET /api/properties?q=…`、`GET /api/classes?q=…` |
| 实体搜索 | `GET /api/entities?q=…` |
| 读取实体声明 | `GET /api/editor/Q1` |
| 查询预览、执行 | `POST /api/query/preview`、`POST /api/query/execute` |
| 查询关系图、树 | `POST /api/query/graph` |
| 已保存查询 | `GET /api/saved-queries` |
| SPARQL | `POST /api/sparql/query` |

执行接口示例：

```json
{
  "conditions": [{"property": "instance of", "value": "document", "recursive": true}],
  "order": {"property": "name", "direction": "asc"},
  "min_property_coverage": 0,
  "engine": "json"
}
```

至少需要一个 condition。后续条件支持 `connector: "AND" | "OR"`、独立 `negated`、`property_role: "statement" | "qualifier"`；空 `value` 表示属性存在。`recursive` 只适用于已有层级属性的非空实体条件。

结果包含 `columns`、`rows`、`graph_properties` 和生成的 `sparql`。每行的 `cells` 依列排列且每格为多值数组，不可扁平化成一个字符串再用于编辑。现有查询视图为 `table`、`poster`、`map`、`tree`、`graph`；`poster` 可映射为 Gallery。树和图共享 `/api/query/graph`，附加关系 `property` 以及 `conditions` 或 `item_ids`。

保存的 UI 配置使用 `defaultView`、`qualifierColumns`、`showRank` 等 camelCase；执行 API 使用 `qualifier_columns`、`show_rank` 等 snake_case，需要显式转换。

依据：[路由](../../../../mybase/mybase/web/routes_query.py)、[验证和结果数据](../../../../mybase/mybase/web/knowledge.py)、[视图配置验证](../../../../mybase/mybase/web/query_validation.py)。

## 后续实现边界

1. 添加显式 `属性 UUID/键 → MyBase P/LP ID + datatype` 绑定，复用既有属性定义，不再依赖临时导出命名空间。
2. 先通过只读查询接入各视图，并保留离线可用的最后一次结果。
3. 用标准 Markdown `[The Beatles](mybase:Q1)` 承载实体引用，应用解析后打开配置的 `/item/Q1`；与 `[[页面]]` 分开解析。URI 解析和正文实体引用尚未接入。
4. 设计单一写入归属和 UUID↔LQ 注册映射，再引入 `.mybase` 投影导入；不允许两个独立可写副本互相覆盖。
5. MyBase 现有实体 PUT/PATCH 没有 revision/ETag 乐观锁，不能直接作为多端合并协议。页面同步和冲突分支由笔记存储层处理。

MyBase 项目当前未发现 MCP 服务。笔记应用提供独立的 `server/mcp.ts`，使用 [官方 TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/) 的 stdio transport；直接运行 `node --import tsx server/mcp.ts`，由 MCP 客户端管理进程。stdout 仅为协议消息，错误日志写 stderr。

先启动本应用页面 API。MCP 默认转发到 `http://127.0.0.1:4318`，可用 `NOTE_API_URL` 指定其他本机端口；仅接受 loopback HTTP(S) origin，禁止远程主机、凭据、路径和重定向。它不启动 API，也不直接读写 MyBase。

工具为 `list_pages`（不含正文的元数据）、`read_page`、`create_page`、`update_page`。更新要求携带读取得到的 `baseRevision`；冲突返回 MCP `isError: true`、HTTP 状态 409、`conflictId`、`current`、`proposed`。草稿由页面 API 留在冲突分支，不自动重试、不隐式合并。客户端需要明确审阅合并；网络失败时写入结果可能未知，必须先读取确认，避免重复创建。
