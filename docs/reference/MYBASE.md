<a id="mybase-互操作"></a>

# MyBase integration

**English** · [简体中文](MYBASE.zh-CN.md)

I've only read the check-in. `D:/Workspace/mybase`Currently available `src/integrations/mybase.ts` The pure function of `toMyBase(page)`Returns the data `.mybase` Text; not connected, not written, not reconstructedMyBase。Markdown The official version of the document is not copied.

<a id="已实现的导出契约"></a>

## Implemented export contract

The input is `{id, title, body?, properties?}` . `id` must be UUID; `properties` accepts strings, finite numbers, Boolean values ​​or arrays of the same type. Empty arrays are not exported. Nested objects, null, mixed-type arrays, raw MBN, qualifier, reference or Formula are not supported and export is explicitly refused when these values ​​are encountered.

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

`name^prop%String`Consistent with existing properties; `document` is the existing global class . Use `^lind` for note entities and `^lprop` for generated attributes. MyBase merges records by unique label, so the entity label is immutable `Note UUID` and the header is only written to `name`. MyBase allocates `LQ…` and `LP…` by itself, and the application does not allocate the registry ID without authorization.

`note:` The page identity of the applicationURI，UseMyBase SupportedUrl datatype；The operating system protocol processor is not currently registered. It is not affected by changes in the path and file name of the operating system.

Temporary attribute namespace `note property <原字段名> (<datatype>)`，I'm not going to go into the ordinary.YAML Fields are incorrectly bound to existing properties. The same field generates different properties when different types are used on different pages, avoiding the possibility of a linking to the same field.MyBase Declarations of conflictdatatype。Exporting string and bul valueString（The Bull value is`"true"`、`"false"`); the numerical output is Quantity; the array becomes a multi-declaration. The bullet value is the text semantics in this projection; in the future, more accurate models of the type should be provided by explicit attribute binding.

Strings are converted using JSON and converted to Python `splitlines()` Identifying Unicode switches to avoid inserting a title or attribute value into a new entity. The attribute name refuses to control the character and translates the MyBase icon. The original, parent sequence, icon and editing history are still stored by the Markdown application, and exported is not a complete vault backup.

<a id="mybase-当前模型"></a>

## Current MyBase model

- The authoritative knowledge source is `knowledge/**/*.mybase`; the current builder only scans `.mybase` and does not automatically read Markdown frontmatter or code blocks.
- The runtime ordered data is `data/store/mybase_all.json`. `mybase_all.ttl` / RDF are swapped with SPARQL projections and do not preserve text layout, comments, file boundaries and original order.
- RDF is very suitable for expressing semantics such as "a certain page belongs to document, is about a certain entity, and has a certain attribute", but it should not replace Markdown text and page sorting.
- `local`It is the semantic scope of the personal vault, not the permissions or encryption mechanism.
- The samelabel The RepeatMBN Blocks are merged and cannot be updated by adding the export file repeatedly; reintroduction should replace the exclusive projections on the page, avoiding the preservation of the old title, the old attribute value.

Basis: [ format specification ](../../../../mybase/doc/MYBASE_NOTATION.md), [ MyBase README ](../../../../mybase/README.md), [ document class ](../../../../mybase/knowledge/init/art.mybase), [ attribute declaration ](../../../../mybase/knowledge/init/properties.mybase).

<a id="可复用的查询能力尚未接入此应用"></a>

## Reusable query capabilities (not yet integrated into this app)

MyBase listens to `http://127.0.0.1:8080` by default; the current note-taking application does not detect or start it.

| Function | Already have MyBase API |
| --- | --- |
| Property and type search | `GET /api/properties?q=…`、`GET /api/classes?q=…` |
| Entity search | `GET /api/entities?q=…` |
| Read entity declaration | `GET /api/editor/Q1` |
| Query preview and execution | `POST /api/query/preview`、`POST /api/query/execute` |
| Query graphs and trees | `POST /api/query/graph` |
| Saved query | `GET /api/saved-queries` |
| SPARQL | `POST /api/sparql/query` |

Example of execution interface:

```json
{
  "conditions": [{"property": "instance of", "value": "document", "recursive": true}],
  "order": {"property": "name", "direction": "asc"},
  "min_property_coverage": 0,
  "engine": "json"
}
```

At least one condition is required. Subsequent conditions support `connector: "AND" | "OR"`, independent `negated`, and `property_role: "statement" | "qualifier"`; empty `value` indicates that the attribute exists. `recursive` is only applicable to non-empty entity conditions that already have hierarchical attributes.

The result contains `columns`, `rows`, `graph_properties`, and the resulting `sparql`. The `cells` of each row is arranged in columns and each cell is a multi-valued array. It cannot be flattened into a string and then used for editing. The existing query views are `table`, `poster`, `map`, `tree`, and `graph`; `poster` can be mapped to Gallery. Trees and graphs share `/api/query/graph` , with additional relationships `property` and either `conditions` or `item_ids` .

The saved UI configuration uses `defaultView`, `qualifierColumns`, `showRank`, etc. camelCase; executing API uses `qualifier_columns`, `show_rank`, etc. snake_case, which requires explicit conversion.

Based on: [ routing ](../../../../mybase/mybase/web/routes_query.py), [ verification and result data ](../../../../mybase/mybase/web/knowledge.py), [ view configuration verification ](../../../../mybase/mybase/web/query_validation.py).

<a id="后续实现边界"></a>

## Boundaries for future implementation

1. Add explicit `属性 UUID/键 → MyBase P/LP ID + datatype` binding to reuse existing property definitions and no longer rely on temporary export namespaces.
2. First access each view through a read-only query and retain the last result available offline.
3. Use standard Markdown `[The Beatles](mybase:Q1)` to carry entity references, and open the configured `/item/Q1` after applying parsing; parse separately from `[[页面]]`. URI parsing and text entity references are not yet connected.
4. Design single write ownership and UUID ↔ LQ registration mapping, and then introduce `.mybase` projection import; two independent writable copies are not allowed to overwrite each other.
5. MyBase Existing entitiesPUT/PATCH Norevision/ETag Optimum locks cannot be directly used as a multi-end merger protocol. Page synchronization and conflict branches are handled by the notebook storage layer.

MyBase projects currently do not have a MCP service. `server/mcp.ts`The use of [Official TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/) The stdio transport runs directly `node --import tsx server/mcp.ts`，byMCP The process of client management.stdout The error log is written for protocol messages only.stderr。

Start this application page API first. MCP is forwarded to `http://127.0.0.1:4318` by default, and `NOTE_API_URL` can be used to specify other local ports; only loopback HTTP (S) origin is accepted, and remote hosts, credentials, paths, and redirections are prohibited. It does not start API, nor does it directly read or write MyBase.

The tools are `list_pages` (metadata without text), `read_page`, `create_page`, `update_page`. The update requires carrying the read `baseRevision`; the conflict returns MCP, `isError: true`, HTTP status 409, `conflictId`, `current`, `proposed`. The draft is left on the conflicting branch by page API, without automatic retries or implicit merging. The client needs to explicitly review the merge; when the network fails, the write result may be unknown and must be read and confirmed first to avoid repeated creation.
