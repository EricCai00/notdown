# Notdown

一个以本地 Markdown 为正文真相的笔记应用原型。目标是把 Obsidian 的文件透明性与 Notion 的页面组织、阅读体验结合起来。

比较了工作区中的 SiYuan、AFFiNE、AppFlowy、Anytype 和 AnyBlock。当前使用 **ProseMirror 连续编辑器 + Markdown 文件内核**：页面/存储参考思源，列表层级和块交互参考 AFFiNE、AppFlowy。早期 Vditor 实现已被替换，以支持独立列表项、连续选区、统一撤销和固定的页面链接节点。上游 clone 和 MyBase 项目保持独立；本项目不是完整上游 fork。理由与代码证据见 [选型记录](docs/FOUNDATION.md)。

默认「页面」将阅读、编辑和块整理合并：直接点击正文编辑，拖动左侧六点手柄调整顺序，Markdown 随之保存；`Ctrl+E` 在页面与源码之间切换。仅在块左侧区域悬停显示六点手柄，不额外显示加号。已通过独立 Chrome 的输入、拖动、保存和链接交互测试；参考和实际边界见 [Notion 交互参考](docs/NOTION-REFERENCE.md)。

`Enter` 创建新块，`Shift+Enter` 在当前段落/列表项内换行。列表项行首退格先去掉标记，退出列表后的空行退格直接回到上一项末尾。普通文本支持 `Tab` 建立父子关系及 `Shift+Tab` 提升。正文采用 [Notion Enhanced Markdown（FORMAT v0.3）](docs/FORMAT.md)：Tab 表示子块、`<br>` 表示块内换行、官方标签表示分栏和页面入口，不再生成私有指令。旧笔记按原格式读取，在编辑或打开源码时转换并通过版本检查保存。

## 运行

**Windows 一键启动：双击此目录的 `start.cmd`。** 它在后台启动本地文件服务和网页服务，检查页面、API 及编辑器模块后再打开浏览器。重复启动会复用同一知识库的运行实例；日志保存在 `.run/`。首次安装需先执行 `npm ci`。

需要 Node.js 24 和 npm。在此目录执行：

```powershell
npm ci
npm run dev
```

打开 <http://127.0.0.1:4317>。本地文件服务监听 `127.0.0.1:4318`。编辑器依赖由 Vite 从本地安装的包加载，常规编辑不依赖公共 CDN。

`npm run dev` 是前台开发命令，关闭其终端会停止服务；日常体验可使用上述独立后台启动入口。

```powershell
npm run build
npm start
```

构建后由本地文件服务在 <http://127.0.0.1:4318> 同时提供页面和 API。首次启动隐式默认知识库时创建五篇示例笔记；现有知识库或显式配置的目录不会被自动填充。

自选知识库：

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

当前仅支持一个本地服务进程操作同一知识库。不要把开发服务直接暴露到公网；认证、远端同步与多进程锁尚未实现。

## 已实现

| 能力 | 当前行为 |
| --- | --- |
| Markdown 文件 | `vault/pages/<id>.md`，UTF-8 正文 + YAML 元信息；元信息修改保留未知 YAML 字段和正文 |
| 页面层级 | 稳定 ID、唯一父页面、子页面；移动不依赖文件夹；拒绝父子循环 |
| 页面与源码 | 阅读、编辑、块整理共用「页面」；点击正文原位编辑，自动保存；`Ctrl+E` 切换源码前收取输入 |
| 插入 | 正文输入 `/`、`、` 弹出光标附近的菜单，查询继续在正文输入；方向键选择、Enter 执行、Escape 取消；含标题、列表、待办、引用、代码、行内代码、页面链接、子页、两栏和附件 |
| 块操作 | 每个 bullet/todo 独立成块；Tab/Shift+Tab 调整列表嵌套；父块拖动携带整棵子树，子项也可独立拖动；六点菜单转换、复制、删除；文字与结构共用撤销 |
| Notion 正文格式 | `<mention-page>` 页面提及、`<page>` 页面入口、`<columns>/<column>` 分栏、Tab 子块、`<br>` 换行、`<empty-block/>` 空块；旧私有语法兼容读取，`[[...]]` 可作为输入快捷方式 |
| 扩展块 | 提示块、可折叠内容、简单表格与单元格 Tab 导航、块/行内颜色、下划线、KaTeX 公式、目录；数据库/成员/日期引用及未知块保留 |
| 知识库视图 | 画廊、属性列表、父子页面树、页面引用关系图；搜索支持中文、引号短语、标题优先和最近访问，方向键选择结果、Enter 打开 |
| 笔记视图 | 页面、大纲、思维导图、源码；通过右上角页面菜单选择，大纲与脑图仍由同一 Markdown 派生 |
| 阅读优化 | 简化页面工具栏，属性默认收起；彩色标题层级、标题块菜单折叠章节；Notion 风格右侧目录，收起为短横线，悬停/键盘聚焦展开或常驻，标题逐级缩进、当前章节随滚动高亮，长目录可滚动；点击目录自动展开目标所在的折叠章节，页尾保留所点标题高亮，手动滚动后恢复跟随；窄屏布局 |
| 文件和媒体 | 本地附件上传；标准 Markdown 图片、文件链接；页面内支持本地音视频播放器及可点击的待办复选框 |
| HTML 导出 | 单页 HTML 含静态样式；附件仍是相对链接，需要保留同级 assets；不打包全库 |
| 冲突与历史 | 文件 SHA-256 版本校验、原子替换、历史快照；冲突保存为独立 `.md`，界面对照并显式合并 |
| 外部修改 | 每五秒重新读取文件；有未保存内容时不自动替换；冲突时保留两份内容 |
| AI MCP | 官方 SDK 的 stdio MCP：列页、读页、建页、带版本检查的改页 |
| MyBase | 真实 MBN 元数据导出、稳定 `Note UUID` 身份和明确的属性类型；已通过现有 MyBase 解析器检查 |

