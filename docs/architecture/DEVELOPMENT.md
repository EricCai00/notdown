# 运行与开发指南

本页集中说明从源码运行、选择知识库、重启服务和执行测试。首次使用入口见项目 [README](../../README.zh-CN.md)，文件归属见[仓库组织约定](REPOSITORY.md)。

## 环境与启动

使用 Node.js 24 和 npm。在仓库目录运行：

```sh
npm ci
npm run dev
```

浏览器打开 [http://127.0.0.1:4317](http://127.0.0.1:4317)，本地 API 位于 `http://127.0.0.1:4318`。关闭终端或按 Ctrl+C 会停止开发服务。Pandoc 是可选组件，日常编辑不需要它；执行笔记本或使用外部渲染器时才需要相应运行环境。

Windows 桌面应用使用 `npm run desktop`；打包、原生目录选择和独立窗口行为见[桌面版指南](../features/DESKTOP-AND-IMPORT.md)。

## 选择知识库

每个知识库使用一个独立目录，内含 `pages/`、`assets/`、`metadata.json`、`.notdown/` 和 `.history/`。数据目录直接容纳各库，例如 `D:\ProgramData\Notdown\Default\` 和 `D:\ProgramData\Notdown\Work\`，无需额外的 `vaults/` 层级。桌面欢迎页可按名称在数据目录下创建或打开知识库，也支持继续选择其他位置的文件夹。

浏览器版无需重启服务即可通过侧栏顶部或设置的 **Manage knowledge bases** 新建、打开和切换库，操作见[知识库管理](../features/DESKTOP-AND-IMPORT.md#使用流程)。浏览器服务按 `/v/<目录身份>/` 分派至各库独立的 `createApp`，默认根地址仍绑定启动库；API 与附件均按 URL 路由，不通过全局“当前库”切换。

默认数据目录在 Windows 为 `%LOCALAPPDATA%\Notdown`，其他平台为 `$XDG_DATA_HOME/Notdown`（未设置时使用 `~/.local/share/Notdown`），默认库名为 `Default`。未配置新数据目录且仓库下已有旧 `vault/pages/` 时继续使用原库，不自动迁移。需要指定单个知识库时仍可设置 `VAULT_PATH`，例如 PowerShell：

```powershell
$env:VAULT_PATH = 'D:\Notes\Notdown'
npm run dev
```

也可以在仓库根目录的本机 `.env` 文件中保存路径，供 `npm run dev`、`npm start` 和 `start.cmd` 使用，无需每次设置环境变量：

```dotenv
NOTDOWN_DATA_PATH=D:\ProgramData\Notdown
NOTDOWN_VAULT_NAME=Default
```

终端已有的环境变量优先于 `.env`，`VAULT_PATH` 优先于数据目录和库名。源码桌面版也读取本机 `.env`；打包桌面版可通过环境变量指定数据目录，默认使用上述平台路径。隔离桌面测试使用独立临时数据目录。

该文件和仓库下的旧 `vault/` 均被 Git 忽略，用户内容不加入源码版本管理。迁移知识库前先停止写入该库的服务，备份整个目录（包括隐藏目录），再完整移动到目标位置、更新 `.env` 和桌面最近目录并启动。迁移后检查设置中显示的实际知识库路径。可选的本地 Git 历史单独存放在每库内部，配置、保留和恢复见[知识库元数据](../features/VAULT-METADATA.md#可选本地-git-历史)。

仅首次启动新建的默认知识库时创建示例笔记；已有知识库和显式指定的目录不自动填充。普通 Markdown 不需要应用专用 YAML；文件与属性读取规则见[知识库元数据](../features/VAULT-METADATA.md)。已有普通 Markdown 文件夹可通过 **Import Markdown folder** 复制导入。

同一知识库只运行一个本地服务进程。桌面窗口使用隔离服务与访问令牌，独立浏览器服务没有认证；两者均没有跨进程知识库锁。不要同时通过桌面版与另一个浏览器服务写入同一知识库，也不要把无认证的服务暴露给不受信任的网络。

## Windows 后台启动与重启

安装依赖后双击根目录的 [start.cmd](../../start.cmd)。它在后台启动服务，检查就绪后打开浏览器，日志写入 `.run/logs/`。

后台服务的后端代码或环境变量改变后，先保存编辑，再在仓库目录运行：

```powershell
.\start.cmd -Restart
```

脚本核对 4318 端口的进程，沿用其知识库路径重启后端并复用前端；当前终端没有 `MARKDOWN_PL_PATH` 时会读取用户级设置。非该脚本启动的进程不会被随意停止。如果通过 `npm run dev` 启动，应在原终端按 Ctrl+C 后重新运行。

HTML 上传返回 `.bin`、预览触发下载，或数据库入口提示后台过旧时，先检查运行中的后端是否已更新，再重试操作；不要通过强行保存旧草稿绕过版本冲突。

## 本地生产构建

```sh
npm run build
npm start
```

打开 [http://127.0.0.1:4318](http://127.0.0.1:4318)，该地址同时提供 `dist/` 中的应用与 API。构建本身不会创建 Windows 安装包；安装包使用 `npm run desktop:dist`，输出到 `.run/desktop-release/`。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`build` 已包含 TypeScript 检查；`typecheck` 可用于单独检查类型。功能修改运行单元/服务测试与构建，编辑交互修改还需浏览器测试。

- 单元与服务测试位于 `tests/unit/`，使用临时知识库。
- 浏览器测试位于 `tests/e2e/`，需要本机 Google Chrome；使用独立无头实例和临时知识库，不连接用户浏览器。
- `test:e2e` 先构建再执行 Playwright。报告、trace 和截图写入 `test-results/`，本地执行日志放 `.run/logs/`。
- 桌面测试使用 `npm run test:desktop`，其临时知识库与用户配置同样隔离。
- 云同步使用 `npm run test:sync`，构建独立桌面/移动前端并运行实际 PostgreSQL 迁移与跨端浏览器流程，详见[云同步](../features/CLOUD-SYNC.md)。

定向运行示例：

```sh
npx tsx --test tests/unit/markdown-engine.test.ts
npm run build
npx playwright test tests/e2e/markdown-lab.spec.ts
```

### 隔离浏览器测试

并行开发时不要覆盖他人正在使用的 `dist/` 或复用测试端口。PowerShell 示例（目录、端口和输出路径应为本次运行独占）：

```powershell
npm run build -- --outDir .run/e2e-dist
$env:NOTDOWN_E2E_PORT = '4330'
$env:NOTDOWN_E2E_FRONTEND_DIR = '.run/e2e-dist'
npx playwright test --output test-results/e2e-isolated --reporter=list
```

配置 `NOTDOWN_E2E_FRONTEND_DIR` 后，`npm run test:e2e` 的桌面构建也使用该独立目录；已构建时可按上例直接运行 Playwright。测试服务器拒绝复用已有服务；检查目标端口空闲后再启动。仓库的 `vault/` 是用户内容，不能用作测试或清理对象。

## Android 开发

Android 与桌面共用本仓库的依赖、文档模型、编辑器与知识库核心；手机入口在 `src/mobile/`，Capacitor 原生工程在 `android/`。能力和数据备份说明见 [Android 指南](../features/ANDROID.md)。

```sh
npm ci
npm run mobile:dev
```

浏览器预览地址为 [http://127.0.0.1:4337](http://127.0.0.1:4337)，使用独立 IndexedDB 数据；它不会打开桌面或 Android 私有知识库。正式 Android 环境仅使用原生文件存储。

构建需要 JDK 21、Android SDK 36 / Build Tools 36.0.0，并正确设置 `JAVA_HOME` 与 `ANDROID_HOME`（或在未入库的 `android/local.properties` 中配置 `sdk.dir`）。首次构建会下载 Gradle 和 Android 构建依赖。

```sh
npm run android:build
```

该命令构建手机前端、同步 Capacitor 资源、运行原生文件单元测试并生成 `.run/android-release/Notdown-Android-debug.apk`。最低系统版本为 Android 8.0 / API 26；这是调试签名安装包，不是商店发行包。不要将签名密钥、`local.properties` 或构建产物提交到仓库。

```sh
npm run android:open
npm run test:mobile
```

`android:open` 打开 Android Studio 工程；`test:mobile` 使用独立 Chrome 触屏实例验证离线编辑、恢复、附件和备份。手机前端构建输出为 `.run/android-frontend/`，测试端口默认 4347，可由 `NOTDOWN_MOBILE_E2E_PORT` 覆盖。浏览器测试不代表已完成真机输入法、WebView、系统文件选择器和进程回收验收。

## 工具与集成

| 工具 | 入口与用途 |
| --- | --- |
| Block Explorer | 侧栏入口或开发服务的 `/block-catalog.html`；查看内容对象、方言、语法示例和扩展来源。 |
| Markdown Lab | `/markdown-lab.html`；对照源码和不同渲染器的 HTML 输出，独立于知识库自动保存。外部依赖见 [Lab 指南](../features/MARKDOWN-LAB.md)。 |
| MCP | 先启动本地 API，再在仓库目录运行 `npm run mcp`。stdio 桥默认使用 `NOTE_API_URL=http://127.0.0.1:4318`；写入必须携带读取时的 revision，见 [API](../reference/API.md)。 |
| MyBase | 导出当前页面元数据，使用稳定 UUID 和真实数据类型；不自动写入主库，见[集成契约](../reference/MYBASE.md)。 |

可选 AI、转写和预览服务的配置保存在知识库 `.notdown/` 下，不写入页面 Markdown。调用生成或转写动作时，相应文字或音频会发送给配置的服务。

## 文档维护

根 README 只介绍产品和使用入口。功能操作写入 `docs/features/`，运行配置更新本页，格式和接口更新对应参考；新增专题登记到[文档导航](../README.md)。逐次验证结果写入带日期与范围的记录，避免累积到首页。具体规则见 [AGENTS.md](../../AGENTS.md#readme-维护规则)。
