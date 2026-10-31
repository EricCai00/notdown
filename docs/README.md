# 文档导航

先读项目 README（[English](../README.md) / [简体中文](../README.zh-CN.md)）、[正文格式契约](FORMAT.md) 与 [仓库组织约定](architecture/REPOSITORY.md)。格式规则以当前契约及明确标注的后续修订为准；历史审计和验收结果不代表当前全部实现状态。

## 使用入门

- [写作与导航](features/WRITING-AND-NAVIGATION.md)：编辑视图、常用操作、页面管理与关系图。
- [媒体与嵌入](features/MEDIA-AND-EMBEDS.md)：图片、音视频、PDF、HTML 附件与网页嵌入。
- [Android 初版](features/ANDROID.md)：离线笔记、图片、知识库 ZIP 备份与当前移动端边界。
- [多设备云同步](features/CLOUD-SYNC.md)：Supabase 配置、桌面与安卓同步、冲突处理及当前限制。
- [坚果云 WebDAV 同步](features/WEBDAV-SYNC.md)：应用密码、独立远端文件夹、请求限制与并发保护。
- [运行与开发指南](architecture/DEVELOPMENT.md)：知识库路径、启动与重启、构建、测试及开发工具。

## 架构与开发

- [仓库组织与开发入口](architecture/REPOSITORY.md)
- [原生 Markdown 编辑核心](architecture/MARKDOWN-ENGINE.md)
- [内容对象与节点身份](architecture/OBJECT-IDENTITY.md)
- [基础设计](architecture/FOUNDATION.md)
- [块模型评审](architecture/BLOCK-MODEL-REVIEW.md)
- [内容对象路线图](architecture/CONTENT-OBJECT-ROADMAP.md)
- [元数据与兼容边界](architecture/METADATA-AND-COMPATIBILITY.md)

## 格式和能力参考

- [格式契约](FORMAT.md)、[历史格式](reference/FORMAT-LEGACY.md)
- [块说明](reference/BLOCKS.md)、[内容能力](reference/CONTENT-CAPABILITIES.md)、[对象与扩展对应](reference/CATALOG-RELATIONS.md)
- [原生方言](reference/NATIVE-DIALECTS.md)、[方言符合性](reference/DIALECT-CONFORMANCE.md)、[Notdown 集合体边界](reference/NOTDOWN-SUPERSET.md)
- [Pandoc 扩展说明](reference/PANDOC-EXTENSIONS.md)、[开关矩阵](reference/PANDOC-EXTENSIONS-MATRIX.md)
- [扩展来源](reference/EXTENSION-PROVENANCE.md)、[Notion 参考](reference/NOTION-REFERENCE.md)
- [Notion MCP 规范语法与实现边界](reference/NOTION-MCP-SYNTAX.md)
- [补充内容对象](reference/LOCAL-OBJECTS.md)、[产品语法](reference/PRODUCT-SYNTAX.md)
- [保留的 Notdown 自定义语法及官方替代](reference/NOTDOWN-EXTENSIONS.md)
- [HTTP API](reference/API.md)、[MyBase 集成](reference/MYBASE.md)

## 功能说明

- [本地数据库、表格视图与 Notion 数据库导入](features/DATABASES.md)

- [会议笔记卡片、配置与上传转写](features/MEETING-NOTES.md)

- [本地同步块的复制、联动与取消同步](features/SYNCED-BLOCKS.md)

- [AI block 配置、上下文与生成](features/AI-BLOCKS.md)

- [Quarto 方言、多语言 Notebook 与解释器设置](features/QUARTO.md)、[2026-09-25 验证记录](verification/QUARTO-2026-09-25.md)
- [可执行块与 inline 统一语言选择验证](verification/EXECUTABLE-LANGUAGE-2026-09-25.md)

- [R Markdown 方言与本机 R 执行](features/R-MARKDOWN.md)

- [Vault 级 JSON metadata 与文档覆盖](features/VAULT-METADATA.md)

- [页面与位置链接（统一引用模型）](features/INTERNAL-REFERENCES.md)

- [Windows 桌面版与 Markdown 文件夹导入](features/DESKTOP-AND-IMPORT.md)
- [Notion API Markdown v2 单向导入](features/NOTION-IMPORT.md)
- [代码语言、Custom 分组与高亮来源](features/CODE-LANGUAGES.md)
- [脚注交互与正文块类型](features/FOOTNOTES.md)
- [引文、缩写、术语、修订、图片工具栏与表格编辑](features/INLINE-OBJECTS.md)

