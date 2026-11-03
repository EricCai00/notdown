# 独立数据库文件验证

[English](DATABASE-FILES-2026-10-31.md) · **简体中文**

日期：2026-10-31。本记录对应共用知识库核心与隔离浏览器阶段，没有迁移实际用户知识库。后续桌面打包、安装与验证见 [0.1.10 发布记录](RELEASE-0.1.10-2026-10-31.zh-CN.md)。

## 实现契约

- 新数据库逐个写入 `databases/<id>.json`，普通数据库不再生成空 Markdown。自有数据源包含字段和 `pageIds`；视图保存明确的数据库／来源引用，外部来源显示 Link。
- 页面正文仍在 `pages/*.md`，通用页面属性仍在 `metadata.json`；宿主及成员 API 字段为兼容投影。Wiki Home 保留真实 Markdown，容器与页面来源保持独立。
- 旧格式只读兼容及原有编辑继续有效；CLI／HTTP 迁移通过预览版本校验，归档完整前后文件。含正文、独立旧宿主身份或无法确定来源所有权的情况中止，不猜测映射。
- 数据库 JSON 纳入联合文件 CAS、批次恢复、回收站、ZIP 及 Git 检查点。同步按完整数据库文件处理结构冲突，记录正文仍独立同步。

## 自动验证

- `npm test`：1223 通过，5 跳过，无失败。日志 `.run/logs/database-files-unit-accepted.log`。
- 最后补充封面移除和不同宿主身份的迁移保护后，`tests/unit/database-files.test.ts` 的 18 项全部通过；日志 `.run/logs/database-files-final-regression.log`。覆盖文件布局、唯一成员关系、跨库引用、未知字段、外部编辑／文件新增竞争、中断恢复、冲突处理、回收与恢复、迁移、Notion 重试、备份和文件级同步冲突。
- `npm run test:e2e -- tests/e2e/database-icons.spec.ts tests/e2e/notion-wiki-import.spec.ts tests/e2e/database-recycle.spec.ts tests/e2e/database-sources.spec.ts tests/e2e/database-hierarchy.spec.ts tests/e2e/wiki-shell.spec.ts`：21 项全部通过，包含 `npm run build`。日志 `.run/logs/database-files-browser-accepted.log`。
- 最后一次 `npm run build` 通过；日志 `.run/logs/database-files-build-accepted.log`。原有较大 chunk 提示仍存在。
- 其他定向运行验证了数据库单元格、内嵌记录、五种布局及视图菜单。最初出现的断言差异涉及旧空宿主假设及侧栏悬停操作，修正后相关用例复测通过。

浏览器使用独立 Chrome 和临时知识库。Wiki Home／集合在 1920、1440 px 下比较封面、标题、图标和视图入口的位置；测试输出位于 `test-results/browser/`。

## 边界

实际用户库未批量改写，新建／新导入使用独立文件。迁移命令见[数据库文档](../features/DATABASES.zh-CN.md#独立数据库文件)。多端使用此格式需各端支持同一版本；没有验收真实云端、Android 真机或数据库历史回滚界面。

本地服务已通过仓库启动脚本启动，4317／4318 的状态均为 `ok`，新迁移预览接口返回版本 1。Default 库只读预览为 5 个旧数据库、0 个阻塞项；没有执行迁移。
