# 小天体离线星历

`small-bodies.json` 是 NASA/JPL Horizons 返回的数值星历采样，不包含第三方星历程序代码。应用直接加载该文件，在本机插值；不会向外部服务发送命例，也不要求用户安装另一个应用。

## 数据口径

- 来源：[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) 的观测者星历，地心 `500@399`，数量 `31`：日期黄道坐标系下的视黄经，单位度。
- 时间尺度 TT。应用沿用 Astronomy Engine 的 UTC→TT 换算，再查询采样表。
- 采样区间 1699-12-01 至 2201-02-01，每 4 天一项；每颗 45,763 项，为产品原有 1700–2200 年范围及边缘插值留出余量。
- 生成时间：2026-11-02。表文件 2,651,074 字节；SHA-256：`4e90e954b589e8d588b26d5228f1ce7f757bb174d54db273d80488464ddf3775`。
- 每颗星体同时保存 Horizons 请求 URL、轨道解编号和原始文本响应的 SHA-256。

| 名称 | Horizons 编号 | 本次轨道解 |
| --- | --- | --- |
| 凯龙星 | 2060 | JPL#171 |
| 谷神星 | 1 | JPL#48 |
| 智神星 | 2 | JPL#74 |
| 婚神星 | 3 | JPL#144 |
| 灶神星 | 4 | JPL#36 |

运行时使用八点拉格朗日插值，先展开跨 360° 的黄经；顺逆行使用前后各 0.01 天的位置判断。该表仅提供黄经，不用于高度、距离或日食等其他计算。

## 复现与验证

在仓库根目录执行 `node tooling/generate-astro-small-bodies.mjs <缓存目录>`。维护脚本按 [JPL API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) 要求串行请求，核验目标名称、采样间距、条目数量及参考时间。已有缓存保留同一批响应；需要更新轨道解时使用新的空缓存目录，并重新验收。

`tests/fixtures/astro-small-bodies.json` 保存另外请求的 98 个非网格参考时刻/星体，共 490 项，分布于支持区间并包含两端。`tests/astro-extended.test.ts` 将插值与这些直接查询值比较，要求误差小于 0.1 角秒。本次最大误差 0.0485 角秒；这是采样日期上的插值误差，不是整个轨道模型的绝对天文精度保证。

## 其他新增点位

交点及莉莉丝不在此表内：`astro.ts` 使用 Meeus《Astronomical Algorithms》第 47 章的平均月球轨道元素，以 TT 世纪数计算，加入日期章动。平均月球远地点按 5.1453964° 轨道倾角投影至黄道。北交/南交相差 180°；这里采用平均交点与平均莉莉丝，不是短周期摆动的真交点/振荡远地点，也不是编号 1181 的小行星 Lilith。

福点使用出生地太阳中心的几何高度区分昼夜，昼盘 `ASC + Moon − Sun`，夜盘 `ASC + Sun − Moon`；缺少有效上升点时不生成福点，不标顺逆行。

点位独立参考保存在 `tests/fixtures/astro-lunar-points.json`，来自 Swiss Ephemeris 2.10.03 命令行数值输出，仅作为验收基准；不捆绑其运行库或程序。参见 [Swiss 星历对交点与远地点的说明](https://www.astro.com/swisseph/swisseph.htm)。
