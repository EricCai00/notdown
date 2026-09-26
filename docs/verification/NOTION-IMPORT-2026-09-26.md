# Notion Enhanced Markdown 导入验证（2026-09-26）

## 后续：真实 PM 节点类型

撤掉按 parent 改图标/菜单的显示覆盖。归档 Block API 证据配合本地 parent，通过 DocumentSession 投影构建 `block.child_page`；普通入口保持 `block.link_to_page`。显示直接读取真实节点类型，不写官方 Markdown 私有属性。

- 单元测试：790 项，785 通过、5 跳过；新增真实节点类型、官方源码保留、重解析/撤销/重做、歧义及代码边界检查。
- 构建通过。Chrome 导入与节点专项 4 项通过，检查真实节点类型、菜单、模式切换、刷新、点击目标。首次组合运行发现测试共享导入快照的污染，恢复测试自身本地编辑后复跑通过。
- 对用户当前 CS 页做了只读验证：运行中的旧服务未返回证据字段；使用新代码读取既有归档得到 26 个 child_page 证据，投影结果为 26 个 `block.child_page`、0 个 `block.link_to_page`。未写用户知识库，未调用 Notion，未重启用户服务。重启后端后刷新页面即可加载新投影。
- 日志：`.run/logs/notion-pm-identity-unit.log`、`notion-pm-identity-browser.log`、`notion-pm-identity-browser-recheck.log`。

验证只使用临时知识库、模拟 Notion API 和独立 Chrome。没有真实 token，没有读取/写入用户 Notion 或用户 vault。官方接口文档已在线核对：`GET /v1/pages/{page_id}/markdown`，版本 `2026-03-11`。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 787 项，782 通过、5 跳过、0 失败 |
| 最终导入单元/服务专项 | `notion-import.test.ts` + `markdown-import.test.ts`，13 项通过 |
| `npm run build` | 通过；Vite 仍提示部分 chunk 大于 500 kB |
| 最终独立构建 | `npm run build -- --outDir .run/notion-verification-dist` 通过 |
| 最终 Chrome 导入专项 | 3 项通过：原文与层级/重复导入；预览失效；保存失败阻止提交 |
| 预览截图 | 已目视检查；API 正文可滚动，底部操作栏固定在可见位置 |
| `npm run test:e2e` 全量 | 未通过且未完成。计划 543 项，记录到第 192 项后主动中止；不宣称全量通过 |

全量运行出现块间距、callout、方言插件开关、列表交互、插入菜单、扩展来源等断言/超时失败，未在本次修复或证明其根因。一项 block-source 失败为 trace 产物 ENOENT：首次专项错误地共享全量 outputDir，可能干扰了该产物；之后专项均使用独立 outputDir，block-source 六项单独复跑全部通过。全量结果因此也不能作为干净的基线对照。

日志在 `.run/logs/notion-import-unit.log`、`notion-import-focused-unit.log`、`notion-import-final-build.log`、`notion-import-browser-final.log` 和 `notion-import-e2e.log`。截图为 `test-results/notion-import-preview.png`。全量进程已停止，未留下测试服务运行。

当前工作区原有 `src/app/main.ts` 的块插入修改已保留，未归入本次导入改动。

真实 Notion 在线兼容性仍需使用用户共享给 integration 的页面验证；当前测试证明的是按官方协议构造的读取、保存及界面流程。
