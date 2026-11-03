# Link Preview 验证（2026-09-22）

[English](LINK-PREVIEW-VERIFICATION.md) · **简体中文**

实现和使用边界见 [LINK-PREVIEWS.md](../features/LINK-PREVIEWS.zh-CN.md)。测试使用临时知识库和独立 Chrome，没有写入用户 `vault/` 或 MyBase 主库。

- `npm test`：389 项，388 通过，1 项因系统符号链接权限跳过，0 失败。
- TypeScript 检查和生产构建通过。为避免其他任务并发构建替换 `dist/`，浏览器回归使用独立构建目录 `test-results/link-preview-build`。
- Link Preview 浏览器用例 5 项通过：粘贴菜单、键盘、撤销重做、Markdown 保存重开、连接设置、OneDrive 查看器、失败回退、扩展开关、代码块、过期请求隔离、属性编辑、未知字段和窄屏。
- 完整浏览器回归 184 项：首次 182 通过、2 失败。侧栏拖拽冲突用例单独复跑通过；嵌套段落用例首次轮询读到了保存前没有 `syntax` 的页面，已让等待断言允许此初始状态，保留原有最终持久化及重载断言。两项最终一起复跑均通过，没有把该复跑描述为完整套件一次全绿。
- GitHub 公共仓库通过真实 API 冒烟检查；私有 GitHub 和 OneDrive 权限／组织策略尚未使用真实账户验证，自动测试模拟这些外部响应。

截图保存在 `test-results/link-preview-github.png`、`test-results/link-preview-onedrive.png`、`test-results/link-preview-narrow.png`。浏览器测试验证实时元信息不写入 Markdown、不改变正文 revision，URL 和手填后备内容继续通过原有 CAS 路径保存。

开发后端原进程尚未加载新接口。自动审批拒绝了重启操作（`blocked by policy`），需要重启现有开发服务后使用本功能。没有为此更改用户知识库内容。
