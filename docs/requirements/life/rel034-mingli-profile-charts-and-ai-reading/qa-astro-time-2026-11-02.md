# 占星时间基础 · 2026-11-02

## 本轮范围

用户同意第一批之后先补时区与历史夏令时，再推进行运。此次完成第二批的时间基础；不包括行运、更多星体、合盘、推运、回归盘。沿用已选深色星盘和原星历、宫头算法，新增时间转换层及命例表单字段。

- `shared/astro-time.ts`：固定版本 `@js-temporal/polyfill@0.5.1`，通过运行时 ICU/IANA 规则离线换算；不访问第三方排盘接口，不读电脑当前时区。
- `astroTimeZone` 缺省维持原固定 UTC+8，旧数据不迁移。新建表单默认 `Asia/Shanghai`，选择出生地不会隐式改时区。
- 地区规则已包含历史偏移和夏令时，不再次减一小时。`+08:00` 是明确的固定时差；`Asia/Shanghai` 是随日期变化的地区规则，两者在历史日期可能不同。
- 对同一当地时刻分别求 earlier/later，再回查当地时间。不存在的时刻拒绝；同一钟表时间的两次出现需主动选择，并存储 `earlier/later`。修改出生日期、时间或地区清除过期选择。
- 时间转换保留秒级历史偏移；原始钟表时间精度仍为分钟。星体、ASC/MC、宫头和 AI 上下文共用换算结果。八字/紫微保持原钟表时间计算口径。
- 写入时校验输入及合并后的旧字段；读入时不因未知时区丢失整个库。编辑失败保留草稿，成功后才关闭；无效时区只影响占星并提供修正入口。

规则依据：[Temporal 时区与不明确时间](https://tc39.es/proposal-temporal/docs/timezone.html)、[polyfill 官方实现](https://github.com/js-temporal/temporal-polyfill)、[IANA 亚洲规则](https://data.iana.org/time-zones/tzdb/asia)、[北美规则](https://data.iana.org/time-zones/tzdb/northamerica)、[澳洲和太平洋规则](https://data.iana.org/time-zones/tzdb/australasia)。没有复制参考项目代码或第三方命理解读文本。

## 验证

`node --import tsx --test tests/astro-time.test.ts tests/astro-calculation.test.ts tests/bazi-astro-house.test.ts tests/bazi-save-compat.test.ts tests/bazi.test.ts`：59 项通过。

`node --import tsx --test tests/ai-scope.test.ts`：8 项通过。

覆盖旧档 UTC+8 不变、1986–1991 中国历史夏令时、上海拨快/拨回边界、纽约重复时段、Lord Howe 半小时换时、Apia 整日跳过、加德满都 45 分钟偏移、1900 上海秒级偏移、悉尼南半球夏令时、跨日、非法日期/时间/时区、三种主机时区一致、同一瞬间不同当地表示的完整星盘一致。真实 Store 测试验证保存与重载、旧元数据与笔记保留、合并后拒绝非法时刻、无效地区读取保留。界面回归覆盖新旧默认值、改时区刷新、保存失败恢复、重复时段必选与日期变更清除、无效地区修正入口。AI 范围与时间依据回归通过。

`npm run verify`：字阶规范、前后端 TypeScript 与生产构建通过；滚动样式修正后再次运行 `npm run build` 通过。仍有既有大 chunk 提示。`git diff --check` 通过。未修改版本号、未打包安装器、未发布或推送。

原生检查使用独立 `WORKBENCH_TEST_DATA_DIR`、`WORKBENCH_ISOLATED=1`、APPDATA，在正式 Electron 构建内使用示例资料；不修改用户数据，也不发送模型请求。脚本与证据目录：

`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/astro-time-20261102/`

- `check.mjs` / `report.json`：最终 `passed: true`，无页面错误；前后端拒绝空档，地区与重复时间经真实 IPC 保存、重开仍一致。
- `regression.log` / `ai-scope.log`：67 项测试记录。
- `final.png` / `summer-mist.png` / `summer-cool.png` / `summer-warm.png`：实际偏移 +09:00、UTC 换算、三主题。
- `fold-required.png` / `fold-selected.png` / `gap.png`：必须选择重复时段、不存在时间拒绝。
- `zone-menu.png` / `narrow*.png` / `zoom-*.png`：下拉与触发器均为 386px（桌面），同左边界；1024×680、200% 缩放无横向溢出，正文滚动可达，Escape 只关闭菜单。

人工查看全窗截图发现窄窗滚动内容穿透共享透明标题，限定在 `bazi-profile-modal` 变体内修正为不滚动的标题和单独滚动的表单。重跑原生检查并查看窄窗/200% 截图确认消除重叠；不修改其他模块弹框。首次菜单尺寸检查在缩放动画中读取，测试改成动画结束后再测量，未为此改共享 Select。

尝试运行 skill 的 `py -3 .../audit_project.py <repo> --mode strict`，环境返回 `No installed Python found!`，静态 premium 审计未执行，不能当作通过。

## 边界

IANA 历史资料与运行时附带的时区数据库仍可能更新；地区时区不是按经纬度自动推断的法律时区。新疆地方时和北京时间是明确分开的选项。更早的地方历史记录需要使用者确认所选时区；本轮不实现真太阳时，也不改变八字/紫微排盘规则。
