# Markdown 正文格式 v0.3：Notion Enhanced Markdown

正文采用 [Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)，行为同时参考 [Working with markdown content](https://developers.notion.com/guides/data-apis/working-with-markdown-content)。核对日期：2026-09-12。这是 Notion Markdown API 的格式，与界面「Markdown & CSV」ZIP 导出不同。

不再生成 `:::nest`、`:::columns`、`::page` 等私有指令。[旧语法](FORMAT-LEGACY.md) 保留兼容读取；`[[...]]` 可用于键盘输入页面提及，保存采用官方 `<mention-page>`。

## 文件和迁移

页面是 UTF-8 的 `vault/pages/<uuid>.md`，YAML 后为正文：

```yaml
---
id: 550e8400-e29b-41d4-a716-446655440000
title: 示例页面
parent: null
icon: 📄
bodyFormat: notion-markdown
properties:
  status: 草稿
---
```

Notion 规范定义正文；页面稳定 ID、唯一父页和 MyBase 属性继续放在 YAML，不混入正文。元信息修改保留未知 YAML 字段和注释。

新页面默认 `bodyFormat: notion-markdown`；没有字段或明确为 `markdown` 的旧页面按原 CommonMark 规则读取，不能仅凭换行猜测格式。旧页面在首次结构化编辑或打开源码视图时转换，正文和格式字段一起经过 CAS 保存。旧单换行留在原块内并写为 `<br>`；缩进代码转换为围栏代码；父子块和分栏转换为官方语法。不在启动时遍历改写知识库。历史与冲突分支保留各自格式和正文。

## 块、层级与换行

以下缩进为实际 Tab（U+0009），不是四个空格：

```md
父块第一行<br>父块第二行
子块
孙块
另一个顶层块
<empty-block/>

- 列表父项
  - [ ] 子待办<br>同一任务的第二行
        普通文本子块

## 可折叠标题 {toggle="true"}

    标题的子块

> 引用第一行<br>同一引用的第二行
> 另一个引用块
```

相邻普通块使用单个换行；空白行只用于源码排版。`<br>` 对应 `Shift+Enter`；`<empty-block/>` 保留空块，也能作为空父块。普通 Markdown 没有任意文本块的父子语义，通用渲染器不会直接还原这个树。

每个列表项独立编辑，父项拖动携带子树，子项可单独移动。标题按官方规范使用 H1–H4，H5/H6 转为 H4；带子块的标题使用 `{toggle="true"}`。代码采用围栏，内部 Tab、标签和旧指令保持字面含义。

## 分栏、页面和附件

```md
<columns>
	<column>
		左栏内容
	</column>
	<column>
		右栏内容
	</column>
</columns>
<page url="#page/页面ID">子页面名称</page>
相关内容见 <mention-page url="#page/页面ID">页面名称</mention-page>。
![图片说明](assets/picture.png)
<audio src="assets/recording.mp3">录音</audio>
<video src="assets/demo.mp4">演示</video>
<file src="assets/archive.zip">附件</file>
<pdf src="assets/paper.pdf">论文</pdf>
```

插入菜单提供两栏，解析接受两栏以上及嵌套分栏；窄屏纵向排列。`<page>` 为块级入口，`<mention-page>` 为行内引用。`url` 使用已有 `#page/<id>` 导航地址表示本地页，外部 URL 保留为外部引用。删除入口不会删除页面或改写 YAML 父子关系。光标进入页面链接时不展开源码。

上传生成 assets 相对路径；音视频显示播放器，文件和 PDF 提供链接。普通 `[文字](URL)` 仍是普通链接。

## 提示、折叠、格式和公式

```md
<callout icon="💡" color="blue_bg">
	提示内容，可以包含 **格式**。
</callout>
<details>
<summary>折叠标题</summary>
	子内容
</details>
<span color="red">重点</span>与<span underline="true">下划线</span>
整块底色 {color="yellow_bg"}
行内公式 $x^2$。
$$
x^2 + y^2 = z^2
$$
```

提示块和折叠内容可编辑；公式由本地 KaTeX 渲染，点击编辑 LaTeX。颜色仅使用规范的有限名称映射，不执行任意 CSS。

## 表格和目录

```md
<table fit-page-width="true" header-row="true" header-column="false">
	<colgroup>
		<col width="160"/>
		<col width="240"/>
	</colgroup>
	<tr>
		<td>名称</td>
		<td>内容<br>第二行</td>
	</tr>
</table>
<table_of_contents/>
```

单元格可编辑文字、格式和内部换行。Tab/Shift+Tab 在单元格间移动，末格 Tab 新增一行。保留列宽及表头属性；`td`、`tr`、`col` 上的 `color` 按单元格、行、列的优先级显示，编辑和 HTML 导出也保留。兼容官方示例的 GFM 管道表格，修改后写为 XML 表格。目录由同一正文的标题生成。

## 其他引用与边界

```md
<database url="https://www.notion.so/database-id" inline="true" icon="📚">资料库</database>
<mention-user url="user://user-id">成员名称</mention-user>
<mention-date start="2026-09-12"/>
<synced_block_reference url="https://www.notion.so/block-id">
内容快照
</synced_block_reference>
<unknown url="https://www.notion.so/block-id" alt="bookmark"/>
```

支持 user/page/database/data-source/agent/date 提及，日期属性按原文保留。数据库块为入口引用，数据、视图、过滤器、公式和权限仍属于数据库/MyBase 层。`synced_block` 与 `synced_block_reference` 保存本地内容快照和来源，尚未建立跨页或 Notion 云端联动。

官方 API 尚未直接输出 bookmark、embed、link preview、breadcrumb 等内容，而使用 `<unknown>`；本地保留其引用。未知标签、未闭合或非法容器原文保留，不解释为可执行 HTML。自定义 emoji 的 `:name:` 和尚未实现的 meeting-notes 内容保留源码；未接入成员/emoji 资源目录和会议转录服务。

Enhanced Markdown 未修改时保留原文；编辑后未改动顶层子树保留原文，变更子树按规范序列化。旧格式转换会规范化缩进、围栏和分隔，完整旧版本保存在历史中。不承诺任意外部格式或整个 Notion 工作区无损互转。

## 共享解析与 AI

编辑器、源码、大纲、引用图、HTML 导出识别同一个 `bodyFormat`。HTML 导出保留分栏、提示、链接、颜色、表格和公式；附件仍为相对路径。

MCP 读页返回 `bodyFormat`；写页使用完整正文及读取时的 `baseRevision`。修改格式时同时提交转换后的正文，保留 `<unknown>` 与其他未知内容。MyBase 属性契约见 [MYBASE.md](MYBASE.md)。
