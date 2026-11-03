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

- **自由切换写作方式。** 桌面和浏览器工作区支持中英文界面与标签页；提供页面、源码、分屏三种视图、斜杠命令、行内格式、块选择与拖动。
- **连接与整理笔记。** 子页面、搜索、收藏、反向链接、大纲、思维导图和页面关系图。
- **丰富的内容表达。** 图片与音视频、表格、提示块、公式、Mermaid 图表、脚注与引文，可选择不同 Markdown 方言。通过[附件库](docs/features/MEDIA-AND-EMBEDS.zh-CN.md)浏览和复用本地文件。
- **管理结构化信息。** 桌面和 Android 的整页与内嵌数据库提供五种布局和带类型的属性。Wiki 结合可编辑首页与页面集合视图，每页仍是 Markdown 文件。
- **带入已有笔记。** 预览并导入 Markdown 文件夹，或将 Notion 页面和数据库导入为本地副本。
- **掌握自己的文件。** 正文使用本地 Markdown，保存时校验版本，保留可恢复的历史与冲突副本；桌面端可选本地 Git 历史。

配置相应服务或运行环境后，还可以使用 [AI 块](docs/features/AI-BLOCKS.zh-CN.md)、[会议笔记](docs/features/MEETING-NOTES.zh-CN.md)和[可执行笔记本](docs/features/QUARTO.zh-CN.md)，进行内容生成、转写与计算。

## 快速开始

从源码运行需要 **Node.js 24 和 npm**。先在仓库目录安装依赖：

```sh
npm ci
```

### Windows 桌面版

可从 [GitHub Releases](https://github.com/EricCai00/Notdown/releases) 下载 Windows x64 安装包。从源码运行桌面版：

```sh
npm run desktop
```

选择 **Create new vault**，在空文件夹中新建知识库；或用 **Open existing vault** 打开已有 Notdown 知识库。点击 **New page** 即可开始写作。

关闭桌面窗口后，应用继续驻留系统托盘；可从托盘恢复窗口或退出应用。

运行 `npm run desktop:dist` 可生成 Windows x64 安装包，输出在 `.run/desktop-release/`。安装后的用户无需 Node.js。打包和知识库选择详见[桌面版指南](docs/features/DESKTOP-AND-IMPORT.zh-CN.md)。

### 浏览器版

```sh
npm run dev
```

打开 [localhost:4317](http://127.0.0.1:4317)。笔记存放在独立的知识库目录中，使用期间保持终端运行。Windows 用户安装依赖后，也可以双击 [start.cmd](start.cmd)。

可从侧栏顶部或工作区设置中新建、切换知识库。自定义路径、服务重启和生产构建见[运行与开发指南](docs/architecture/DEVELOPMENT.zh-CN.md)。

### Android 预览版

Android 初版连接电脑已有的云端知识库，首次打开需要配置同步；初次下载完成后可离线使用笔记和附件。安装及当前限制见 [Android 指南](docs/features/ANDROID.zh-CN.md)。

### 导入已有笔记

打开侧栏 **Import**，选择 **Import Markdown folder** 或 **Import from Notion API**，检查预览后点击 **Import copies**。导入保留原件；Notion 导入为单向复制，需要有权读取目标内容的 Notion integration。

## 你的文件

每个知识库使用独立目录，正文保存在 `pages/*.md`，每个数据库保存在单独的 `databases/*.json`，附件在 `assets/`，通用页面属性在 `metadata.json`。文档内的 YAML 或 Pandoc title block 可覆盖页面默认属性；Source 视图显示完整 Markdown 文件。

同一知识库只使用一个运行中的服务。备份时复制整个知识库文件夹，以包含附件和元数据。存储、冲突恢复及显式迁移见[知识库元数据说明](docs/features/VAULT-METADATA.zh-CN.md)。

## 当前状态

Notdown 是持续开发中的本地应用原型。

- **多设备同步：** 桌面和 Android 提供可配置 Supabase 或 WebDAV 的实验性前台同步；尚无内置云服务、端到端加密或实时协作。见[配置与限制](docs/features/CLOUD-SYNC.zh-CN.md)。
- **格式兼容：** 支持范围随方言而异，复杂或不支持的内容可能需要源码编辑。
- **数据库与导入：** 数据库提供五种本地布局；导入的公式和汇总为只读快照。Notion 导入会将可访问的附件保存到本地；下载失败的附件和未支持的云端功能仍有缺失。
- **平台支持：** Windows 构建尚未签名；Android 为仍需设备验收的早期开发版本。暂不提供自动更新和 macOS/Linux 安装包。

## 使用文档

| 我想…… | 阅读 |
| --- | --- |
| 熟悉编辑器与页面导航 | [写作与导航](docs/features/WRITING-AND-NAVIGATION.zh-CN.md) |
| 添加文件、媒体或嵌入内容 | [媒体与嵌入](docs/features/MEDIA-AND-EMBEDS.zh-CN.md) |
| 导入已有笔记 | [Markdown 文件夹](docs/features/DESKTOP-AND-IMPORT.zh-CN.md) · [Notion](docs/features/NOTION-IMPORT.zh-CN.md) |
| 使用结构化数据 | [数据库](docs/features/DATABASES.zh-CN.md) |
| 了解 Markdown 兼容范围 | [内容支持范围](docs/reference/NOTDOWN-SUPERSET.zh-CN.md) · [格式契约](docs/FORMAT.zh-CN.md) |
| 查找全部指南与参考资料 | [文档导航](docs/README.zh-CN.md) |

## 参与开发

先阅读[开发指南](docs/architecture/DEVELOPMENT.zh-CN.md)、[仓库目录说明](docs/architecture/REPOSITORY.zh-CN.md)和[贡献约定](AGENTS.zh-CN.md)。项目使用 TypeScript、Vite、本地 Node 服务、ProseMirror 和 CodeMirror。

修改后运行 `npm test` 和 `npm run build`；编辑交互改动还需运行 `npm run test:e2e`。测试使用临时知识库。

## 致谢

思源为本地存储设计提供参考，AFFiNE 和 AppFlowy 为块交互提供参考。Notdown 是独立实现的项目。

感谢 ProseMirror、CodeMirror、markdown-it、Lucide、KaTeX、Mermaid 及其他依赖项目。随附字体保留各自的许可证：[Noto](src/assets/fonts/LICENSE-Noto.txt)、[OpenMoji](src/assets/fonts/LICENSE-OpenMoji.txt)。
