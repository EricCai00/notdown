# Windows 0.1.4 发布验证（2026-10-27）

## 范围

汇总此前未提交的 Notion v2 导入兼容、文字／背景双颜色、可验证的桌面缓存日期补充、外部引用库、行内对象菜单及附件命名／清理改动。新增的代码语言恢复只对语言注册表无法识别的非空标签触发 Block API 核对，保留唯一完整代码匹配、原始归档和歧义保护；已知语言、别名、空标签和 Mermaid 不增加语言核对请求。

版本从 0.1.3 升至 0.1.4；程序仍为 Windows x64 Electron + NSIS 安装包。产物、日志、用户数据和安装备份不进入 Git。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 1,118 通过、5 跳过、0 失败 |
| `npm run test:e2e -- tests/e2e/notion-v2-import.spec.ts tests/e2e/code-languages.spec.ts` | 构建通过，13 项浏览器测试通过 |
| 附件、日期、外部引用、行内菜单、会议日期、联系人与选区菜单的扩展浏览器回归 | 46 通过、1 失败，非全绿 |
| `npm run desktop:dist` | 生成 `Notdown-Setup-0.1.4-x64.exe` |
| `NOTDOWN_PACKAGED_EXE` 指向 `win-unpacked/Notdown.exe` 的桌面测试 | 首轮 8 通过、1 失败；失败的单实例恢复用例单独复跑通过 |
| 本机安装 | NSIS 正常结束，退出码 0，安装后产品版本为 `0.1.4.0` |
| 安装文件校验 | `Notdown.exe` 和 `resources/app.asar` 的 SHA-256 与测试过的打包产物一致；知识库选择设置保持不变 |

浏览器和桌面测试均使用独立临时知识库；桌面测试也使用独立用户配置。安装前备份旧程序，安装未替换知识库目录。

## 未通过项与边界

- 联系人测试 `people.spec.ts` 的 `slash Mention person opens a real chooser and preserves pending text` 等待 People 对话框中的搜索框超时。联系人 CRUD、`@` 补全、冲突与外部用户测试通过；本记录不把该斜杠菜单路径写为已通过。
- 桌面单实例恢复首轮在第二次唤起后检测到额外窗口；单独复跑通过，保留首轮失败记录，不宣称多轮稳定性已经完成验证。
- 扩展浏览器回归在全部 47 项结果输出后停留于测试服务器退出阶段；停止已确认身份的临时测试服务器后生成最终报告。未终止用户程序或操作用户知识库。
- 本次未重跑全部浏览器、Android、真实云同步或真实 Notion token 的端到端验收，不扩大既有能力保证。安装包仍未签名。

本机详细记录在 `.run/logs/release-0.1.4-*`；代码语言专项结果另见 `.run/logs/code-language-unknown-only-*`。这些路径是开发环境记录，不作为发布所需文件。
