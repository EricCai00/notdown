# 本地历史与多知识库验证（2026-10-25）

[English](LOCAL-HISTORY-AND-VAULTS-2026-10-25.md) · **简体中文**

范围：及时保存与历史采样分离、每库独立的可选 Git 历史、单页预览／恢复、命名知识库目录，以及本机已有数据迁移。使用方式见[知识库元数据](../features/VAULT-METADATA.zh-CN.md#自动历史与版本恢复)和[运行配置](../architecture/DEVELOPMENT.zh-CN.md#选择知识库)。

## 实现与边界

- 自动保存仍经过 `createVault` 和 `baseRevision` 校验。默认每页 5 分钟采样、停写 120 秒后补点；无实质变化的保存不更改 revision。重新打开后首次编辑前保留上一会话的版本。
- 自动快照默认保留 30 天、每页最多 100 个，只清理由新索引管理且字节仍匹配的自动版本；旧历史、未知文件、外部改动、冲突和保护版本不清理。
- 本地 Git 使用每库 `.notdown/git-history.git/`，记录正文、按页拆分的属性、其他顶层 metadata 和联系人文本；不提交附件字节、服务配置、同步凭据或旧历史。没有远端与自动上传。Git 长期版本不按自动快照的保留期删除。
- 页面菜单可查看本地快照和最近 100 条涉及该页的 Git 提交、预览源码／属性／正文差异，再恢复目标页。预览后发生外部修改时拒绝覆盖，并保留当前内容与恢复提议。恢复前保护当前版本，不回退其他页或整个 metadata。
- Git 缺失、受管理配置被修改或操作失败时保留已保存正文。Android 继续使用共用自动快照；没有加入 Android Git 运行时。
- 数据目录直接包含命名库，不增加 `vaults/` 层。欢迎页支持在数据目录创建和发现多个库，仍支持打开任意位置的现有库。旧仓库内知识库在未配置新路径时继续兼容读取，不自动迁移。

## 本机迁移结果

本机当前库为 `D:\ProgramData\Notdown\Default`；数据根目录还保留独立的 `backups/`。本机 `.env` 配置数据根目录与 `Default` 名称，桌面最近目录已同步更新。数据与 `.env` 均不受源码 Git 跟踪。

迁移前创建完整 ZIP，并逐条校验归档内容。迁移后以及最终服务重启后，原有 **7,289 个文件**的大小和 SHA-256 均匹配；**219 个页面**（含回收站）的 revision 未改变。旧历史文件未删除或批量转换。

备份位置：`D:\ProgramData\Notdown\backups\Default\before-local-git-20261025-101229.zip`。这是本机恢复副本，不是仓库中的测试夹具。

当前库已启用本地 Git。基线包含 219 份正文、219 份页面属性、1 份顶层 metadata 和 1 份联系人，共 **440 个文本文件**；确认没有远端，`git fsck --full` 通过。重启后的 4317／4318 服务均指向 `Default`，Git 状态正常。

本机证据保存在 `.run/logs/multivault-migration-2026-10-25.json`、`multivault-manifest-2026-10-25.json`、`multivault-pages-before-2026-10-25.json` 与 `git-history-live-verification-2026-10-25.json`；这些日志不进入源码版本管理。

## 自动验证

| 验证 | 结果 |
| --- | --- |
| `npm test` | 1,041 条：1,036 通过，5 跳过，0 失败／取消 |
| 最终历史与目录定向单元／服务测试 | 11 条通过；包括 Windows 保留 ID 不相互覆盖、配置故障恢复、CAS、未知字段、保留策略和 ZIP 排除临时 Git 锁 |
| `npm run build -- --outDir .run/history-final-frontend` | 通过，包含 TypeScript 检查；保留现有 bundle 体积提示 |
| 隔离 Chrome 历史浏览器测试 | 3 条通过：预览恢复、外部修改冲突、启用 Git 并命名检查点 |
| `npm run test:desktop` | 4 条通过：命名库隔离、双库草稿／导入、关闭前保存／重新打开、冲突阻止关闭 |

完整单元运行在当前机器上显式使用 `NOTDOWN_RSCRIPT=C:\Program Files\R\R-4.2.2\bin\x64\Rscript.exe`，绕过 Windows 外层 R 启动器对取消测试的干扰；没有改动 R 运行时代码或用户配置。

全量 `npm run test:e2e` 未通过：计划 685 条，运行至第 495 条结果后中止，已记录 437 通过、30 跳过、28 失败。其中本次新增的 Git 设置测试首次使用 7 秒断言，遇到全套共享临时库的初次基线扫描超时；已去掉重复初始化扫描并放宽该操作的等待时间，最终隔离重跑 3 条全部通过。其他失败涉及语法目录计数、扩展边界、编辑器插入／拖动、脚注、Notion 图片等；没有在本次修改前的工作区复现基线，不能认定全部由既有改动造成，也不宣称整套浏览器回归通过。日志为 `.run/logs/git-history-browser-full-2026-10-25.log`。

定向测试日志为 `.run/logs/git-history-targeted-final-2026-10-25.log`、`git-history-browser-final-2026-10-25.log`、`git-history-desktop-final-2026-10-25.log`。人工查看了历史预览、Git 设置与命名库欢迎页截图。没有重新发布安装包、安装 Android APK 或验证云端 Git 历史同步。
