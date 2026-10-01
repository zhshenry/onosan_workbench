# Changelog

本项目按 Keep a Changelog 格式记录版本变更。正式 Release 使用对应版本条目生成发布说明。

## [Unreleased]

## [0.1.0] - 2026-10-01

### Added

- 首个 Ono Workbench 版本：工作台外壳、待办与日程、博客编辑、素材浏览、命理工具及工作台 AI 助手。
- Windows x64 安装包与完整便携 ZIP；安装版支持 GitHub Releases 自动更新，以及设置页手动检查、下载进度和重启安装。
- 与 To-Do-List 一致的发布流程：版本与变更记录同步、构建五项发布资产、使用 `gh release` 发布并核验更新元数据。

### Changed

- 安装包仅保留运行代码与必要资源，排除开发依赖、设计截图、测试和个人数据；精简主进程代码及未使用的原生 Canvas 依赖。

### Notes

- 便携版手动下载完整 ZIP 替换；两种发行形式均保留应用数据及共享待办数据。
- 当前安装器未配置代码签名，使用默认 Electron 图标。
