# Notion 数据库列序与按钮对齐（2026-10-24）

## 范围与修复

- 内嵌数据库的通用内容块按钮样式带有外边距，导致 **New** 和下拉箭头分离、上下错位。数据库按钮清除默认外边距，两个分段统一高度及盒模型。
- 导入原先直接采用数据源 `properties` 对象的枚举顺序。现在读取同一数据源第一个可用表格视图的 `configuration.properties`，按来源属性 ID（含 URL 编码）或名称映射列序；无法取得时标题列置首，其他字段保持接口顺序。重复、未知或遗漏字段不会造成现有字段丢失，隐藏字段仍可访问。
- 早期导入中标题不在首位、且列序仍等于完整 schema 顺序的默认视图，在读取时用已归档视图修正显示。不会自动改写 metadata 或正文；自定义列序和可见列集合保持原样。
- 保存视图设置、筛选或排序时保持当前列序，避免又按 schema 重排。

原始 Notion schema 和视图配置继续保留。未增加远端写入、批量数据迁移或新的正文语法；未复现远端记录排序、筛选、分组及其他布局。API 字段依据 [Notion 官方视图说明](https://developers.notion.com/guides/data-apis/working-with-views#property-configuration)。

## 验证

- `npm test`：996 项，990 通过、5 跳过、1 失败。唯一失败是已有 R API 测试的随机监听端口被 Node fetch 拒绝（`bad port`）；独立复测 `tests/unit/rmarkdown.test.ts` 后 10 项全部通过。没有为此修改 R 代码。
- `npm run build -- --outDir .run/database-columns-frontend`：通过 TypeScript 检查及 Vite 构建；仍有现有的大 chunk 提示。
- 隔离 Chrome、临时知识库，运行 `database-inline.spec.ts`、`databases.spec.ts` 和 `notion-inline-database-import.spec.ts`：13 项全部通过。覆盖两种方言导入、远端列序与缺少远端视图的回退、New 按钮分段对齐与菜单展开、保存视图及刷新后的列序、旧导入只读修正与 revision 不变，以及已有编辑、冲突、草稿和记录面板行为。
- 已查看生成截图，确认内嵌数据库中标题列在左、New 两段相连且等高。
- `npm run test:e2e -- tests/e2e/database-hierarchy.spec.ts tests/e2e/database-icons.spec.ts tests/e2e/database-server-compat.spec.ts tests/e2e/notion-import.spec.ts --output test-results/database-columns-related --reporter=list`：通过独立构建及另外 18 项浏览器回归。使用端口 4360、前端目录 `.run/database-columns-e2e-final/`；连同上述 13 项，合计 31 项全部通过。

本地日志为 `.run/logs/database-columns-*.log`，构建为 `.run/database-columns-frontend/`，截图为 `test-results/notion-inline-databases-{variant}.png`。全部验证使用临时数据，没有读取或修改用户知识库；这些结果不代表全量浏览器套件通过。
