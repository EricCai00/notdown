# 手机同步进度与重复扫描优化验证（2026-10-24）

## 范围

Cloud sync 显示准备、读取云端记录、逐项下载写入、本地扫描、上传及完成阶段；提供当前批次／资源、阶段进度条、附件分块大小、累计上传／下载／冲突数和耗时。总量未知时使用活动条，超过 15 秒没有进度更新时提示等待。失败保留进度并刷新连接状态以提供重试按钮。

进度轮询读取进程内快照，不扫描知识库或增加云端请求，不替代持久同步游标。普通页面写入事务从四次全库扫描缩减为一次；扫描只在同一次串行写入锁内复用，不跨资源缓存。

## 验证

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| `npm test` | 1000 项：995 通过、5 跳过；覆盖逐项进度、失败重试、无文件读取的进度接口、单次扫描及外部编辑拒绝 | `.run/logs/sync-progress-unit-final.log` |
| Supabase 分块进度专项 | 7 项通过，含上传和下载各分块大小 | `.run/logs/sync-progress-cloud-final.log` |
| `npm run test:mobile` | 11 项通过；包含延迟附件、49% 进度、等待提示、失败重试及重新打开面板 | `.run/logs/sync-progress-mobile-final.log` |
| `npm run test:sync` | Supabase／WebDAV 两项跨端同步、离线编辑和冲突回传通过 | `.run/logs/sync-progress-sync.log` |
| `npm run test:e2e -- tests/e2e/conflict-diff.spec.ts` | 最终桌面 TypeScript／Vite 构建及差异合并检查通过；未运行桌面全套浏览器测试 | `.run/logs/sync-progress-desktop.log` |
| Android 构建 | 最终移动构建后执行 `cap sync android` 与 Gradle 构建成功；8 项原生检查为 UP-TO-DATE，已有结果无失败 | `.run/logs/sync-progress-android-final.log` |
| 手机覆盖安装 | `adb install -r` 成功，已安装 APK 哈希与产物一致；应用启动成功 | `.run/logs/sync-progress-install.log` |

浏览器截图 `test-results/mobile/mobile-first-sync-shows-li-b0a5f-retains-failure-and-retries/mobile-first-sync-progress.png` 已检查，进度和长资源名称在窄屏内可读。

## 真机观察与交付边界

检查时手机已有 150 页，游标为 100，已持久保存 100 条基线，首次同步尚未完成；WebDAV 记录 25 次请求，没有冷却记录。代码中逐页反复扫描全库会增加原生文件桥接开销；未进行真机前后耗时对照，不报告具体提速倍数，也不据此排除其他网络或设备原因。

覆盖更新后再次确认：150 页、100 条基线、游标 100 和已有启用连接均保留。没有清除应用数据。尚未验证更新后真实云端整库同步完成；打开 Cloud sync 后可使用 **Sync now** 继续。

- 安装包：`.run/android-release/Notdown-Android-sync-progress-2026-10-24.apk`。
- SHA-256：`04610C25CF036538637A6F76D6313E3FFE846F959C8D947272258C94B2210F41`。
