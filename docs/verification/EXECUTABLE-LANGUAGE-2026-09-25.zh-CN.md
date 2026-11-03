# 2026-09-25 可执行块与 inline 语言选择

[English](EXECUTABLE-LANGUAGE-2026-09-25.md) · **简体中文**

R、Python、Julia、Observable JS 共用 `block.executable_chunk` 与 `inline.executable_expression` 两种对象。插入菜单只有 Executable Chunk 和 Executable Expression，选语言后在原选区插入；现有对象点击语言名称可切换。R Markdown 方言提供 R，Quarto/Notdown 提供四种语言。普通代码围栏保持展示用途。

旧 R Markdown 原文、未知 knitr 头部选项、inline 空白和标记均保留。显式切换语言不翻译或执行代码，只有开头的 Quarto 选项注释前缀随语言变化；无法转换的 R 头部保留为普通注释。切换可撤销，结果仍不写入正文。

验证范围：

- `npm test`：741 项，739 通过、2 跳过、0 失败；跳过为 Windows 符号链接能力和未启用的 Julia 运行测试。日志 `.run/logs/unified-unit-all-runtimes.log`。
- 设置 `NOTDOWN_TEST_JULIA=1` 后补验语言模型及真实运行：13 项全部通过，包括 Julia、Python 和混合 R/Python 会话。日志 `.run/logs/unified-language-runtimes.log`。
- `npm run test:e2e -- tests/e2e/executable-language.spec.ts tests/e2e/quarto.spec.ts tests/e2e/rmarkdown.spec.ts tests/e2e/block-catalog.spec.ts`：构建成功，28 项独立 Chrome 测试全部通过。覆盖插入选区、语言切换、撤销重做、保存重载、旧 R 头部、方言限制、真实 R/Python/OJS 执行与目录合并。日志 `.run/logs/unified-browser-verified.log`。此处为相关浏览器回归，未宣称全仓浏览器套件通过。
- 检查插入语言选择器和 inline 浮层截图：`.run/logs/unified-insertion.png`、`.run/logs/unified-inline.png`。

浏览器与服务测试使用临时知识库，未写入用户 vault。解释器配置仍为后端环境变量，尚无应用内设置页，详见 [语言与运行环境](../features/QUARTO.zh-CN.md#语言与运行环境)。
