# 多设备云同步验证（2026-10-23）

范围：桌面 Node 知识库、移动端共用知识库核心、Android 触屏界面、Supabase 同步 SQL 与传输协议。产品入口和部署步骤见[云同步说明](../features/CLOUD-SYNC.md)。本次按用户选择交付可部署代码和配置步骤，没有创建或连接真实 Supabase 项目。

## 已验证

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| `npm ci` | 完成 | `.run/logs/sync-install.log` |
| `npm test` | 966 项，961 通过、5 跳过、0 失败 | `.run/logs/sync-release-unit.log` |
| 同步专项单元/服务测试 | 21 项通过，已包含在全量结果内 | `.run/logs/sync-targeted-final.log` |
| `npm run test:sync` | 桌面和移动端隔离构建通过；跨端浏览器流程 1 项通过 | `.run/logs/sync-release-browser.log` |
| 桌面保存与冲突定向回归 | 33 项通过；使用 `npm run test:e2e -- ...` 和独立构建/端口 | `.run/logs/sync-desktop-regression.log` |
| 移动端已有功能回归 | 7 项通过 | `.run/logs/sync-mobile-regression.log` |
| `npm run android:build` | 构建成功；原生文件测试结果 5 项无失败（未变化任务由 Gradle 复用） | `.run/logs/sync-release-android.log` |
| 界面核查 | 查看了实际浏览器截图：桌面设置、手机冲突比较与设置；手机面板无横向溢出 | `test-results/sync/` |

跨端流程使用独立 Chrome 与 Pixel 7 触屏配置：桌面创建云知识库、手机登录同一账号并下载、手机断网编辑、桌面并发修改、手机恢复网络产生冲突、查看共同基线和红绿差异、合并后上传、桌面下载、手机重载保留内容。再次登录会保留原知识库关联。

专项测试覆盖原始 Markdown/BOM/CRLF、未知属性、数据库及视图身份、JSONB 键排序、联系人与二进制附件、不同页面并发修改、同页冲突复用、离线与丢失响应恢复、下载期间新输入、删除对编辑、路径穿越拦截、凭据排除备份、本地事务中断恢复、外部修改保护、旧冲突被新版本替代，以及紧凑资源历史和被替换附件的原字节保留。

云端 SQL 在 PostgreSQL/WASM 中实际执行；测试确认账号隔离、RPC 版本校验、幂等结果重放、禁止绕过 RPC 写表、附件 RLS、分块重用、刷新会话及迁移重复执行。测试中的 Auth 和附件 HTTP 服务为适配器，不等于验证托管 Supabase 的全部服务行为。

## 交付

- 云端迁移：[server/sync/supabase.sql](../../server/sync/supabase.sql)。
- 配置步骤：[docs/features/CLOUD-SYNC.md](../features/CLOUD-SYNC.md)。
- Android 调试 APK：`.run/android-release/Notdown-Android-sync-debug.apk`，由最终构建的标准调试 APK 复制，单独命名便于识别。
- 桌面通过正常 `npm run dev` 或 `npm run desktop` 启动，在 Workspace settings 中配置 Cloud sync；手机入口为 Notebook options → Cloud sync。

## 未覆盖与边界

未部署真实云项目，未验证真实 Android 设备/WebView、应用商店分发、设备后台联网或多账号协作。本次没有运行整个桌面浏览器套件；上述 41 项为同步流程与受影响功能的定向覆盖。当前只承诺实验性前台同步，没有 WorkManager 后台传输或端到端加密。

一次早期移动构建输出到了 `src/mobile/.run/sync-mobile-frontend/`；后续脚本已修正为仓库根下的 `.run/sync-mobile-frontend/`。删除早期临时目录被工具审批策略拦截，该忽略目录被保留，不参与最终构建、测试服务或源码提交。
