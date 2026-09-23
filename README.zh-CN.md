# Notdown

以本地 Markdown 文件为基础，结合块编辑与页面组织的笔记应用。

[English](README.md) · **简体中文**

Notdown 将透明的 Markdown 文件与结构化编辑体验结合起来。编辑器使用单一 ProseMirror 文档和自有 Markdown codec；页面属性写入 YAML，笔记始终保存在本地知识库文件中。

**项目状态：** 持续开发中的本地应用原型。已实现版本校验和可恢复的冲突副本；尚未实现协作与跨端同步。应用界面目前仅提供英文。

[快速开始](#快速开始) · [主要功能](#主要功能) · [格式与存储](#格式与存储) · [当前限制](#当前限制) · [开发](#开发) · [文档](#文档)

## 快速开始

### 环境要求

- Node.js 24 和 npm。
- 现代浏览器；浏览器测试需要本机安装 Google Chrome。
- Pandoc 为可选依赖，日常编辑无需安装。

在仓库目录运行：

```sh
npm ci
npm run dev
```

打开 [http://127.0.0.1:4317](http://127.0.0.1:4317)。本地知识库 API 地址为 `http://127.0.0.1:4318`。关闭终端会停止开发服务。

Windows 用户安装依赖后，也可以双击 [`start.cmd`](start.cmd)。它在后台启动服务，检查就绪后打开浏览器，日志写入 `.run/logs/`。

### 选择知识库

默认知识库为 `./vault`。如需使用其他目录，在启动服务前设置 `VAULT_PATH`。例如 PowerShell：

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

仅首次启动新建的默认知识库时创建示例笔记；已有知识库和显式配置的目录不会自动填充。已有 Markdown 文件需要有效的页面元信息，不会自动导入任意文件夹。

### 在本地运行生产构建

```sh
npm run build
npm start
```

打开 [http://127.0.0.1:4318](http://127.0.0.1:4318)，该地址同时提供构建后的应用与 API。同一知识库仅使用一个本地服务进程。认证和多进程锁尚未实现，服务面向本机使用。

## 主要功能

具体能力取决于页面方言及已启用的扩展。

| 领域 | 当前已实现 |
| --- | --- |
| 编辑 | 页面、源码、双栏视图共用草稿和撤销历史；斜杠命令、行内格式、嵌套列表、块选择与拖动。 |
| 页面组织 | 父子页面、侧栏排序、收藏、搜索、反向链接、页面引用，以及回收站和恢复。 |
| 视图与阅读 | 知识库画廊、属性列表、树和关系图；页面大纲、思维导图、标题折叠与阅读目录。 |
| Markdown 内容 | 多种方言预设、代码高亮、KaTeX 公式、Mermaid 图表、脚注、引文、表格和元数据编辑。 |
| 页面外观 | 点击已有 Emoji 图标可更换；仅在缺少图标或封面时显示 Add icon / Add cover。内置与上传封面可通过横幅工具栏更换、调整位置；支持 emoji 显示风格与 YAML 属性编辑。 |
| Notdown 扩展 | Tabs、书签、链接预览、面包屑、本地按钮、HTML 文档和网页嵌入。 |
| 联系人与日期 | 本地联系人及人物提及；日期编辑，以及 Notdown 方言下应用运行期间的提醒。 |
| 文件与导出 | 本地附件、图片与媒体播放、单页 HTML 导出及 MyBase 元数据导出。 |
| 本地数据保护 | 带版本校验的保存、历史快照、外部修改检测，以及可恢复的冲突副本和显式合并。 |
| 集成 | stdio MCP 桥接；可选的 GitHub、OneDrive / SharePoint 预览；可配置的文本生成与转录服务。 |

复杂表格、图表、混合 HTML 等部分结构采用预览配合源码编辑。列出某项能力，不代表完整可视化编辑或与所有上游格式完全兼容。

### 常用操作

| 操作 | 方式 |
| --- | --- |
| 搜索页面 | `Ctrl+P`；正文编辑器外也可使用 `Ctrl+K`。 |
| 切换页面／源码 | `Ctrl+E` |
| 立即保存 | `Ctrl+S` |
| 插入内容 | 正文输入 `/`，或点击块旁的 `+`。 |
| 移动或管理块 | 拖动或点击六点手柄。 |
| 调整列表层级 | `Tab` / `Shift+Tab` |

切换视图前会收取待处理输入。源码定位与双栏滚动按块映射；复杂或经过重排的内容不保证逐字符对应。

## 格式与存储

### Markdown 方言

预设包括 Notdown、Notion-flavored Markdown、Typora、Obsidian、CommonMark、GFM、Pandoc Markdown、CommonMark X、Original Markdown、PHP Markdown Extra、MultiMarkdown 和旧 GitHub Markdown。

页面语法配置保存在 YAML 的 `syntax` 字段中。切换方言会重新解释同一份源码，不会迁移整个知识库。

- **Notdown** 集合已支持的 Markdown 方言能力与 Notion 内容。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、块属性、inline 和 style；已有方言能够表达时，复用其语法。
- **`notion-markdown`** 仅启用官方 Enhanced Markdown 定义的语法。Notdown 补充编码仅限 `syntax.variant: notdown`，显式扩展开关也不能越过此边界。
- 未知语法、旧内容和未知字段保留以供恢复。未编辑内容在支持范围内复用原文；编辑过的结构可能规范化空白或标记，不承诺任意输入都能逐字节往返。

详见[格式契约](docs/FORMAT.md)、[方言符合性](docs/reference/DIALECT-CONFORMANCE.md)与[当前语法边界](docs/audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)。

### 知识库结构与保存

```text
vault/
  pages/*.md          Markdown 正文与 YAML 页面属性
  people/*.yaml       本地联系人
  assets/             上传附件
  .history/           页面快照与冲突副本
  .notdown/           本地集成设置
```

Markdown 文件是正文真相，不是缓存的块 JSON。页面需要有效的 `id` 和 `title` 元信息；遇到损坏的 YAML 或重复 ID 时拒绝写入，保留原文件。

所有更新经由 `createVault`，并使用 `baseRevision`。版本过期时保留两份可恢复内容，不会静默强制重试覆盖。外部刷新不会替换未保存正文，浏览器草稿按窗口隔离；关闭窗口后，未保存草稿不构成完整的恢复机制。

可选集成的凭据保存在本地 `.notdown/` 中，与页面 Markdown 分开。调用已配置的生成或转录功能时，相应文字或音频会发送给所配置的服务。

## 当前限制

- **尚无协作或跨端同步。** 本地版本校验和冲突副本不是同步服务；本地同步块不连接 Notion 云端同步。
- **尚无 Notion 数据库、工作区成员、权限或完整云端自动化。** People 是本地联系人，不是用户账号；提及不发送通知。
- **格式兼容仍有边界。** 未实现所有上游规则及扩展组合；完整表格选区与行列管理、任意块嵌套、跨页面拖动仍不完善。
- **提醒依赖应用运行。** 不提供关闭应用后的系统调度、邮件提醒或重复提醒。
- **导入导出范围有限。** HTML 仅导出单页，附件保留相对链接，不打包整个知识库；尚无任意 Markdown 文件夹批量导入和历史回滚界面。
- **仍需进一步交互验收：** 系统级中文 IME、触控、无障碍和大文档。桌面封装与离线移动端属于后续工作。

## 开发

项目使用 TypeScript，包含 Vite 前端和本地 Node 服务；ProseMirror 负责正文编辑，CodeMirror 负责源码编辑。

```text
src/          应用、文档 codec、编辑器、块、功能与集成
server/       Markdown 知识库、HTTP API 与 MCP 桥接
tests/unit/   模型、格式、服务与协议测试
tests/e2e/    独立 Chrome 浏览器测试
docs/         架构、契约、参考与历史记录
scripts/      启动与维护脚本
public/       静态资源
.run/logs/    本地执行日志（不入库）
```

开发入口和文件归属见[仓库组织约定](docs/architecture/REPOSITORY.md)。`vault/` 是用户数据，不能作为测试样本目录。

### 验证

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

单元与服务测试使用临时知识库。浏览器测试使用独立无界面 Chrome 和临时知识库，不连接用户浏览器。报告与 trace 写入 `test-results/`。

并行运行浏览器测试时，使用独立构建目录和端口。例如 PowerShell：

```powershell
npm run build -- --outDir .run/e2e-dist
$env:NOTDOWN_E2E_PORT = '4330'
$env:NOTDOWN_E2E_FRONTEND_DIR = '.run/e2e-dist'
npx playwright test --output test-results/e2e-isolated --reporter=list
```

### 工具与集成

- **Block Explorer：** 打开 [`/block-catalog.html`](http://127.0.0.1:4317/block-catalog.html)，或从侧栏进入，查看内容对象、方言、语法示例及扩展来源。
- **Markdown Lab：** 打开 [`/markdown-lab.html`](http://127.0.0.1:4317/markdown-lab.html)，对照源码与渲染输出；它独立于知识库自动保存。外部渲染器配置见 [Lab 指南](docs/features/MARKDOWN-LAB.md)。
- **MCP：** 先启动本地 API，再从仓库目录运行 `npm run mcp`。桥接使用 stdio，默认 `NOTE_API_URL=http://127.0.0.1:4318`。各客户端启动配置不同；更新必须使用读取返回的 revision。见 [API 参考](docs/reference/API.md)。
- **MyBase：** 导出当前页面的元数据，使用稳定 UUID 身份和明确的数据类型，不自动写入 MyBase 主库。见[集成契约](docs/reference/MYBASE.md)。

## 文档

详细文档目前以中文为主。

| 入口 | 内容 |
| --- | --- |
| [文档导航](docs/README.md) | 全部架构、功能、参考和验证文档。 |
| [格式契约](docs/FORMAT.md) | Markdown、元数据、原文保留与序列化规则。 |
| [仓库组织约定](docs/architecture/REPOSITORY.md) | 开发入口与文件归属。 |
| [Notdown 内容范围](docs/reference/NOTDOWN-SUPERSET.md) | 已支持的内容与格式边界。 |
| [People](docs/features/PEOPLE.md) / [链接预览](docs/features/LINK-PREVIEWS.md) | 本地联系人与外部预览行为。 |
| [验证记录](docs/verification/VERIFICATION.md) | 按日期记录的验证证据，不代表当前完整覆盖。 |
| [旧版 README — 2026-09-23](docs/archive/README-2026-09-23.zh-CN.md) | 历史细节，包含已被后续修订覆盖的实现说明。 |

## 致谢

本地存储设计参考思源，块交互参考 AFFiNE 和 AppFlowy。Notdown 是独立实现，不是这些应用的完整 fork。

项目使用 ProseMirror、CodeMirror、markdown-it、Lucide、KaTeX、Mermaid 等依赖，遵循各自许可。可选的 Pandoc 渲染调用单独安装的可执行文件。内置 emoji 字体保留许可说明：[Noto — SIL OFL 1.1](src/assets/fonts/LICENSE-Noto.txt) 与 [OpenMoji — CC BY-SA 4.0](src/assets/fonts/LICENSE-OpenMoji.txt)。
