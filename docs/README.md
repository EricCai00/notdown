# 文档导航

先读项目 README（[English](../README.md) / [简体中文](../README.zh-CN.md)）、[正文格式契约](FORMAT.md) 与 [仓库组织约定](architecture/REPOSITORY.md)。格式规则以当前契约及明确标注的后续修订为准；历史审计和验收结果不代表当前全部实现状态。

## 架构与开发

- [仓库组织与开发入口](architecture/REPOSITORY.md)
- [原生 Markdown 编辑核心](architecture/MARKDOWN-ENGINE.md)
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
- [补充内容对象](reference/LOCAL-OBJECTS.md)、[产品语法](reference/PRODUCT-SYNTAX.md)
- [HTTP API](reference/API.md)、[MyBase 集成](reference/MYBASE.md)

## 功能说明

- [Markdown Lab](features/MARKDOWN-LAB.md)
- [链接预览](features/LINK-PREVIEWS.md)
- [联系人](features/PEOPLE.md)

## 审计与验证记录

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