- [符号自动替换](features/SYMBOL-REPLACEMENTS.md)

- [Markdown Lab](features/MARKDOWN-LAB.md)
- [Pandoc 引文测试文档](fixtures/pandoc-citations.md)
- [链接预览](features/LINK-PREVIEWS.md)
- [联系人](features/PEOPLE.md)

## 审计与验证记录

- [Windows 0.1.11：统一数据库入口与双向转换（2026-10-31）](verification/RELEASE-0.1.11-2026-10-31.md)

- [Windows 0.1.10 发布验证（2026-10-31）](verification/RELEASE-0.1.10-2026-10-31.md)

- [独立数据库 JSON、迁移与恢复（2026-10-31）](verification/DATABASE-FILES-2026-10-31.md)

- [Windows 0.1.9 发布验证（2026-10-28）](verification/RELEASE-0.1.9-2026-10-28.md)

- [Wiki 创建、转换与 Undo（2026-10-28）](verification/WIKI-2026-10-28.md)

- [Windows 0.1.6 发布验证（2026-10-28）](verification/RELEASE-0.1.6-2026-10-28.md)

- [Notion AI block 缓存恢复与 Button 调查（2026-10-28）](verification/NOTION-AI-BLOCK-RECOVERY-2026-10-28.md)

- [Windows 0.1.4 与 0.1.5 补丁验证（2026-10-27）](verification/RELEASE-0.1.4-2026-10-27.md)

- [当前自定义正文写法与背景色迁移（2026-10-27）](audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.md)

- [Notion 导入双颜色补全（2026-10-27）](verification/NOTION-COLOR-RECOVERY-IMPORT-2026-10-27.md)

- [Notion v2 行内文字色与背景色（2026-10-27）](verification/NOTION-DUAL-COLORS-2026-10-27.md)

- [Notion v2 行内代码兼容读取（2026-10-27）](verification/NOTION-CODE-TAGS-2026-10-27.md)

- [Notion v2 多行子页面与引用块（2026-10-26）](verification/NOTION-MULTILINE-BLOCKS-2026-10-26.md)

- [Notion SQLite 字段、缓存更新与导入可行性（2026-10-26）](audits/NOTION-SQLITE-2026-10-26.md)

- [附件 UUID、页面删除清理与提醒导入核查（2026-10-26）](verification/ATTACHMENT-UUID-CLEANUP-2026-10-26.md)

- [日期与提醒显示修正（2026-10-26）](verification/DATE-PRESENTATION-2026-10-26.md)

- [External references and deferred resolution (2026-10-26)](verification/EXTERNAL-REFERENCES-2026-10-26.md)

- [行内对象右键菜单与分区源码（2026-10-26）](verification/INLINE-CONTEXT-MENU-2026-10-26.md)

- [附件原文件名与统一存储命名（2026-10-26）](verification/ATTACHMENT-NAMES-2026-10-26.md)

- [设置界面统一与桌面 0.1.3（2026-10-26）](verification/SETTINGS-0.1.3-2026-10-26.md)

- [Windows 托盘驻留、关闭保存与单实例（2026-10-26）](verification/TRAY-AND-SINGLE-INSTANCE-2026-10-26.md)

- [侧栏精简、整体滚动与安卓直接选择方言（2026-10-26）](verification/SIDEBAR-AND-MOBILE-DIALECT-2026-10-26.md)

- [标签页与集成标题栏（2026-10-26）](verification/WORKSPACE-TABS-2026-10-26.md)

- [手机方言与 0.1.1 构建（2026-10-26）](verification/MOBILE-DIALECT-AND-RELEASE-2026-10-26.md)

- [浏览器知识库管理、设置与侧栏（2026-10-25）](verification/BROWSER-VAULTS-AND-SETTINGS-2026-10-25.md)

- [本地历史、Git 检查点与多知识库（2026-10-25）](verification/LOCAL-HISTORY-AND-VAULTS-2026-10-25.md)

- [Android full-page 与 inline 数据库（2026-10-25）](verification/ANDROID-DATABASES-2026-10-25.md)

- [手机字体样式与 Notion v2 Markdown 保存（2026-10-25）](verification/MOBILE-FORMATTING-MARKDOWN-2026-10-25.md)

- [Android 页面切换与附件加载优化（2026-10-25）](verification/ANDROID-NAVIGATION-2026-10-25.md)

