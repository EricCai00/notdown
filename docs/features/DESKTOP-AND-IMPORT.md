# Windows 桌面版与 Markdown 文件夹导入

当前范围为本地使用：Windows x64 Electron 安装包、知识库选择和文件夹复制导入。编辑器继续使用单一 ProseMirror 文档及自有 Markdown codec；Electron 复用现有 Node 服务与 `createVault`，没有引入另一套正文存储。

## 使用流程

浏览器版可点击侧栏顶部的知识库名称，或 **Workspace settings → Manage knowledge bases**，新建、打开和切换知识库。新库默认按名称创建在数据目录中，也可填写新的或已有空文件夹的绝对路径；打开已有库需填写包含 `pages/` 的根目录。路径属于运行本地服务的电脑，浏览器不弹出系统目录选择器。已知知识库会显示在列表中；不可用目录不会自动重建。

切换前保存当前页面和数据库的待处理编辑；保存失败或冲突时停止切换。勾选 **Open in a new tab** 可保留当前标签页。每库使用独立 URL（`/v/<标识>/`），正文请求、附件、历史及同步配置绑定该 URL，其他标签页继续使用各自的库；服务重启后可重新打开已记录的 URL。根地址继续使用启动时配置的知识库。最近目录记录在数据目录的 `.browser-vaults.json`，不改写 `.env`，也不改变下次启动的默认库。各库仍仅允许一个服务进程写入。

1. 安装并启动 Notdown。首次欢迎页选择 **Create new vault**，在系统目录选择器中选择或新建空文件夹。
2. 已有 Notdown 知识库使用 **Open existing vault**；目录必须包含 `pages/`。欢迎页记录最近十个目录，失效目录会报错，不会自动新建替代库。
3. 点击 **New page** 开始写作。正文写入 `pages/*.md`，通用页面属性写入 `metadata.json`；文档内 YAML／Pandoc title block 可覆盖默认属性，详见[知识库元数据](VAULT-METADATA.md)。新建桌面知识库不自动填充演示内容。
4. 要带入已有笔记，点击 **Import Markdown folder**，选择 GFM、Obsidian 或 Notdown 作为缺省方言，再选择源目录。
5. 预览页面、附件、无效文件及链接提示。存在无效文件时必须明确选择跳过，才能提交可读文件。点击 **Import copies** 前会保存当前页，冲突会阻止导入。

