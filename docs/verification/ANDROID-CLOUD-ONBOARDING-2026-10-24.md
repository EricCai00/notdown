# Android 首次云同步配置验证（2026-10-24）

## 范围

Android 作为电脑已有云端知识库的离线副本使用。首次打开必须配置同步并选择已有云端库，首次同步完整成功后进入编辑器；此后可离线编辑。未连接、首次同步未完成或断开连接时，设置页不能通过关闭、Escape 或 Android 返回键跳过。

手机移除独立建库、库切换及 ZIP 恢复建库入口，保留向已连接知识库导入 Markdown 和导出 ZIP 备份。移动端 API 拒绝不指定已有知识库 ID 的云端新建请求；桌面仍可创建云端库。升级不会自动删除其他用户的旧库。

## 验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 991 项：986 通过、5 跳过、0 失败 | `.run/logs/mobile-cloud-onboarding-unit.log` |
| 最终移动前端浏览器测试 | 10 项通过：强制配置、空远端目录拒绝、断开连接、中文编辑、源码切换、重载、Markdown 导入、附件、ZIP 建库拒绝、草稿冲突与窄屏离线编辑 | `.run/logs/mobile-cloud-onboarding-browser-delivery.log` |
| `npm run test:sync` | Supabase 与 WebDAV 两项桌面／手机跨端同步、离线编辑及冲突恢复通过，含独立桌面和移动构建 | `.run/logs/mobile-cloud-onboarding-sync.log` |
| `npm run android:build` | 最终前端 TypeScript 与 Vite 构建、Capacitor 复制、Gradle assembleDebug 成功；8 项原生单元检查为 UP-TO-DATE，已有结果无失败 | `.run/logs/mobile-cloud-onboarding-android-delivery.log` |
| 额外桌面编辑器与运行设置检查 | 33 项中 30 通过、3 失败；失败项单独复查仍失败 | `.run/logs/mobile-cloud-onboarding-desktop.log`、`.run/logs/mobile-cloud-onboarding-desktop-recheck.log` |
| 连接手机安装 | 覆盖安装成功，手机安装包 SHA-256 与最终 APK 一致；原生 WebView 已显示强制云同步设置页 | `.run/logs/mobile-cloud-onboarding-install.log` |

桌面失败项为 `editor.spec.ts` 的普通段落 Tab 嵌套、子页面节点显示、加号菜单中的 Paragraph 选项等待。它们未通过，不能声称桌面全套回归通过；本次没有修改相关编辑器实现。移动端流程与跨端同步专项均通过。

## 本机操作与交付

按用户明确要求，先停止手机应用，再仅对 `app.notdown.mobile` 执行 `pm clear`，清除旧手机库及连接配置；已确认原手机库目录消失。此操作没有通过同步引擎发送删除记录，电脑和云端库保留。

- 安装包：`.run/android-release/Notdown-Android-cloud-linked-2026-10-24.apk`。
- SHA-256：`95658AD5BC83D2F3CE9BE0435D08B6488830A84586744594253AC510302E639F`。
- 新版启动后，本地页面目录为空，尚无云连接；账号和应用密码留给用户在首次配置页填写。
- 默认 WebDAV 地址及目录与电脑一致：`https://dav.jianguoyun.com/dav/`、`Notdown/My-notebook`；登录后选择已有 `My notebook`。

设备验证覆盖安装、旧本地数据清除及原生配置页显示；本次没有在清除后的手机重新输入真实凭据并完成整库下载，因此不声称完成该新版真机的完整同步验收。
