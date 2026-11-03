# Android full-page / inline 数据库验证（2026-10-25）

[English](ANDROID-DATABASES-2026-10-25.md) · **简体中文**

## 本次范围

- 手机 Pages 和 Notebook 菜单增加 Databases / New database；页面树复用数据库宿主和记录归属投影，兼容没有宿主页的旧资源。
- 普通页 Insert block 可创建 Full page / Inline 数据库；inline 继续遵循当前方言的 `notion_databases` 能力边界，保存已有官方引用语法。
- 共用数据库工作区支持标题、图标、表格属性、记录、新建字段与视图、搜索、筛选和排序。宽表格独立横向滚动；手机 OPEN 进入完整记录页，属性和正文共用一份页面草稿，用 Back to database 返回。
- 补齐移动端本地 status、数据库创建、字段定义更新及视图创建接口，写入仍通过 `createVault`；页面和字段原版本一同进入记录恢复草稿。
- 数据库、inline 输入及记录页在导航、视图切换、同步或备份前保存。冲突阻止离开并保留草稿；云同步完成后仅在没有待处理输入时刷新当前数据库及其资源。

使用入口和边界见[数据库指南](../features/DATABASES.zh-CN.md#手机使用)及[Android 指南](../features/ANDROID.zh-CN.md)。

## 自动化结果

| 验证 | 结果 | 本地日志 |
| --- | --- | --- |
| `npm test` | 1022 通过，5 跳过，0 失败 | `.run/logs/mobile-databases-all-unit.log` |
| `npm run build -- --outDir .run/mobile-databases-desktop-frontend` | TypeScript 与桌面构建通过 | `.run/logs/mobile-databases-desktop-build.log` |
| `npm run mobile:build -- --outDir ../../.run/mobile-databases-frontend` | TypeScript 与手机构建通过 | `.run/logs/mobile-databases-build.log` |
| `npm run test:e2e -- tests/e2e/database-inline.spec.ts tests/e2e/database-hierarchy.spec.ts tests/e2e/databases.spec.ts` | 15 通过，使用隔离桌面前端、端口 4359 和临时知识库 | `.run/logs/mobile-databases-desktop-e2e.log` |
| `npx playwright test -c tests/e2e/mobile.config.ts` | 全部 35 通过，使用隔离手机前端和端口 4357 | `.run/logs/mobile-databases-all-mobile-e2e.log` |
| `npm run android:build` | APK 及 Gradle JVM 测试通过 | `.run/logs/mobile-databases-android-build.log` |

手机浏览器测试新增四项：full-page 创建、字段/选项/记录页编辑和保存视图；inline 编辑、源码切换、重载及完整表格导航；两个窗口的旧版本冲突与恢复；WebDAV 测试服务下从电脑资源下载的 full-page / inline 数据库。最后一项比较导出的宿主 Markdown 字节，并检查未知页面和数据库字段仍保留。新建资源与原 schema 的恢复冲突另有 `tests/unit/mobile-databases.test.ts` 覆盖。

初轮新增浏览器测试的字段类型定位器以及 CodeMirror 隐藏视图读取断言已修正，最终全量手机运行上述 35 项均通过。桌面范围为三个数据库测试文件，不代表整个桌面浏览器套件通过。

## 产物与视觉检查

- APK：`.run/android-release/Notdown-Android-debug.apk`；另留本次快照 `Notdown-Android-databases-2026-10-25.apk`。
- 已查看截图：`test-results/mobile/mobile-mobile-full-page-da-c7e17-views-and-edit-record-pages/mobile-full-database.png` 和 `test-results/mobile/mobile-mobile-inline-datab-8809f--open-full-pages-and-reload/mobile-inline-database.png`。完整数据库返回按钮与标题分开排列；工具栏和表格没有撑宽手机页面。

## 验证边界

本次没有连接的 ADB 设备，未安装到手机，未进行真实 Android WebView、软键盘或触摸横向滚动验收。Chrome Pixel 7 模拟、隔离 WebDAV 服务与 JVM 测试不能代替真机或真实云服务验收；不扩大生产同步或后台同步保证。