欢迎页的 **Your Notdown vaults** 显示统一数据目录及其已有知识库。填写 **New vault name** 后点击 **Create vault here**，会新建“数据目录／库名”，不复用已有同名目录。库名不能包含路径分隔符或 Windows 保留名称；各库的正文、附件、配置、同步身份和历史互相独立。数据目录与环境变量见[选择知识库](../architecture/DEVELOPMENT.md#选择知识库)。

需要长期文本历史时，可在 **Settings - History** 启用本机 Git；安装版仍需要另外安装 Git 才能启用此可选功能。正常保存不依赖 Git。页面菜单的 **Page history** 支持预览与恢复，范围和限制见[历史与恢复](VAULT-METADATA.md#自动历史与版本恢复)。

导入功能也可在浏览器模式使用。桌面的 **Open another vault** 先保存当前页，再打开欢迎窗口；现有库保持独立窗口，不在原编辑器内替换库及 revision。主窗口使用与系统窗口按钮合并的标签栏，不显示 File / Edit 菜单；知识库操作仍从侧栏进入。同一知识库的页面与数据库可在应用内标签页中打开，操作见[标签页与窗口](WRITING-AND-NAVIGATION.md#标签页与窗口)。每库独立本地服务、会话分区及访问令牌；未携带令牌的本地 HTTP 请求被拒绝。窗口关闭通过受限 preload 请求编辑器收取并保存输入，失败或冲突时保持窗口打开。

## 导入和恢复边界

- 每批最多 500 个文件、总计 20 MiB；单个 Markdown 最多 10 MiB。支持 UTF-8 `.md` / `.markdown`，其他文件作为附件复制；界面排除隐藏文件及隐藏目录。
- 原目录只读。导入根目录及子目录转换为父子页面；每页获得新的稳定导入 ID，不沿用源文件中的页面身份。有效的已有 `syntax` 设置优先于所选缺省方言。
- 保留未知 YAML 字段和注释；规范化副本中的 `id`、`title`、`parent`、`icon`、`properties`、`bodyFormat`、`syntax`，清除旧的收藏、删除、排序、更新时间状态。所有原始字段与文件字节均保存在原件归档中。
- 只修改解析得到的 Markdown 链接、图片及引用定义的目标范围；不全局替换正文、代码围栏或未知语法。标准相对页面链接改为 `#page/<id>`，附件改为 `assets/<name>`；附件查询及锚点保留。页面锚点及查询参数暂不支持，会在预览提示并从副本链接中省略。
- Wiki 链接和原始 HTML 保留原写法，需要手动检查；不会自动完成 Obsidian 工作区或 Notion 导出包迁移。未解析的目标保留原文并给出提示。附件名采用安全扩展名，其他类型使用 `.bin`。
- 导入预览只在内存中保留，30 分钟过期，每个服务最多三批；提交时使用预览的内容快照，不重新读取变化中的源目录。
- 相同名称、方言、相对路径和内容产生相同导入批次。已完成批次再次提交不会重复创建或覆盖导入后编辑的页面；源内容改变则形成新的导入副本，不作为同步更新。
- 写入通过 `createVault.importBatch` 串行执行。导入只新建文件，不更新已有页面，因此不接受覆盖 revision；之后的编辑仍使用 `baseRevision` 与冲突分支。
- `.history/imports/<批次 SHA-256>/manifest.json` 记录源路径与 `<编号>.source` 原件的对应、页面 ID、提示及完成状态。恢复原件时按 manifest 路径复制这些字节即可；目前没有专用恢复界面。
- 提交先归档原件，再写附件及页面，最后标记完成。它不是整批原子事务；中断可能留下已导入的部分。重新选择相同内容可继续；已存在且不同的内容会阻止继续，不强行覆盖。单文件以临时文件同步落盘、硬链接发布，要求目标文件系统支持硬链接（Windows 推荐 NTFS）；不支持时明确失败并保留恢复材料。

## 开发与验证

```sh
npm ci
npm run desktop
npm run desktop:pack
npm run desktop:dist
npm run test:desktop
```

`desktop:build` 先通过 `desktop:runtime` 检查或下载 Electron 二进制，再将前端构建至 `desktop-dist/frontend/`，主进程、本地服务与 preload 构建至 `desktop-dist/`。桌面前端产物独立于浏览器的 `dist/`，避免开发时互相覆盖。首次源码启动需要网络；已有匹配版本时不会重复下载。需要代理的环境可为 Node 配置 `HTTPS_PROXY` 与 `NODE_USE_ENV_PROXY=1`。`desktop:pack` 输出解包应用，`desktop:dist` 输出 NSIS 安装包，均位于 `.run/desktop-release/`。安装包不携带仓库的用户 `vault/`；卸载不删除知识库目录。

`tests/unit/markdown-import.test.ts` 覆盖原文、YAML、链接、重复导入、部分恢复和 HTTP 预览提交。`tests/e2e/import-folder.spec.ts` 使用独立 Chrome 与临时知识库。`tests/e2e/desktop.test.ts` 使用隔离的 Electron 用户配置与临时目录，验证首次建库、关闭保存、冲突阻止关闭、最近目录和多库隔离；可设置 `NOTDOWN_PACKAGED_EXE` 为解包后的 exe 以验证实际打包产物。

当前安装包未签名，没有自动更新；macOS/Linux 安装包和跨设备同步尚未实现。Electron 单实例约束不能替代跨进程文件锁：同一库仍只允许一个服务进程，不要同时用开发服务、MCP 独立进程或另一桌面配置写入同一库。桌面关闭保存不能保证断电、强制终止时尚未提交的输入不丢失。
