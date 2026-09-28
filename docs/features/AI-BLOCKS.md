# AI block 配置与生成

2026-09-27。仅 `syntax.variant: notdown` 且 `notion_ai_block` 启用时支持；官方 `notion-markdown` 不启用，即使显式打开扩展开关。

新插入的 AI block 打开配置面板，输入和选择即时进入文档事务，切换 Page / Source 或页面前由原有保存链路收取。Done 收起配置；右上角 Settings 图标重新打开；Generate 显式调用 Settings 中已配置的 OpenAI-compatible 服务。缺少配置、引用不存在或请求失败会显示错误，保留原内容。生成结果按当前页面 reader 解析为可编辑 Markdown，支持撤销。生成期间当前文档变化时结果显示在状态区，不覆盖修改；离开页面或删除节点使待处理结果失效。

沿用 `<ai-block prompt="…" model="…">Markdown 正文</ai-block>` 属性载体，新增可选属性：

生成结果态按正文卡片呈现：右上角为 Good response / Bad response、Settings、蓝色 Generate。反馈按钮互斥且可再次点击取消，仅保存在当前节点视图的会话状态，不发送服务端、不写 Markdown；正文变化或重新打开后清除。生成期间 Generate 与反馈按钮禁用，已有结果保持可编辑；成功后不额外显示 Done 状态行。Settings / Done 切换只隐藏或显示正文，不替换生成内容。摘要和要点预设隐藏自定义提示词、提及和上下文控件，显示固定居中说明及只读 Current page only。

| 属性 | 取值与行为 |
| --- | --- |
| `generate` | `custom` / `summary` / `key-points`；后两者显示固定摘要／要点说明并仅使用当前页；已存的自定义 prompt/context/search 保留，切回 custom 时恢复，不参与预设请求 |
| `using` | `current-page` / `specified`；前者使用编辑器中的当前正文，排除 AI block 输出；后者使用 context |
| `context` | XML 转义的既有 `<mention-page>`、`<mention-user>`、`<mention-date>` 片段；不新建引用协议 |
| `search` | `selected` / `vault`；指定上下文时前者只取明确引用，后者按提示词词项匹配本地页面标题，最多补充 5 页 |

提示词中的 @ 菜单与上下文菜单都提供本地页面、联系人、Today / Tomorrow。页面保存稳定 `#page/ID`，联系人复用 `person://ID`，日期保存选择时的本地日历日期；界面显示为标签。人员上下文含姓名、组织与备注，不等于 Notion 成员。未知片段不会因移除旁边的标签而删除。新设置不会批量迁移旧文件；没有 generate / using 设置的旧块继续把原块正文作为额外输入，保留旧工作流。model 仍可通过块属性设置。原文与未知 XML 属性沿用 codec 保留规则。

当前页上下文使用尚未保存的编辑器内容；其他页面通过本地 API 读取。相应上下文在显式 Generate 时发往配置的服务。跨页读取为各页当前快照，不提供跨页事务快照。没有 Notion 搜索、账号邀请、成员权限、提醒调度、联网搜索、向量检索或自动更新；本地 CAS 和冲突副本不等于跨端同步。

验证：`tests/unit/ai-context.test.ts`、`tests/e2e/ai-block.spec.ts` 和已有 `tests/e2e/object-services.spec.ts`；截图写入 `test-results/ai-*.png`。
