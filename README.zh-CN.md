<p align="center">
  <img src="src/assets/notdown-icon.png" alt="Notdown 图标" width="128" height="128">
</p>

<h1 align="center">Notdown</h1>

<p align="center">用块整理思路，用 Markdown 保存笔记。</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#主要功能">主要功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#当前状态">当前状态</a> ·
  <a href="#使用文档">使用文档</a>
</p>

Notdown 是一款将块编辑与 Markdown 文件结合的本地笔记应用。你可以直接在页面上写作、编辑源码，或将两种视图并排使用；用页面层级和链接组织笔记，文件保存在自己的电脑上。

## 主要功能

- **自由切换写作方式。** Page、Source、Split 三种视图，支持斜杠命令、行内格式、块选择与拖动。
- **连接与整理笔记。** 子页面、搜索、收藏、反向链接、大纲、思维导图和页面关系图。
- **丰富的内容表达。** 图片与音视频、表格、提示块、公式、Mermaid 图表、脚注与引文，可选择不同 Markdown 方言。通过[附件库](docs/features/MEDIA-AND-EMBEDS.md)浏览和复用本地文件。
- **管理结构化信息。** 本地数据库提供表格视图和带类型的属性，每条记录对应 Markdown 页面。
- **带入已有笔记。** 预览并导入 Markdown 文件夹，或将 Notion 页面和数据库导入为本地副本。
- **掌握自己的文件。** 正文使用本地 Markdown，保存时校验版本，保留历史快照与可恢复的冲突副本。

配置相应服务或运行环境后，还可以使用 [AI 块](docs/features/AI-BLOCKS.md)、[会议笔记](docs/features/MEETING-NOTES.md)和[可执行笔记本](docs/features/QUARTO.md)，进行内容生成、转写与计算。

## 快速开始

从源码运行需要 **Node.js 24 和 npm**。先在仓库目录安装依赖：

```sh
npm ci
```

### Windows 桌面版

```sh
npm run desktop
```

选择 **Create new vault**，在空文件夹中新建知识库；或用 **Open existing vault** 打开已有 Notdown 知识库。点击 **New page** 即可开始写作。

运行 `npm run desktop:dist` 可生成 Windows x64 安装包，输出在 `.run/desktop-release/`。安装后的用户无需 Node.js。打包和知识库选择详见[桌面版指南](docs/features/DESKTOP-AND-IMPORT.md)。

### 浏览器版

```sh
npm run dev
```

打开 [localhost:4317](http://127.0.0.1:4317)。默认知识库为 `./vault`，使用期间保持终端运行。Windows 用户安装依赖后，也可以双击 [start.cmd](start.cmd)。

自定义知识库路径、后台服务重启和生产构建见[运行与开发指南](docs/architecture/DEVELOPMENT.md)。

### Android 预览版

Android 初版共用桌面编辑器与文件格式，支持离线笔记、图片和知识库 ZIP 备份。构建、安装及当前限制见 [Android 指南](docs/features/ANDROID.md)。

### 导入已有笔记

在侧栏选择 **Import Markdown folder** 或 **Import from Notion API**，检查预览后点击 **Import copies**。导入保留原件；Notion 导入为单向复制，需要有权读取目标内容的 Notion integration。

## 你的文件

笔记正文保存在 `vault/pages/*.md`，附件在 `vault/assets/`，通用页面属性在 `vault/metadata.json`。文档内的 YAML 或 Pandoc title block 可覆盖这些默认属性；Source 视图显示完整 Markdown 文件。

同一知识库只使用一个运行中的服务。备份时复制整个知识库文件夹，以包含附件和元数据。存储、冲突恢复及显式迁移见[知识库元数据说明](docs/features/VAULT-METADATA.md)。

## 当前状态

Notdown 是持续开发中的本地应用原型，界面目前仅提供英文。

- **多设备同步：** 桌面和 Android 提供可配置 Supabase 或 WebDAV 的实验性前台同步；尚无内置云服务、端到端加密或实时协作。见[配置与限制](docs/features/CLOUD-SYNC.md)。
- **格式兼容：** 支持范围随方言而异，复杂或不支持的内容可能需要源码编辑。
- **数据库与导入：** 数据库目前提供表格视图；导入的公式和汇总为只读快照。Notion 导入会将可访问的附件保存到本地；下载失败的附件和未支持的云端功能仍有缺失。
- **平台支持：** Windows 构建尚未签名；Android 为仍需设备验收的早期开发版本。暂不提供自动更新和 macOS/Linux 安装包。

## 使用文档

| 我想…… | 阅读 |
| --- | --- |
| 熟悉编辑器与页面导航 | [写作与导航](docs/features/WRITING-AND-NAVIGATION.md) |
| 添加文件、媒体或嵌入内容 | [媒体与嵌入](docs/features/MEDIA-AND-EMBEDS.md) |
| 导入已有笔记 | [Markdown 文件夹](docs/features/DESKTOP-AND-IMPORT.md) · [Notion](docs/features/NOTION-IMPORT.md) |
| 使用结构化数据 | [数据库](docs/features/DATABASES.md) |
| 了解 Markdown 兼容范围 | [内容支持范围](docs/reference/NOTDOWN-SUPERSET.md) · [格式契约](docs/FORMAT.md) |
| 查找全部指南与参考资料 | [文档导航](docs/README.md) |

## 参与开发

先阅读[开发指南](docs/architecture/DEVELOPMENT.md)、[仓库目录说明](docs/architecture/REPOSITORY.md)和[贡献约定](AGENTS.md)。项目使用 TypeScript、Vite、本地 Node 服务、ProseMirror 和 CodeMirror。

修改后运行 `npm test` 和 `npm run build`；编辑交互改动还需运行 `npm run test:e2e`。测试使用临时知识库。

## 致谢

思源为本地存储设计提供参考，AFFiNE 和 AppFlowy 为块交互提供参考。Notdown 是独立实现的项目。

感谢 ProseMirror、CodeMirror、markdown-it、Lucide、KaTeX、Mermaid 及其他依赖项目。随附字体保留各自的许可证：[Noto](src/assets/fonts/LICENSE-Noto.txt)、[OpenMoji](src/assets/fonts/LICENSE-OpenMoji.txt)。