正文现在是一个 ProseMirror 文档，具有连续选区、跨块删除和统一撤销。Markdown codec 为未修改的顶层内容保留原文；修改过的结构可能规范化列表缩进、分隔和标记形式。引用定义、CRLF、代码围栏及未知扩展有独立回归测试，仍不承诺任意输入都字节级往返。

当前边界：未知扩展使用源码保留。表格支持基础单元格编辑，尚未包含完整的选区、合并单元格和行列管理界面。数据库块为入口引用；同步块保存内容快照，尚未连接数据库执行器、Notion 服务或跨页同步。成员/日期提及保留结构，自定义 emoji 资源目录与会议转录尚未接入。Tab 支持列表项、普通文本及文本父块；系统级中文 IME、触控、多块框选、跨页面拖动和大文档性能仍需进一步验收。

`Ctrl+P` 搜索；正文编辑器外也可用 `Ctrl+K` 搜索，正文内保留该组合键给编辑器。`Ctrl+E` 切换页面/源码，`Ctrl+S` 立即保存。浏览器草稿按窗口隔离，刷新同一窗口可以恢复；窗口关闭后尚未写入磁盘的草稿不是完整的恢复机制。页面标题和父页面不随正文重复存储，均在 YAML 中。

## 文件结构

```text
Notdown/
  src/                   界面、Markdown parser、MyBase 导出
  server/                Markdown vault、HTTP API、MCP
  test/                  存储/格式/协议测试（独立临时知识库）
  docs/                  选型、格式、集成契约
  vault/                 默认知识库（不纳入源码管理）
    pages/*.md
    assets/*
    .history/<page-id>/*.md
    .history/conflicts/*.md
    .history/conflicts/resolved/*
```

页面文件必须有合法的 `id`、`title` 元信息。遇到损坏的 YAML 或重复 ID 会拒绝写入，保留原文件。任意已有 Markdown 目录的批量导入、删除/回收站和历史回滚界面还未实现。

## MyBase 和 MCP

MyBase 位于 `D:\Workspace\mybase`，其权威源码是 `.mybase`；RDF 是查询/交换投影，不能替代有序的 Markdown 正文。当前通过工作区设置导出当前页面的 `.mybase` 元数据，没有自动写入主库或执行 Query。详细映射、现有 API、视图以及实际解析验证见 [MyBase 集成契约](docs/MYBASE.md)。

先启动本地文件服务，再让 MCP 客户端启动桥接进程，例如通用 JSON 配置：

```json
{
  "mcpServers": {
    "notdown": {
      "command": "node",
      "args": [
        "D:/Workspace/note-app/markdown-workbench/node_modules/tsx/dist/cli.mjs",
        "D:/Workspace/note-app/markdown-workbench/server/mcp.ts"
      ],
      "env": { "NOTE_API_URL": "http://127.0.0.1:4318" }
    }
  }
}
```

这是客户端配置示例，没有修改任何现有 AI 客户端配置。不同客户端的外层配置形式可能不同；桥接进程本身使用标准 MCP stdio。更新工具必须使用读取返回的 `revision`，不会自动吞掉冲突或强行重试。

示例中的 `D:/Workspace/note-app/markdown-workbench` 是当前本地目录，请按实际克隆位置调整。应用名称为 Notdown；改名后首次打开会迁移当前浏览器中的旧版设置和草稿。

## 验证

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

自动测试覆盖 Markdown 原文与未知 YAML、父子循环、同 revision 并行保存、冲突分支与再次合并、损坏数据保留、目录逃逸、HTTP 来源检查、完整块重排/替换/插入/删除、隐藏引用定义保留、任务框的精确源码更新、双链代码边界、有限扩展、HTML 安全、搜索排序、MyBase 转义，以及真实 MCP 客户端的握手和读写冲突。测试用临时目录，不操作用户知识库或现有 MyBase。

浏览器测试启动独立临时知识库，使用本机 Chrome 的独立无界面实例，不连接用户浏览器。覆盖斜杠补全、Markdown 输入、列表 Tab、父子项拖动、链接显示、菜单操作、源码保存与刷新。截图和 trace 输出到 `test-results/`；详细结果和历史验收分开记录在 [验证记录](docs/VERIFICATION.md)。

## 后续顺序

1. 扩展交互验收：系统中文 IME、键盘搜索、窄屏、触控、屏幕阅读器与大文档。
2. 编辑器扩展：表格行列管理、任意块嵌套、多块框选和跨页拖动；扩充官方 Enhanced Markdown 往返语料库。
3. 同步内核：内容寻址快照 + 父版本 + 设备 ID；三方合并无冲突修改，冲突生成分支。补齐离线队列、附件哈希、删除墓碑、重命名、认证和跨设备故障恢复。当前 CAS 仅为此基础，**不是已经完成云同步**。
4. MyBase 只读集成：共用已存在的属性和 Query 语义，接入 table/poster/map/tree/graph，解析 `mybase:Q…` 引用；再定义双向修改的权威来源及 revision 协议。
5. 桌面封装和移动端：目录选择、应用生命周期保存、回收站与恢复、离线移动端、无障碍键盘与触控验收。

## 第三方来源

实际依赖为 ProseMirror 各模块、markdown-it、Lucide 等，保留上游许可。AFFiNE、AppFlowy、Anytype 源码用于理解层级、页面提及、菜单、焦点和筛选；没有引入其文档存储或完整应用。Vditor/Lute 已从运行依赖中移除；旧生成目录可能仍存在，但不被编辑器引用。参考路径列在 [交互参考](docs/NOTION-REFERENCE.md)。
