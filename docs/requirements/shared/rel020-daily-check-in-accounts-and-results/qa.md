# 每日签到验收记录

## 代码与验证

- 契约：`shared/checkin-contracts.ts`。
- 主进程：`electron/checkin.ts`、`checkin-providers.ts`、`checkin-auth.ts`、`checkin-runtime.ts`、`checkin-ipc.ts`。
- 页面与首页卡片：`src/views/CheckinView.tsx`、`checkin.css`。
- 回归：`node --import tsx --test tests/checkin.test.ts tests/checkin-trae-auth.test.ts tests/checkin-trae-device.test.ts tests/checkin-ipc.test.ts tests/checkin-ui.test.ts`。
- 构建：`npm run verify`。
- 桌面验收：`qa-2026-11-10.md`；Qoder 真实状态识别复核见 [2026-11-11 修复验收](qa-qoder-2026-11-11.md)；TRAE CN 授权修正及真实登录边界见 [2026-11-15 授权复核](qa-trae-auth-2026-11-15.md)。
