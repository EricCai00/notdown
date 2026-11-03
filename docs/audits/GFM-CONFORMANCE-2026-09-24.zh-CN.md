# GFM 规范覆盖与补齐

[English](GFM-CONFORMANCE-2026-09-24.md) · **简体中文**

依据：[GitHub Flavored Markdown 0.29-gfm](https://github.github.com/gfm/)（2019-04-06，2026-09-24 核查）。输入和官方 HTML 使用仓库已有的 `docs/fixtures/dialect-audit/cases.json` 与 `gfm.md`，共 677 个官方例子，保留原始预期与许可，没有改写历史审计结果。

## 修复内容

| 范围 | 本次补齐 |
| --- | --- |
| 删除线 | 单个及两个波浪线，拒绝三波浪的局部误识别；不同长度的起止标记不混配。 |
| 扩展自动链接 | 使用 GFM tokenizer 的源码位置处理域名、标点、括号、实体和邮件边界，防止 `abcwww.example.com` 误链接；支持规范的 `mailto:`、`xmpp:` 及单段资源路径。代码、已有链接和 HTML 属性不参加裸链接转换。 |
| 任务项 | 空格、Tab、换行分隔，有序、无序和嵌套任务；编辑继续使用真实任务项。 |
| 表格 | GFM 表头投影为 `th`，列对齐保留；单元格的转义管道和 `<br>` 在编辑后可重读。 |
| 禁用 HTML | 九种标签按 tagfilter 变成可见文本，不执行、不删除其可读原文；仅对 HTML token 应用，不全局改写代码围栏。 |
| 基础规则 | GFM 0.29 行内 HTML 注释语法；畸形标签按普通文字解析；空引用使用合法可编辑节点；松散列表写回保留段落间隔；从 0 开始的有序列表和同类强调嵌套的外层格式在编辑后保留。 |
| HTML 预览／导出 | 核心 GFM 使用同一个 token parser 生成完整 HTML，再执行安全过滤；避免逐块消毒把跨块 `details` 等容器提前闭合。顶层跨块 HTML 容器提供一个可恢复的源码编辑块。安全导出保留相对链接、显式锚点、任务框和表格语义。 |

GFM 的规则安装在 `src/markdown-engine/gfm.ts`，接入页面已有 codec。没有替换 ProseMirror 文档模型，没有迁移知识库，也没有改动 CAS／冲突保留协议。其他方言保留各自的波浪、自动链接和 HTML 注释规则。

## 677 个例子如何判定

`tests/unit/gfm-conformance.test.ts` 对每例检查：

1. `parseNative` 产生合法的 ProseMirror schema。
2. `serializeNative` 对未编辑文档返回完全相同的原文。
3. 生产使用的 GFM token renderer 与规范 HTML 比较 DOM，保留结构、URL、表格对齐、checkbox 状态及代码空白；仅消除实体编码、属性顺序和块间排版空白。
4. 实际安全导出与对应规范输出经过相同安全策略后的 DOM 比较。

默认完整 GFM 有 **668 / 677** 个例子直接匹配书面 HTML。以下 9 个例子是规范继承基础章节与启用扩展后的差别，不能通过关闭默认 GFM 扩展或修改原始 fixture 来隐藏：

- **611、617、620、621**：基础自动链接章节预期裸 URL／邮件为文字；启用 §6.9 后应产生链接。测试同时验证关闭裸链接扩展时的书面预期，以及默认完整 GFM 的明确预期。
- **140、141、142、145、147**：基础 HTML 章节输出原始 script/style；§6.11 tagfilter 要求转义。测试明确应用 tagfilter 后比较，仍保留源码。

以上两种配置／扩展叠加语义均有断言，**677 / 677** 通过。这个数字是指定语料的回归覆盖，不是对任意输入、所有编辑操作或所有 GitHub 网站功能的无条件认证。

额外检查包含标记编辑、列表松紧、任务空白、表格代码中的管道、表格硬换行、CRLF、相邻编辑、HTML 源码编辑、跨块标签与代码／注释中的伪闭合标签。浏览器测试使用独立 Chrome 和临时 vault，检查表头编辑、链接、任务、标签安全预览、模式切换、保存、重载和 HTML 折叠结构。

## 明确边界

- 应用 HTML 安全过滤仍会移除可执行属性、危险 URL 和不允许的元素；输出不是任意用户 HTML 的逐字复制。HTML 以源码编辑和安全预览呈现，不承诺把所有 HTML 标签变成独立富文本控件。
- 核心 GFM 的完整 HTML 导出路径与额外产品扩展的 schema renderer 分开。启用公式、告警、脚注等后，使用已有扩展实现；这些组合不包含在本次 677 例认证范围。
- GitHub 用户／团队 mention、Issue／PR／提交引用、自定义仓库链接、上传服务、地图和网站图表等是网站能力；本次不把它们宣称为 GFM 规范功能或全部已实现。
- CommonMark、Typora、Obsidian、Notion 等其他方言没有因为本次 GFM 回归而获得完整符合性声明。

## 最终验证

- `npm test`：671 项，670 通过、1 跳过、0 失败；日志 `.run/logs/gfm-all-unit-final.log`。
- `npm run build -- --outDir test-results/gfm-dist`：通过（TypeScript 检查和 Vite 构建），仅有 bundle 大小提示；日志 `.run/logs/gfm-build-final.log`。
- 已运行 `npm run test:e2e -- tests/e2e/gfm-conformance.spec.ts tests/e2e/markdown-workspace.spec.ts tests/e2e/markdown-blocks.spec.ts`。首次关联回归遇到共享 Playwright trace 目录的 ENOENT，随后使用独立构建、端口和 `--output test-results/gfm-browser --reporter=list` 重跑，**16 / 16 通过**；日志 `.run/logs/gfm-e2e-final.log`。这包含本次新增的两项 GFM 浏览器测试，不是整个浏览器测试集的完成声明。

所有测试使用临时 vault；没有写入用户 `vault/` 或 MyBase 主库。
