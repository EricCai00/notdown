# Android 页面切换优化（2026-10-25）

[English](ANDROID-NAVIGATION-2026-10-25.md) · **简体中文**

## 范围

优化手机私有知识库的页面读取、普通笔记保存、附件显示与页面列表刷新。没有迁移用户文件、改变 Markdown 方言或放宽版本校验。桌面知识库仍使用完整扫描读取；共享扫描器只将逐文件重复检索 metadata 的过程改为一次建立查找表，保留原有排序、重命名识别和重复身份检查。

- 手机按当前 `metadata.json` 的文件映射读取目标 Markdown，每次重新生成 revision，不缓存正文作为存储真相。缺少索引、旧身份、重命名或文件映射不明确时回退完整扫描。
- 普通页面的标题、正文与方言保存读取当前页及父链。层级、回收站、数据库、涉及层级的 YAML 和其他更新保留完整验证路径。保存前的输入收取、`baseRevision`、历史快照、提交前复查、原字节 CAS 和冲突副本不变。
- 本地媒体在正文显示后加载，重复路径合并请求，最多四个附件读取同时进行。附件显示读取不占用手机导航与保存队列；清除缓存或切换知识库后，旧请求不能发布旧结果。显示地址只更新非编辑媒体视图，正文内链接及 Markdown 保留原路径。
- 页面列表未变化时复用行与图标，保存状态变化不重建整个列表。选择已打开的页面仅保存当前输入并关闭列表。
- 首次同步后先完成本地页面装配，再移除同步面板。

## 性能对照

使用 Windows Node 文件适配、临时知识库中的 200 页、共 425,890 字节正文。每条路径测量七次，以下为中位数及单次文件调用数量。完整扫描路径也包含本次查找表优化，因此不是旧 APK 与新 APK 的整机对照。测试期间存在其他构建负载，耗时只作本机参考，读取数量更适合说明优化范围。

| 操作 | 完整扫描路径 | 手机私有副本路径 |
| --- | ---: | ---: |
| 读取目标页正文 | 200 次 | 1 次 |
| 读取目标页耗时中位数 | 225.25 ms | 12.06 ms |
| 保存普通根页面时的正文读取 | 403 次 | 5 次 |
| 保存耗时中位数 | 644.78 ms | 130.84 ms |

上述耗时不包含编辑器 DOM 装配、触屏响应和真实手机存储开销。父页较深时会增加父链读取；数据库和层级修改仍需要完整扫描。

脚本与本地结果：`.run/mobile-navigation-benchmark.ts`、`.run/logs/mobile-navigation-benchmark.json`。脚本仅使用临时目录，并在完成后清理。

## 验证内容

单元验证覆盖目标页读取数量、外部正文和属性变化、旧 revision 冲突、父页回收站保护、移除层级 YAML 后恢复默认父页、保存中被外部修改、中断事务恢复、未知字段保留、附件并发去重、旧知识库请求隔离及缺失附件重试。

手机浏览器验证覆盖未变化列表复用、切页前未完成的源码输入、重新打开与重载、两个窗口冲突，以及主动暂停附件读取时继续编辑和切页。附件恢复后正常显示，源码仍含相对路径而不含 `blob:` 地址。

桌面定向回归运行页面导航、页面树、完整源码文件、共享工作区、vault metadata 和冲突比较；26 项通过。Android 前端构建、Capacitor 同步、Gradle `assembleDebug` 与 `testDebugUnitTest` 成功。

手机完整套件 27 项通过，见 `.run/logs/mobile-navigation-mobile-verified.log`。列表缓存对源码层级修改的刷新另有专项用例，结果见 `.run/logs/mobile-navigation-hierarchy.log`。专项存储保护 8 项通过，见 `.run/logs/mobile-navigation-safety.log`；新增用例连同 `sync.test.ts` 复跑共 25 项通过，见 `.run/logs/mobile-navigation-unit-focused.log`。桌面定向结果见 `.run/logs/mobile-navigation-desktop-targeted.log`，最终 APK 构建结果见 `.run/logs/mobile-navigation-android-final.log`。

全量 `npm test` 的最后一轮为 1,014 项通过、5 项跳过、1 项失败；失败的同步用例在 Node 文件读取时报告 `UNKNOWN: unknown error, read`，随后上面的同步与新增存储测试文件复跑全部通过。不将该全量执行记作全绿。更早一轮的 Pandoc 子进程退出异常也已单独复跑通过，见 `.run/logs/mobile-navigation-pandoc-recheck.log`。

未将桌面全部 682 项测试宣称为通过：一次全套尝试在附件/目录用例出现失败后中止，随后完成上述定向回归。手机在本轮真机计时前已断开 USB，因此没有真实 Android 切页耗时对照，也没有安装本次 APK。产物为开发调试包 `.run/android-release/Notdown-Android-navigation-2026-10-25.apk`。
