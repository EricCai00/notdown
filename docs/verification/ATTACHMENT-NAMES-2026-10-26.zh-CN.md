# 附件原文件名与统一存储命名（2026-10-26）

[English](ATTACHMENT-NAMES-2026-10-26.md) · **简体中文**

## 范围

- File 卡片在没有显式名称时读取附件登记的原文件名，下载也使用原文件名；明确设置的卡片名称继续保留。
- HTML embed 在没有显式标题时读取原文件名，下载保留原名；仅更新显示，不修改正文或页面 revision。
- 上传、Markdown 文件夹导入和 Notion 下载共用 `assets/<SHA-256>.<扩展名>`。常见 MIME 与扩展名规范化，相同内容及规范扩展名复用同一文件。
- 复用附件时保留已有名称、登记时间及未知元数据；本次上传仍返回提交的名称用于插入。外部改动的目标不会被覆盖，待上传字节保存在 `.history/asset-conflicts/`。
- Notion 从 Block API 的文件名称补充附件元数据，Notion 签名 URL 的临时参数变化不阻断名称匹配。排除后代页面时仍可扫描本页块容器，不因此导入子页面。HTML 名称也可来自下载响应或 URL。
- 原有 UUID、批次编号、`notion-` 与嵌套附件路径继续读取，不批量重命名。旧附件已登记原名时重新打开即可显示；从未记录或记录不准确的名称不能凭哈希推断，需要重新导入获取。
- 本地附件下载不再进入编辑器的页面链接解析逻辑。新增单文件元数据读取接口，不扫描全库页面或下载附件正文。

## 验证

- `npm test`：1,054 通过、5 跳过、0 失败。包括跨入口路径一致、Office/HTML/JPEG/未知扩展名、去重、元数据保留、外部文件冲突及待上传内容恢复、旧路径与越界保护、Notion 嵌套块名称和签名 URL 匹配。
- `npm run build`：通过；有现有的大 bundle 提示。
- 最终运行 `npm run test:e2e -- tests/e2e/attachments.spec.ts tests/e2e/notion-v2-import.spec.ts tests/e2e/media.spec.ts`：13/13 通过。
- 在临时知识库和独立 Chrome 中检查两种方言的 File/HTML 名称、真实下载的建议文件名、保存和重载不改写正文，以及附件库、媒体插入和 Notion 模拟导入。截图已查看。
- 扩大到 66 项浏览器检查时：62 通过、4 失败。单独复查失败所在文件后：10 通过、3 失败；导入进度检查单独通过，组合运行的失败涉及重复批次后页面数量的断言。
- 仍失败的三项为 `internal-reference.spec.ts` 的新例子列表标签编号，以及 `notion-image-block.spec.ts` 的两种方言图片题注保存断言；后两项实际保存为 Markdown 图片，断言仍要求 `<image>` 标签。本次未修改这些编号或图片序列化实现。
- 曾启动全量 710 项浏览器检查，在定位首批失败时中断；不能据此宣称全量浏览器通过。

本地日志为 `.run/logs/asset-filenames-unit.log`、`asset-filenames-e2e-final.log`、`asset-filenames-e2e-regression.log` 与 `asset-filenames-e2e-followup.log`；效果截图为 `.run/logs/asset-filenames-preview.png`。

本次使用模拟 Notion API 和临时数据，没有使用真实 token、修改用户知识库、批量迁移已有附件或更新已安装应用。
