# Android 初版

Notdown Android 与桌面版位于同一个仓库，使用同一份 npm 依赖、文档模型、ProseMirror / CodeMirror 编辑工作区、Markdown codec 和知识库核心。Android 原生工程由 Capacitor 管理；项目没有拆成 monorepo，也没有复制一套编辑器或保存规则。

## 当前能力

- 应用私有目录中的离线知识库；创建空白页面、编辑标题和正文、切换 Page / Source、按标题和内容搜索。
- 点击式格式工具栏、块类型选择和图片附件；图片预览使用临时显示地址，文件中仍保存相对附件路径。
- 在编辑过程中自动保存，并保留窗口独立的恢复草稿。版本不匹配时保留原文与提案，停止自动重试；界面可以将草稿另存为新页面。
- 导入 `.md`、`.markdown`、`.rmd`、`.qmd` 文件，保留完整源码。R / Quarto 的解释器执行需要桌面端。
- 导入和导出知识库 ZIP，包括 `pages/`、`metadata.json`、附件、历史与未知文件。恢复写入新知识库，原知识库继续保留，可在 Pages 抽屉中切换。
- Android 返回键先关闭面板或返回页面列表，退出到后台前收取待保存输入。
- Notebook options → Cloud sync 提供实验性多设备同步，复用桌面同步引擎及冲突处理；配置与范围见[云同步说明](CLOUD-SYNC.md)。

## 安装与使用

目标为 Android 8.0 / API 26 及以上。当前产物是开发调试 APK，使用本机调试签名；尚无正式发布签名、应用商店发行或自动更新。构建命令和输出位置见[开发指南](../architecture/DEVELOPMENT.md#android-开发)。

首次打开是空知识库。选择 **Create a page** 开始写作，或使用 **Import Markdown or vault ZIP**。顶部左侧打开页面列表；底部提供格式、图片、撤销和保存，**Insert block** 用于插入或转换基础块。源码模式显示完整文件。

通过右上角 **Notebook options → Export notebook ZIP** 备份整个知识库。Android 使用系统保存文件对话框选择 ZIP 位置；浏览器预览使用浏览器下载。ZIP 解压后可作为普通 Notdown 知识库在桌面打开。桌面已有知识库也可以压缩后导入；支持 ZIP 根层直接包含 `pages/` 和 `metadata.json`，或额外包一层目录。

应用私有文件会随卸载或清除应用数据删除，卸载前应导出备份。界面和原生工程均不申请访问整个共享存储的权限。单页上限 10 MB，单张图片上限 20 MB，ZIP 上限为解压后 128 MB、10,000 个文件。备份拒绝路径穿越、重复路径及文件与目录重叠，不覆盖已有知识库。

## 已知边界

- 云同步需配置 Supabase 或[WebDAV](WEBDAV-SYNC.md)，并在应用打开期间运行；WebDAV 在 Android 使用原生网络请求。尚无应用关闭后的后台同步、多人协作、直接编辑外部 SAF 文件夹或多文件夹同步。
- 手机界面仅提供主要笔记工作流，没有覆盖桌面的图谱、完整数据库管理、导入向导、系统回收站及全部块操作入口。
- 共用 codec 能保留的复杂内容仍可打开和通过源码编辑；依赖桌面服务的引文处理、外部转写、AI 设置及 Python / R / Pandoc 执行不提供移动端运行服务。远程附件或网页仍然需要网络。
- 浏览器预览使用独立 IndexedDB 文件存储，Android 使用原生私有文件。它们的数据不互通；原生插件失败时不会退回浏览器存储冒充保存成功。
- Chrome 触屏模拟和 JVM 文件测试不能代替 Android WebView、真实中文输入法、系统文件选择器、进程回收及低内存设备验收。

## 代码边界

| 位置 | 职责 |
| --- | --- |
| `src/vault/` | 共用 `createVault`、Markdown / metadata 保存、版本与冲突、数据库与联系人存储、恢复与备份 |
| `server/vault.ts`、`server/vault-platform.ts` | Node 入口装配、OS 路径、进程锁、原子文件替换和系统回收站 |
| `src/mobile/` | 手机界面、草稿会话、原生与浏览器存储适配、ZIP 交互 |
| `android/` | Android 构建、受限原生文件插件、系统文件导出与生命周期 |
| `src/shared/asset-display.ts` | 仅用于显示的附件地址解析，不改写 Markdown 或节点属性 |

正文真相仍是 `pages/*.md`；`metadata.json` 保留未知字段，文档 YAML / Pandoc title block 继续覆盖默认值。Node 和移动端使用相同的 SHA-256 revision 与 UUIDv5 身份规则。文件适配只提供路径、读写、锁和提交等系统能力；业务写入统一经过 `createVault`。

移动端通过原生文件锁协调写入，临时文件写完并同步后原子替换；Markdown 和 metadata 的中断恢复沿用同一个事务日志。浏览器预览使用 Web Locks 与 IndexedDB 事务。二者均保留 `baseRevision` 校验，不在冲突后自动刷新版本并强制重试。

本次构建、自动化及设备验证边界见 [2026-10-23 验证记录](../verification/ANDROID-2026-10-23.md)。
