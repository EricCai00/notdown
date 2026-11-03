# Tests 子页面验收样本

[English](MANUAL-ACCEPTANCE-PAGES.md) · **简体中文**

生成器：[manual-test-pages.ts](../fixtures/manual-test-pages.ts)。它不读写知识库，生成 27 份正文：11 个方言默认配置页、14 个扩展测试页、1 个本地对象／服务页、1 个 Outside Markdown scope 参考页。整体覆盖 81 个内容对象和 103 个已注册扩展。

安装器另外创建 1 个导航索引和 1 个引用／Synced source 目标，所以一次完整安装为 **29 个直接子页面**。原有 Tests 正文和旧对照页不修改。页面标题编号用于索引识别，不强制更改用户侧栏的排序偏好。

每个方言明确设置 syntax.variant，extensions 为空，测试实际默认值；扩展页显式开启对应组的开关。换行规则、wiki 链接标题顺序、literate Haskell 和页首 Pandoc 元数据分别放置，避免互相遮蔽。每个用例提供真实输入、预期与操作、人工记录栏；扩展页另附受围栏保护的源码对照。

资源通过附件 API 上传：既有对照 PNG、合成 WAV、生成的无声 WebM、单页 PDF、引入文本及 BibTeX。全部为本地资源，不依赖外部图片或视频。模型调用、提醒和同步均不自动启动；合成音仅用于播放和协议测试，不用于判断语音转录精度。

## 检查

`node --import tsx --test tests/unit/manual-test-pages.test.ts` 检查方言、扩展、对象清单覆盖以及全部正文的 schema、未修改源码往返和每个用例的顶层标题。Unsupported 的未知指令样本不能使用会开启 Pandoc Div 的 `:::unknown` 加无效结束符 `:::endunknown`；用例间保留空行，以兼容要求标题前空行的方言。不会因原文仍能往返就把整页被吞入 Unsupported 判定为通过。

`npx playwright test tests/e2e/manual-test-pages.spec.ts` 在独立临时知识库和 Chrome 中安装整组样本，逐页打开、切换源码与页面视图、检查保存正文不变和浏览器异常。用户知识库不参与自动化测试。

这是样例覆盖和浏览器冒烟验证，不是所有上游规则的兼容认证。各页人工结果初始为 Not run；编辑、撤销、拖动、属性、复杂语法和服务行为按用例记录，不把“默认未启用”误报为“未实现”。

## 明确指定知识库后安装

用户明确要求将验收材料放入知识库时，使用运行中的应用 API，所有写入经过 createVault 队列。命令必须同时提供地址、父页面 ID 和预期知识库路径；安装器验证 /api/status，拒绝错误知识库和同组重复安装，不覆盖已填写的人工验收结果。

```powershell
node --import tsx docs/fixtures/install-manual-test-pages.ts http://127.0.0.1:4318 PARENT_PAGE_ID EXPECTED_VAULT_PATH
```

安装清单保存在 `test-results/manual-pages-installed.json`，包含新建页面 ID、资源路径、检查统计和索引 ID。没有直接写 pages 文件，也没有修改原父页面或现有测试页。
