# 浏览器知识库管理、设置与侧栏验证（2026-10-25）

范围：浏览器新建／打开／切换知识库、每标签页的知识库归属、设置窗口的滚动与关闭，以及侧栏入口显示偏好。操作见[知识库管理](../features/DESKTOP-AND-IMPORT.md#使用流程)和[写作与导航](../features/WRITING-AND-NAVIGATION.md#页面与链接)。

## 实现与边界

- 侧栏顶部显示当前库名称并打开管理窗口；设置内提供同一入口。可以在数据目录按名称新建，也可填写绝对路径新建或打开；浏览器没有系统目录选择器。
- 切换前保存页面与数据库输入；失败或冲突阻止切换。可选择当前标签页或新标签页，根地址的默认库不变。新库为空，不添加演示笔记。
- `/v/<目录身份>/` 绑定独立的 `createApp`，API、附件、源文件下载、预览和本地草稿保持知识库归属。已知目录记录可在重启后恢复；无效身份、失效目录及被替换的目录返回错误，不退回默认库、不自动重建旧目录。
- 设置和知识库管理窗口固定标题与关闭按钮，正文单独滚动；设置支持 Esc 和点击遮罩关闭。Sidebar 可逐项显示／隐藏七个主入口，并恢复全部，浏览器刷新后保留偏好。
- 桌面版继续使用原生欢迎窗口；Android 不暴露本地知识库管理接口。本次没有改变跨进程写入或云同步保证。

## 验证结果

- `npm test`：1043 项，1038 通过、5 跳过、0 失败。
- `npm run build`：通过，前端隔离构建在 `.run/browser-vault-frontend/`；仍有 bundle 大小提示。
- `tests/unit/browser-vaults.test.ts`：2 项通过，覆盖目录身份复用、跨库读写／附件隔离、旧 revision 冲突、Origin 限制、服务重启、未知／移动目录拒绝、非空目录及普通 Markdown 文件夹保护。启动配置测试也通过。
- 独立 Chrome 定向回归：`vault-settings.spec.ts`、`attachments.spec.ts`、`branding.spec.ts`、`history.spec.ts`、`sidebar-layout.spec.ts`、`source-file.spec.ts` 共 21 项通过。其中新增 5 项覆盖固定标题、三种退出设置方式、侧栏偏好、保存后新标签页建库、冲突阻止切换，以及通过设置在当前标签页打开已有库。
- 全量浏览器套件已尝试，发现 Block Explorer 条目数、Notion 图片编码和容器源码等断言失败；在完成本次相关定向回归后停止扩展运行，未宣称全套通过。这些其他功能的断言未在本次工作中修改。
- 本机后端沿用原有知识库路径重启；通过实际 Vite 地址确认管理能力、库专属 API 与前端页面可访问。该检查只读取现有库，没有向其中添加测试笔记或测试库。

本地日志位于 `.run/logs/browser-vault-*.log`；截图为 `settings-fixed-header.png`、`browser-vault-manager.png` 与 `browser-vault-isolation.png`。测试使用临时知识库与独立浏览器，不连接用户浏览器。
