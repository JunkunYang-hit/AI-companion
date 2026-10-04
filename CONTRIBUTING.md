# 贡献指南

在 Windows 使用固定依赖锁，修改后运行 typecheck、单元测试和与改动相关的桌面/集成测试。新增功能先对照README与 docs/decisions.md，不加入延期或禁止的能力。

复用代码或素材必须记录固定来源、许可证和修改范围；更新依赖后运行 `node scripts/licenses.mjs`。浏览器与角色内容是非可信数据，不增加通用执行入口或宽泛 IPC。所有源码、测试和日志只能使用占位凭据，提交前运行 `npm.cmd run check:secrets`。

真实模型测试必须获得使用该用户 Key 的授权；没有真实 Key 只能报告 fixture。对外发布和推送需用户明确授权。当前版本资产须通过 `npm.cmd run check:release` 白名单检查，打包后另运行 `node scripts/check-release.mjs release/win-unpacked/resources/app.asar`。不要提交未获分发许可的角色素材、专有运行时或用户数据。
