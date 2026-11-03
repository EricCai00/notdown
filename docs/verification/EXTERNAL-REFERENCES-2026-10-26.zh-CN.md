# 外部参考 — 2026-10-26

[English](EXTERNAL-REFERENCES-2026-10-26.md) · **简体中文**

## 适用范围

- 在 `metadata.json.externalEntities` 中添加了保管库拥有的外部实体注册表，概念身份分为页面、用户、数据库、数据源和块位置。
- 导入保留来源信息和批次 ID。当前的 Markdown/属性、页面来源和联系人提供实时参考和可用的本地候选人。
- 稍后导入和具有匹配源 ID 的联系人可以解析现有引用，而无需更改注释字节或页面修订。重复的副本需要明确的选择。回收站、已删除的联系人和不可用的明确目标仍未得到解决。
- 命名完整的API用户对象可以创建一次本地联系人。部分用户仍然未知，导入永远不会替换或恢复现有联系人。
- **导入 → 外部参考** 支持搜索和明确的页面/联系人/数据库绑定. 保存使用库修改,字节级的元数据CAS和保存的冲突建议.
- 编辑器引用和关系/人员字段显示不可点击的英文未知标签。源 URL 和保存的标签在 Markdown 中仍然可恢复。移动设备初始化相同的注册表并在同步后刷新它。
- 注册表记录使用现有的资源同步协议。未映射的概念块锚点仍然不可用；没有发明块身份或用户配置文件。

## 验证

所有测试都使用临时保管库、模拟 Notion API 和独立的 Chrome 配置文件。

- `npm test`： 1,069 通过，5 跳过，0 失败（总共 1,074）。
- 目标实体/导入/同步单元运行：31 通过。最终的特定于实体的运行通过了所有 8 情况，涵盖晚期目标、重复副本、显式绑定稳定性、冲突、联系人保留、代码/未知容器边界、未知元数据、HTTP/离线路由和资源同步。
- 桌面生产构建和移动生产构建通过 TypeScript 和 Vite。 Vite 报告了其现有的大块警告。
- 44 现有桌面回归案例跨导入、v2 恢复、内联/完整数据库、联系人、内部引用、节点标识和内联上下文菜单传递。
- 最终的 6 案例桌面运行通过了所有 4 新功能案例和内联数据库回归：惰性未知标签和延迟导航；手动关联未更改的源；实时关系/人员更新，而另一个表格单元格保留待处理的输入；目标删除后数据库重新绑定并禁用导航。
- `npm run test:mobile`：所有 37 现有案例均已通过。最终的范围运行通过了额外的移动参考案例和内联/同步数据库案例，检查英文标签、重新加载、禁用导航、保留源 URL 和共享数据库视图。
- 检查了桌面/移动屏幕截图。未知页面/用户/数据库标签保持可见、灰色且不可点击；源标签和 URL 被保留。新的功能模块和测试不包含硬编码的中文文本。
- `git diff --check`通过了。

完整的桌面套件并未声称通过。更广泛的选定运行报告了现有斜杠菜单路径中的两个失败： `inserting new examples twice assigns unused labels and consecutive new numbers` 和 `slash Mention person opens a real chooser and preserves pending text` 。这些路径被排除在最终范围回归之外；此更改不会修复它们。

没有执行真正的 Notion 令牌、云服务或 Android 设备接受。前台同步保留 [ 云同步 ](../features/CLOUD-SYNC.zh-CN.md) 中记录的限制。

本地执行日志和截图位于 `.run/logs/external-entities-*` 和 `test-results/` 下；它们不是源文件或用户保管库内容。

## 文档

- [概念导入和外部引用](../features/NOTION-IMPORT.zh-CN.md#external-references-and-users)
- [人](../features/PEOPLE.zh-CN.md)
- [保管库元数据](../features/VAULT-METADATA.zh-CN.md)
- [外部实体API](../reference/API.zh-CN.md#外部实体库)

## 桌面安装

更新的 Windows x64 应用程序是在 2026-10-26 上构建并安装的。 Notdown 在安装前已通过其正常应用程序菜单退出。最终 NSIS 运行返回 0 ；安装的 `app.asar` SHA-256 与打包的版本匹配，并且保存的保管库选择设置在安装后未更改。安装的应用程序启动，打开现有的默认库并公开 **Import → 外部引用** 。

第一次更新尝试暴露旧的打包 Capacitor Android 构建文件，其路径最多为 312 字符。旧的更新程序无法重命名该依赖关系树。桌面版包装现在不包括 `node_modules/@capacitor/**` ；最终存档包含零个 Capacitor 条目，并且没有解压的本机依赖关系树。旧的 Android 依赖项目录已移至本地临时恢复文件夹，而不是被删除。此恢复没有针对任何用户保管库目录。

安装程序输出是 `.run/desktop-release/Notdown-Setup-0.1.3-x64.exe` 。安装和恢复收据为 `.run/logs/external-entities-desktop-install.json` 和 `.run/logs/notdown-installer-recovery.json` 。
