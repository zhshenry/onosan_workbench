# 旧截图工具归档

2026-10-17。三个脚本没有 package.json、测试、CI 或其他脚本调用；按用户批准的清理范围退出日常工具入口。原文件改名为 .mjs.txt，内容逐字保留，SHA256 与迁移前相同。

| 原位置 | 归档源码 |
|---|---|
| tooling/screenshot.mjs | [screenshot.mjs.txt](screenshot.mjs.txt) |
| tooling/screenshot-float.mjs | [screenshot-float.mjs.txt](screenshot-float.mjs.txt) |
| tooling/screenshot-browser.mjs | [screenshot-browser.mjs.txt](screenshot-browser.mjs.txt) |

这些文件仅用于追溯历史截图的采集方式，文件内的命令和选择器按原样保存，不是当前运行说明：

- 只设置 WORKBENCH_ISOLATED，隔离工作台 userData，默认仍共享 To-Do-List 的待办库。当前自动化如需运行，必须先设置独立 WORKBENCH_TEST_DATA_DIR，隔离整个 appData。
- 保留固定调试端口、旧页面选择器及当时的界面假设；主窗与浮窗仍等待旧 .todo-actions 选择器，不能据此证明当前页面已就绪。
- 本次只归档和静态语法检查，没有启动 Electron，没有访问真实待办库或重新采集截图。重新使用前应按当前页面和完整数据隔离要求重新设计验收。

现有验收入口见 [历史验收脚本说明](../../README.md)。本次去重、压缩与保留清单见 [后续清理记录](../../../../docs/archive/audits/followup-cleanup-2026-10-17.md)。
