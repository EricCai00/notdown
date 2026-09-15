import { promises as fs } from "node:fs";
import type { createVault, Page, PageInput } from "./vault.js";
import { parseEditorMarkdown } from "../src/editor-markdown.js";
import { serializeNotionMarkdown } from "../src/notion-markdown.js";

export const sampleIds = {
  welcome: "8f305c10-6af1-4000-8000-000000000001",
  garden: "8f305c10-6af1-4000-8000-000000000002",
  inspiration: "8f305c10-6af1-4000-8000-000000000003",
  reading: "8f305c10-6af1-4000-8000-000000000004",
  syntax: "8f305c10-6af1-4000-8000-000000000005",
};

const samples: Array<PageInput & { id: string }> = [
  {
    id: sampleIds.welcome,
    title: "从这里开始",
    icon: "🌱",
    parent: null,
    properties: { 类型: "指南", 状态: "常读常新", 标签: ["开始", "知识管理"] },
    body: `# 给想法一个可以生长的地方

欢迎来到 **Notdown**。这里的每一页都是电脑上的 Markdown 文件：可以随手写，也可以用熟悉的文本编辑器继续整理。

不必先设计完美的分类。记下一件值得留住的小事，再让它慢慢与其他想法相连。

## 今天，先做三件小事

- [ ] 新建一页，记下今天最想弄明白的问题。
- [ ] 在空行输入 \`/\` 或 \`、\`，插入一段内容。
- [ ] 打开「阅读」「大纲」或「思维导图」，换个角度看看同一份笔记。

:::columns
### 写下来

从一句话开始。支持普通 Markdown、标题、列表、引用与代码。

正文不必遵循固定模板，你可以边写边整理。
:::column
### 连起来

用双链引用另一页，用父页面建立层级。

整理的目的，是让下一次的你更容易找到线索。
:::

## 两个值得先逛逛的地方

::page{id="${sampleIds.garden}"}

::page{id="${sampleIds.syntax}"}

也可以直接阅读 [[${sampleIds.inspiration}|产品灵感]] 与 [[${sampleIds.reading}|阅读札记]]。

## 文件与版本

在工作区设置中可以查看知识库位置。页面属性写在文件开头的 YAML 中，正文仍然是 Markdown。

如果另一个窗口或外部编辑器改了同一页，保存时会保留两个版本供你合并。历史与冲突副本也存为本地文件。

## 这版已经能做什么

可以本地写作、建立父子页面、引用页面、切换知识库视图、整理块、插入附件并导出单页 HTML。

跨设备云同步、完整数据库查询和 MyBase 双向同步仍待实现；当前的冲突处理用于本地版本检查。MyBase 入口目前提供元数据导出。
`,
  },
  {
    id: sampleIds.garden,
    title: "我的知识花园",
    icon: "🪴",
    parent: sampleIds.welcome,
    properties: { 类型: "索引", 状态: "生长中", 标签: ["学习", "连接"] },
    body: `# 让笔记从收藏变成理解

知识花园可以同时容纳粗糙的问题、正在酝酿的观点和逐渐清晰的结论。每次回来，给它多一点自己的判断。

## 三块小小的园地

### 正在观察

- 人们为什么会反复打开某个工具？
- 什么样的笔记能在一个月后继续帮助我？
- 文件自由与界面体验如何共存？

### 正在连接

- [[${sampleIds.inspiration}|产品灵感]]：把观察写成可以验证的小假设。
- [[${sampleIds.reading}|阅读札记]]：区分作者观点与自己的理解。
- [[${sampleIds.syntax}|Markdown 语法指南]]：用少量语法表达清楚的结构。

### 每周回看

- [ ] 给一条旧笔记补上新的理解。
- [ ] 为两条有关联的笔记加上链接。
- [ ] 把一个过大的页面拆成子页面。

## 关于层级和链接

父页面回答「这页放在哪里」，双链回答「这页与什么有关」。两种关系可以同时存在。

你可以在页面顶部修改父页面；它改变的是页面关系，不要求移动文件夹。正文里的子页面入口只负责导航，删除入口不会删除页面。
`,
  },
  {
    id: sampleIds.inspiration,
    title: "产品灵感",
    icon: "💡",
    parent: null,
    properties: {
      类型: "项目",
      状态: "探索中",
      优先级: "高",
      标签: ["产品", "设计"],
    },
    body: `# 好的工具，让注意力回到内容

最近在想：一个让人愿意长期使用的笔记工具，应该怎样平衡写作时的轻松与多年后的可迁移性？

## 一条观察

录入时需要简单，回顾时需要结构。两者不一定要由同一个界面承担。

> 先让记录顺利发生，再让组织能力逐步出现。

## 可以验证的小假设

| 假设 | 最小尝试 | 观察信号 |
| --- | --- | --- |
| 轻量输入更利于开始 | 一页空白和一个斜杠菜单 | 能否直接写下第一句话 |
| 多视图能帮助重新理解 | 同一篇内容切换大纲与思维导图 | 能否发现结构缺口 |
| 可读源文件提高掌控感 | 用外部编辑器打开一页 | 能否清楚辨认内容与属性 |

## 下次动手

- [ ] 用三篇真实笔记试用整个流程。
- [ ] 记录一次查找失败的经历。
- [ ] 为最常用的动作减少一步操作。

相关线索放在 [[${sampleIds.garden}|我的知识花园]]。读到不同观点时，先收进 [[${sampleIds.reading}|阅读札记]] 再来比较。
`,
  },
  {
    id: sampleIds.reading,
    title: "阅读札记",
    icon: "📚",
    parent: null,
    properties: {
      类型: "阅读",
      状态: "待读",
      标签: ["阅读", "思考"],
      已完成: false,
    },
    body: `# 从「读过」到「想明白」

这页是一个可以随时改写的阅读记录。选一篇与你当前问题相关的文章，试着用自己的话留下线索。

## 我带着什么问题开始

我想知道：长期积累的笔记，怎样才能在需要时重新发挥作用？

## 阅读记录

### 作者在说什么

用三句话概括主要观点，暂时不评价。为重要事实保留原文链接和页码。

### 我如何理解

写出与已有经验的联系。若暂时无法解释清楚，就把疑问本身留下来。

### 我还不确定什么

- 这条观点在哪些条件下成立？
- 有哪些相反的例子？
- 下一步该读什么或验证什么？

## 把阅读带回实践

- [ ] 选一个小问题，写出自己的答案。
- [ ] 补一个来自真实经历的例子。
- [ ] 与 [[${sampleIds.inspiration}|产品灵感]] 中的假设建立联系。

回到 [[${sampleIds.garden}|我的知识花园]]，让这次阅读成为更长思考的一部分。
`,
  },
  {
    id: sampleIds.syntax,
    title: "Markdown 语法指南",
    icon: "✍️",
    parent: sampleIds.welcome,
    properties: { 类型: "指南", 状态: "参考", 标签: ["Markdown", "语法"] },
    body: `# 少量语法，清楚表达

直接在页面中阅读、编辑和拖动块。Ctrl+E 切换源码，正文采用 Notion Enhanced Markdown。

## 常用 Markdown

**粗体**突出重点，*斜体*补充语气，\`行内代码\`用于变量或短命令。

- 一级列表
  - 嵌套列表
- [ ] 待办事项
- [x] 已完成事项

> 引用用于保留一段值得回看的话。

\`\`\`ts
const thought = '先记录，再连接';
console.log(thought);
\`\`\`

## 页面双链

可以输入 \`[[页面标题]]\`，或使用更稳定的 \`[[页面ID|显示名称]]\`；保存为官方的 \`<mention-page>\` 标签。

示例：[[${sampleIds.garden}|回到知识花园]]。页面改名后，ID 链接仍然指向同一页。

## 插入子页面入口

独立一行使用以下语法：

\`\`\`md
<page url="#page/${sampleIds.garden}">知识花园</page>
\`\`\`

它只创建入口。实际父子关系由页面顶部的父页面属性决定。

## 两栏内容

\`\`\`md
<columns>
\t<column>
\t\t这里是第一组想法。
\t</column>
\t<column>
\t\t这里是相关的另一组想法。
\t</column>
</columns>
\`\`\`

菜单可插入两栏；格式支持更多列及嵌套分栏。窄屏会自动排成一列。Tab 表示子块，Shift+Enter 在块内换行并保存为 <br>。

## 图片、音视频与文件

通过插入菜单上传附件，应用会生成本地相对路径。也可以使用标准语法：

\`\`\`md
![图片说明](assets/example.png)
<pdf src="assets/example.pdf">文件说明</pdf>
<audio src="assets/example.mp3">录音</audio>
<video src="assets/example.mp4">视频</video>
\`\`\`

以上是语法示例，不附带实际文件。单独一段的本地音视频链接可在阅读视图显示为播放器。

## 同一份正文的不同视角

「大纲」与「思维导图」来自标题和列表。默认页面同时支持阅读、编辑和拖动；父块携带子块移动，子块也能独立拖动，修改写回同一个 Markdown 文件。

编辑器可能整理普通 Markdown 的排版。保留特殊语法时可使用源码模式；尚未实现任意富文本转换的逐字节无损保证。
`,
  },
];

/** Seed only a new, implicit default vault. Existing or explicitly chosen vaults are untouched. */
export async function seedNewDefaultVault(
  vault: ReturnType<typeof createVault>,
  isDefault: boolean,
): Promise<Page[]> {
  if (!isDefault) return [];
  try {
    await fs.lstat(vault.vaultPath);
    return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const result: Page[] = [];
  for (const { id, ...input } of samples)
    result.push(await vault.create({ ...input, body: serializeNotionMarkdown(parseEditorMarkdown(input.body || "")), bodyFormat: "notion-markdown" }, { id }));
  return result;
}
