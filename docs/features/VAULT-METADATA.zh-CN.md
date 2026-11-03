# Vault 级元数据

[English](VAULT-METADATA.md) · **简体中文**

2026-09-24：本契约替代早期“每页应用 YAML + 隐藏头部”的存储规则。

`pages/*.md` 保存完整 Markdown；API `body`、源码模式和源文件端点对应同一份内容。新建和普通属性保存不生成应用 YAML。旧应用头部使用下面的显式迁移流程移入统一 JSON；文档自己的 YAML / Pandoc title block 保留为覆盖值。联系人 `people/*.yaml` 不受本次页面存储调整影响。

数据库是独立资源，逐个保存为 `databases/<database-id>.json`，其中包含自有数据源、成员页面 ID 和视图；普通数据库没有空 Markdown 宿主。Wiki 的 `homePageId` 指向真实 Markdown。数据库的展示信息与成员关系由所属文件管理，页面 API 的宿主／成员字段为兼容投影，通用页面属性仍在 `metadata.json`。旧数据库格式保持可读，迁移须显式执行；结构与命令见[独立数据库文件](DATABASES.zh-CN.md#独立数据库文件)。备份需包含整个知识库。

## 迁移旧应用 YAML

```powershell
node --import tsx scripts/migrate-vault-metadata.ts ./vault
node --import tsx scripts/migrate-vault-metadata.ts ./vault --apply
```

第一条只预览，第二条执行。迁移通过 `createVault`、本地进程锁和逐页 `baseRevision` 校验完成：识别含稳定 `id`、`title`、`parent`、`icon`、`properties` 及 `updated` 或 `bodyFormat` 的旧应用头部，将其全部字段（含未知字段）移入同一份 `metadata.json`，再仅删除第一段应用头部。最早没有 `bodyFormat` 的文件也支持。头部后的正文逐字节保留，包括文档自己的 YAML / Pandoc 标题块。

原始 Markdown（包括 YAML 注释）、原有 JSON 与迁移清单在任何页面改写前全部备份到 `.history/migrations/yaml-to-json-<uuid>/`。同名旧头部字段优先于先前的 JSON 默认值，JSON 中其他字段保留。迁移标记防止重复执行时继续删除正文内的 YAML。规划后页面版本变化会中止，不强制重试；已有两文件事务记录支持安全恢复，未完成批次可以重新规划剩余页面。

## 页面 UUID 迁移

页面身份统一为标准 UUID。新建／复制使用 UUIDv4，Notion 与文件夹导入使用 UUIDv5，稳定派生的名字包含批次和条目，因此同一快照重试仍幂等，不同副本不会覆盖。普通外部 Markdown 没有显式身份时也派生 UUID；已有 metadata 或 YAML 中的旧 ID 保持可读，直到显式迁移。

```powershell
node --import tsx scripts/migrate-page-ids.ts ./vault
node --import tsx scripts/migrate-page-ids.ts ./vault --apply
```

预览记录全库页面的 `baseRevision`、文件名及 metadata／导入清单／冲突记录指纹；应用前及备份后都校验，发生变更即停止，不强制重试。执行经 `createVault` 与现有进程锁，更新页面文件名、JSON 身份与父关系、文首 YAML 的 id/parent、可识别的 Markdown／Wiki／页面标签引用及导入清单。只替换引用目标的源码片段；代码、标签中的未知语法、未知 metadata 字段及未改动的正文保持原样。来源记录存于 metadata，不从 UUID 推断来源。

`.history/migrations/page-ids-<uuid>/manifest.json` 保存所有被触及文件的完整前后内容和旧／新 ID 映射。原有历史目录与原始 API 归档不改写；可通过映射查回。`.history/page-id-migration.json` 为中断恢复日志，服务下次读取时仅在每个文件仍精确匹配迁移前或迁移后内容时继续，否则保留磁盘版本与备份并停止。旧地址通过 `pageIdMigration.previousIds` 兼容读取，返回的页面 ID 始终为迁移后的 UUID；旧窗口提交仍执行版本校验，过期草稿保留为冲突副本，不覆盖新页面。复制页面不会继承旧地址别名。

页面的可选布尔字段 `fullWidth` 保存普通页面的宽度偏好，缺省为窄版；它不是数据库属性。宽度修改同样经 `createVault` 和 `baseRevision` 校验，不改写正文，文档 YAML 中同名布尔值优先于 JSON 默认值。Wiki Home 的默认全宽由容器布局决定，转换及 Undo 不改动原页面的宽度偏好。

## JSON 结构

每个 vault 使用一个 `metadata.json`：

```json
{
  "version": 1,
  "pages": {
    "550e8400-e29b-41d4-a716-446655440000": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "file": "550e8400-e29b-41d4-a716-446655440000.md",
      "title": "示例页面",
      "parent": null,
      "icon": "📄",
      "bodyFormat": "markdown",
      "properties": { "status": "草稿" }
    }
  }
}
```

`syntax`、收藏、回收站、排序和更新时间也保存在对应记录中。未知顶层及页面字段保留。应用维护 `sourceHash` 辅助识别唯一的、内容未改变的外部文件重命名；同时改名和改正文不能可靠匹配旧身份。JSON 丢失时不能恢复只保存在其中的属性，因此备份和复制知识库时应同时包含 JSON 与 Markdown。

The top-level `externalEntities` registry stores Notion names, URLs, available user data, import batches and explicit local bindings by provider, kind and original ID. Reference locations and availability are derived from current Markdown/properties and local objects. Later imports change resolution without rewriting old note bodies. `createVault.externalEntities` owns registry writes and uses CAS, preserving unknown fields and conflict proposals. See [External references](NOTION-IMPORT.zh-CN.md#external-references-and-users) and the [API](../reference/API.zh-CN.md#外部实体库).

新上传的附件使用顶层 `assets` 映射登记：键为稳定的 `assets/…` 相对路径，值包含原文件名 `name`、`contentType`、字节数 `size` 和登记时间 `addedAt`。文件字节仍保存在 `assets/`，引用关系从页面正文与有效属性计算，不写成第二份正文。浏览已有附件不迁移或补写登记信息；没有记录的原文件名不能推断恢复。上传只追加附件记录，不改变已有页面 revision。共享 JSON 使用原值校验写入；并发修改导致失败时，新文件和提议的元数据保存在原附件路径及 `.history/asset-conflicts/`，不覆盖外部修改、不自动强制重试。操作入口见[附件库](MEDIA-AND-EMBEDS.zh-CN.md#附件库)。

## 覆盖规则

读取顺序为文件名/应用缺省值 → JSON 页面记录 → 文首 YAML 或 Pandoc title block。YAML 支持 `---` 开始、`---` 或 `...` 结束；Pandoc 支持标题、作者、日期及缩进续行。覆盖在存储层计算，不依赖渲染方言开关；方言仍决定正文的解释方式。不会读取代码围栏内的元数据，也不新增 MMD 覆盖规则。

YAML 中已知页面字段覆盖对应 JSON 字段；`properties` 按属性键合并，同名文档属性优先，未声明的 JSON 属性仍有效。YAML 其他字段及 Pandoc 的 `author` / `date` 进入有效页面属性。移除文档内覆盖后恢复 JSON 默认值；保存完整页面草稿不会把未修改的文档覆盖反写为 JSON 默认值。JSON 管理的稳定页面 ID 不随正文中的 `id` 改变；旧文件未登记时兼容读取 YAML ID。

页面属性界面写 JSON。被文档覆盖的字段仍以文档为准，应编辑 Metadata details 或源码中的对应字段。已识别的 YAML / Pandoc 标题也可通过页面标题编辑。旧应用头部迁移后，其中的父级、收藏、回收站等字段由 JSON 管理；文档自己显式声明的字段仍优先。

普通外部 Markdown 不再需要应用 YAML：未登记文件使用文件名标题和稳定推导的 ID，实际编辑后登记 JSON。导入文件夹将应用属性写入 JSON，保留原文首 metadata；链接仍按原有解析规则重定位，原始文件继续归档。

## 版本、冲突与恢复

页面的 `baseRevision` 同时包含完整 Markdown 与该页有效 JSON metadata，JSON 对象键顺序不影响版本；修改其他页不会让本页版本失效。所属数据源改变会影响成员页面版本。历史快照成对保存 `.md` 和 `.json`，冲突也保留各自的正文与属性。数据库 JSON 通过独立资源版本和文件原值校验保存。过期版本不强制重试。

### 自动历史与版本恢复

自动保存继续及时写入正文和 JSON；历史不再逐次累积。默认每页自动快照间隔为 5 分钟，该页停止编辑 120 秒后补一个最终检查点；在其他页面继续写作不会推迟它的检查点。重新打开后首次编辑前，也会保留上次会话的最终状态。只有实际内容或属性变化才产生历史；仅 `updated` 不同不算新的历史内容。无实质变化的普通页面保存保留原 revision 和更新时间，版本冲突仍在去重前检查。

新生成的自动快照默认保留 30 天、每页最多 100 个，至少保留最新恢复点。索引在 `.history/checkpoints/<page-id>.json`；生成新检查点时执行清理，只处理索引中由应用生成、字节仍匹配的自动快照。旧历史、未知文件、外部改动的恢复副本和保护版本保留。冲突、迁移、删除及恢复操作所需的检查点不按普通自动历史清理。历史设置位于本库 `.notdown/history.json`，使用独立 revision 校验，未知字段保留。

桌面／浏览器的页面菜单 **Page history** 列出本地快照与可用的 Git 版本，可预览完整 Markdown、属性和正文差异，再用 **Restore this version** 恢复。恢复经过 `createVault`，要求当前页的 `baseRevision`；预览期间发生外部修改会拒绝恢复并保留提议。恢复前保护当前版本，只更新目标页的正文与属性，不回退其他页或整个 `metadata.json`。数据库记录按当前 schema 校验并保持当前集合身份；旧父页面不存在等无效结构会阻止恢复。原页面 ID 迁移前的历史通过已有别名继续读取。

### 可选本地 Git 历史

在 **Settings - History** 中启用 **Local Git history**。Node／Windows 桌面环境需要可运行的 Git；Android 不依赖 Git，继续使用共用的自动快照。Git 功能默认关闭。首次启用记录当前文本基线，此后按设置的间隔、停止编辑和正常服务关闭生成检查点；也可以命名一个手动检查点。Git 历史不套用自动快照的 30 天／100 个限制。

每个知识库独立使用 `.notdown/git-history.git/`，与 Notdown 源码仓库无关，不配置远端、不执行 pull 或 push。提交内容是可独立恢复的文本投影：`pages/<page-id>.md`、`page-metadata/<page-id>.json`、`vault-metadata.json`（其他顶层元数据）与 `people/*.yaml`。页面属性按页分开记录，正文真相仍是知识库的 `pages/*.md`，不会迁入 Git 对象库或缓存。

附件字节、服务配置、同步凭据、临时事务和既有 `.history/` 不进入 Git 提交；Git 历史不是完整知识库备份。完整备份仍需包含附件、metadata 和所需历史。ZIP 导出保留 Git 对象库，但排除运行中的锁文件。Git 操作失败会显示错误并保留已保存笔记；可停用 Git 后继续编辑。受应用管理的 Git 配置、目录与标记被修改时停止 Git 操作，保留原文件；不执行仓库 hooks 或读取用户的 Git 配置。强制结束进程不能保证最后一次检查点已完成，正文保存的事务保护继续独立工作。

同一 vault 的服务读写串行化，并以本地进程锁协调服务与 MCP。两文件保存前先写 `.history/pending-<id>.json` 恢复记录，单文件使用原子替换。中断后仅在正文和 JSON 仍精确匹配事务的旧值或新值时完成保存；如有第三方改动，则停止并保留磁盘版本及恢复记录供人工合并，不强制覆盖。任意外部编辑器并不遵守应用锁；这不是跨端同步或分布式事务保证。