- [Android 触屏块操作与长按拖动（2026-10-25）](verification/ANDROID-TOUCH-2026-10-25.md)

- [Android 键盘收起与页面层级（2026-10-24）](verification/ANDROID-KEYBOARD-TREE-2026-10-24.md)

- [同步批量落盘优化与性能对照（2026-10-24）](verification/SYNC-BATCH-2026-10-24.md)

- [手机同步进度与重复扫描优化（2026-10-24）](verification/SYNC-PROGRESS-2026-10-24.md)

- [Notion 数据库列序与按钮对齐（2026-10-24）](verification/DATABASE-COLUMNS-2026-10-24.md)

- [Android 首次云同步配置、旧库清除与安装（2026-10-24）](verification/ANDROID-CLOUD-ONBOARDING-2026-10-24.md)

- [坚果云连接失败修复与真实服务验证（2026-10-24）](verification/WEBDAV-FIX-2026-10-24.md)

- [WebDAV 适配与本机验证（2026-10-23）](verification/WEBDAV-2026-10-23.md)

- [多设备云同步验证（2026-10-23）](verification/CLOUD-SYNC-2026-10-23.md)

- [附件库首版验证（2026-10-23）](verification/ATTACHMENTS-2026-10-23.md)

- [Android 离线初版验证（2026-10-23）](verification/ANDROID-2026-10-23.md)

- [数据库表格、选项与右侧记录面板验证（2026-09-28）](verification/DATABASES-DESIGN-QA-2026-09-28.md)

- [会议笔记卡片与菜单验证（2026-09-27）](verification/MEETING-NOTES-DESIGN-QA-2026-09-27.md)

- [HTML / Web embed 样式与交互验证（2026-09-27）](verification/EMBED-DESIGN-QA-2026-09-27.md)

- [AI block 样式与交互验证（2026-09-27）](verification/AI-BLOCK-DESIGN-QA-2026-09-27.md)

- [内容节点 object ID 统一验证（2026-09-24）](verification/OBJECT-IDENTITY-2026-09-24.md)

- [GFM 677 例规范核查与编辑回归（2026-09-24）](audits/GFM-CONFORMANCE-2026-09-24.md)

- [GitHub-style Alert 样式与插入验证（2026-09-24）](verification/GITHUB-ALERTS-2026-09-24.md)

- [Notion 官方语法边界核查（2026-09-24）](audits/NOTION-BOUNDARY-2026-09-24.md)

- [桌面版与 Markdown 导入验证（2026-09-23）](verification/DESKTOP-IMPORT-2026-09-23.md)
- [Notion API 导入验证（2026-09-26）](verification/NOTION-IMPORT-2026-09-26.md)
- [Markdown 测试文档入口与新旧样本区别](fixtures/README.md)、[11 份官方方言测试文档](fixtures/dialect-audit/README.md)
- [上游 Markdown 方言 HTML 对照（2026-09-23）](audits/DIALECT-HTML-AUDIT-2026-09-23.md)
- [仓库目录整理验证（2026-09-23）](verification/REPOSITORY-REORGANIZATION-2026-09-23.md)
- [自定义语法边界审计](audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md)
- [扩展分类审计](audits/EXTENSION-CLASSIFICATION-AUDIT-2026-09-22.md)
- [语法目录审计](audits/SYNTAX-CATALOG-AUDIT-2026-09-22.md)、[早期语法审计](audits/SYNTAX-AUDIT-2026-09-15.md)
- [验证记录](verification/VERIFICATION.md)、[手工验收页面](verification/MANUAL-ACCEPTANCE-PAGES.md)
- [块选择](verification/BLOCK-SELECTION-VERIFICATION.md)、[按钮](verification/BUTTON-VERIFICATION.md)、[日期](verification/DATE-VERIFICATION.md)、[链接预览](verification/LINK-PREVIEW-VERIFICATION.md)
- [设计验收记录](verification/design-qa.md)

## 历史存档

- [整理前的 README（2026-09-23）](archive/README-2026-09-23.zh-CN.md)：保留历次功能与交互记录，含已被后续修订覆盖的说明；当前概览以根目录的中英文 README 为准。

`data/` 保存语法来源快照和审计数据；`fixtures/` 保存测试语料及验收页面生成器；`archive/` 保存已被替代的文档快照。三者属于版本管理内容。执行日志、截图、临时构建放在仓库的 `.run/` 或 `test-results/`，不混入规范文档。
