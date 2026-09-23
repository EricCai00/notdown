/** Regenerate documentation from the product registry; never opens a vault. */
import { writeFileSync } from "node:fs";
import { contentObjects } from "../../src/content-objects";

const header = `# Notdown 对象统一与实现 Roadmap

2026-09-22。原 80 项对象清单加上用户要求的 Inline raw source，共 81 项：43 个 block、2 个 metadata、32 个 inline、4 个 character。对象身份独立于 Markdown 写法和 ProseMirror 节点；单一 ProseMirror 文档与原有 codec 继续工作，Markdown 文件仍是正文真相。

## 当前交付

- 全表语义注册、统一菜单、对象／方言／扩展双向链接；三种列表项各用独立底层节点，Heading 共享节点。仅保留有归属的子结构栏，字符类为文本能力。
- Callout 和 TOC 合并并保留编码来源；管道、Notion、MMD、网格、简单、多行表格共用模型，提供行列和跨度编辑。
- Tabs、手工书签／链接预览、Breadcrumb、HTML embed、图片题注、Example list、Native span、Small caps、Raw TeX；定义列表项操作、cover、元数据字段及行内属性编辑。
- AI block / Meeting notes 使用 Settings 配置的 OpenAI-compatible 服务。Button 提供本地动作；提醒在应用打开时运行；Synced block 支持本地刷新与 CAS 发布，本地编辑暂停自动刷新。
- 103 个 Markdown 扩展有本地执行路径；12 个 Outside Markdown scope 项排最后且不可启用。notdown_* 规范为 notion_*，旧键兼容，新键优先，不批量迁移页面。
- MMD / YAML 共用产品身份但编码不同；Mention agent、Inline media、Database reference 对象和 Existing content 已移除，Inline raw source 保留。旧数据库和未知输入仍保留原文。

## 能力与边界

status 表示逐项描述的本地契约；stage 保留 roadmap 实施分组，不表示仍待实施。direct = 直接编辑，source = 源码编辑，reference = 引用载荷，text = 文本规则，preserved = 原文回退。实际可用性取决于方言与扩展开关，不能由可解析推断所有属性都有表单。

没有第二份持久化 AST，Page / CAS / MyBase 契约不变。新增模型调用及本地 citeproc API，未新增远端同步。真实模型由用户配置，测试使用模拟端点。Raw TeX 不在浏览器执行，书签元信息手工填写，citeproc 需本机 Pandoc。详细格式及边界见 [本地对象与服务](LOCAL-OBJECTS.md)。

## 逐项清单

| ID | 名称与别名 | 现有载体 / 编辑能力 | 状态 / 阶段 | 边界 |
| --- | --- | --- | --- | --- |
`;
const cell = (value: string) =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (objects: typeof contentObjects) =>
  objects
    .map(
      (o) =>
        `| ${o.id} | ${cell([o.name, ...o.aliases].join("; "))} | ${cell(o.adapters.map((a) => `${a.carrier} (${a.editing}${a.extensions.length ? "; " + a.extensions.join(" + ") : ""})`).join("; ") || "—")} | ${o.status} / ${o.stage} | ${cell(o.note)} |`,
    )
    .join("\n");
writeFileSync(
  new URL("../CONTENT-OBJECT-ROADMAP.md", import.meta.url),
  header +
    table(contentObjects) +
    `

## 验证与维护

注册表来源：src/content-objects.ts。测试覆盖对象数量与分类、上下文识别、真实示例、Callout 原编码和撤销、TOC 层级与导出、扩展开关、CRLF、未知内容及代码围栏边界。浏览器验证全表与别名、折叠持久化、正文输入收取、目录实时更新、统一菜单及临时知识库保存。完整验收运行 npm test、npm run build、npm run test:e2e。

更新注册表后运行 node --import tsx docs/fixtures/content-object-roadmap.ts 重新生成本文件。旧 BLOCK-MODEL-REVIEW / CONTENT-CAPABILITIES 保留为历史讨论与方言快照；对象边界以本清单为准。
`,
);
