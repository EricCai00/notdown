# 设置界面与桌面 0.1.3 验证（2026-10-26）

[English](SETTINGS-0.1.3-2026-10-26.md) · **简体中文**

## 范围

- 设置按 Workspace、Appearance、Editing、Sync & history、Connections、Advanced 分组，导航定位后聚焦分组标题；全部表单保持挂载，未提交输入在分组跳转间保留。
- 统一卡片、标签、输入框、下拉框、开关、按钮和状态提示；固定标题与底部 Done，内容独立滚动；窄窗口使用横向分类导航。
- Markdown 控件的视图切换、方言选择与扩展三个显示开关默认开启。全部隐藏时收起整行，菜单与快捷键仍可切换视图。
- 重建页面菜单后统一刷新图标，覆盖工具栏、菜单、快捷键及标签恢复的视图切换入口。
- 桌面版本升至 0.1.3。安装包与本地产物不进入 Git。

## 自动与视觉验证

| 验证 | 结果 |
| --- | --- |
| `npm test` | 1051 通过、5 跳过、0 失败 |
| `npm run build` | TypeScript 与 Vite 通过 |
| 指定范围 `npm run test:e2e -- …` | 24 通过、0 失败 |
| `npm run desktop:dist` | 生成 Windows x64 NSIS 安装包，产品版本 0.1.3.0 |
| `NOTDOWN_PACKAGED_EXE` 指向解包程序的桌面测试 | 9 通过、0 失败 |
| 1440px 与 390px 截图检查 | 分类标题、表单、开关及固定操作栏无重叠，窄屏表单无横向溢出 |
| `git diff --check` | 通过 |

浏览器验证范围：`settings-layout`、`markdown-controls`、`vault-settings`、`code-input-mode`、`emoji-picker`、`runtime-settings`、`history`、`application-menu`。覆盖未提交表单保留、偏好持久化、WebDAV 字段切换、关闭方式、解释器与历史设置的保存及冲突分支。

桌面测试使用独立临时知识库与用户配置，覆盖设置窗口、标签、导入、多库隔离、关闭保存、托盘恢复、单实例、退出失败与冲突保护。未使用用户知识库作为测试数据。

本次没有重跑全部浏览器项目，以上结果不代表完整浏览器套件全绿，也不扩大云同步或真机验证范围。安装包仍未签名。日志和截图保存在本机 `.run/logs/settings-design-*`、`.run/logs/settings-*.png`，不进入 Git。
