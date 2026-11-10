import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CheckinProvider } from '../shared/checkin-contracts';

export const CheckinCredentialSchema = z.object({
  userId: z.string().min(1), name: z.string(), accessToken: z.string().min(1).max(32768),
  refreshToken: z.string().max(32768), expiresAt: z.number(), deviceId: z.string().min(1),
  native: z.object({ machineToken: z.string(), machineType: z.string(), machineCode: z.string(), version: z.string() }).optional(),
});
export type CheckinCredential = z.infer<typeof CheckinCredentialSchema>;
export type Json = Record<string, unknown>;
export interface JsonResponse { status: number; body: Json; }
export type CheckinRequest = (url: string, options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown; signal: AbortSignal }) => Promise<JsonResponse>;
export class CheckinError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'network' | 'blocked' | 'protocol' | 'storage' = 'protocol') { super(message); }
}
export function checkinError(error: unknown): string { return error instanceof CheckinError ? error.message : '操作未完成，请稍后重试。'; }
export const obj = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
export const str = (...values: unknown[]): string => { const value = values.find(v => typeof v === 'string' && v.length > 0); return typeof value === 'string' ? value : ''; };
const amount = (...values: unknown[]): number | null => { const value = values.find(v => typeof v === 'number' && Number.isFinite(v) && v >= 0); return typeof value === 'number' ? value : null; };
const yes = (v: unknown): boolean => v === true || v === 1;
const no = (v: unknown): boolean => v === false || v === 0;
export function jwtClaims(token: string): Json {
  try { return obj(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))); } catch { return {}; }
}
function expiry(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value < 1e12 ? value * 1000 : value : 0; }
export const WB = 'https://www.workbuddy.cn';
export const QD = 'https://openapi.qoder.com.cn';
export const TRAE = 'https://api.trae.cn';
export const TRAE_EXCHANGE = 'https://api.trae.com.cn';
export const TRAE_CLIENT_ID = 'en1oxy7wnw8j9n';
export const TRAE_VERSION = '0.1.43';
export const CHECKIN_HOSTS = new Set(['www.workbuddy.cn', 'copilot.tencent.com', 'openapi.qoder.com.cn', 'api.trae.cn', 'api.trae.com.cn']);

export function assertResponse(response: JsonResponse): Json {
  const { status, body } = response;
  const code = body.code ?? body.Code;
  if (status === 401 || [1001, '1001', 12153, '12153', 'TOKEN_EXPIRE'].includes(code as string | number)) throw new CheckinError('登录已失效，请重新连接账号。', 'auth');
  if ([9074, 9095, '9074', '9095', 11140, '11140'].includes(code as string | number)) throw new CheckinError('平台未通过账号或设备校验，请到官方应用处理。', 'blocked');
  if (status === 403) throw new CheckinError('平台拒绝访问，请在官方应用检查账号与领取资格。', 'blocked');
  if ([404, 405, 410].includes(status)) throw new CheckinError('平台入口暂不可用，请到官方应用查看当前活动。');
  if (status < 200 || status >= 300) throw new CheckinError(status >= 500 ? '平台暂时不可用，请稍后检查。' : '平台未接受请求，请到官方应用检查。', status >= 500 ? 'network' : 'protocol');
  if (code !== undefined && code !== 0 && code !== '0' && code !== 200 && code !== '200' || body.success === false || body.ResponseMetadata && obj(body.ResponseMetadata).Error) throw new CheckinError('平台未接受本次操作，请到官方应用确认。');
  return body;
}
function headers(provider: CheckinProvider, c: CheckinCredential): Record<string, string> {
  if (provider === 'workbuddy') return { Authorization: `Bearer ${c.accessToken}`, 'X-User-Id': c.userId, Origin: WB, Referer: `${WB}/profile/growth-center`, 'X-Request-ID': randomUUID() };
  if (provider === 'trae') return { Authorization: `Cloud-IDE-JWT ${c.accessToken}`, 'x-device-id': c.deviceId, 'X-User-Region': 'CN', 'x-device-brand': 'PC', 'x-device-type': process.platform === 'win32' ? 'PC' : process.platform, 'x-os-version': process.platform === 'win32' ? 'Windows' : process.platform, 'x-app-version': TRAE_VERSION };
  const h: Record<string, string> = { Authorization: `Bearer ${c.accessToken}`, 'User-Agent': 'Qoder', 'cosy-clienttype': '10', 'cosy-version': c.native?.version || '0.4.8' };
  if (c.native) Object.assign(h, { 'cosy-machineid': c.deviceId, 'cosy-machinetoken': c.native.machineToken, 'cosy-machinetype': c.native.machineType, 'cosy-machinecode': c.native.machineCode, 'cosy-machineos': process.platform === 'win32' ? 'windows' : process.platform });
  return h;
}
export interface ProviderStatus {
  status: 'ready' | 'claimed' | 'pending' | 'unavailable'; message: string; reward: number | null; campaignId?: string;
}
export function parseWorkbuddyStatus(body: Json): ProviderStatus {
  const d = obj(body.data);
  if (d.active === false) return { status: 'unavailable', message: '当前签到活动未开放', reward: null };
  if (yes(d.today_checked_in)) return { status: 'claimed', message: '平台已确认本轮签到', reward: null };
  if (d.active === true && no(d.today_checked_in)) return { status: 'ready', message: '当前活动可以签到', reward: amount(d.daily_credit, d.credit) };
  throw new CheckinError('平台未返回明确的签到状态，请到 WorkBuddy 查看。');
}
export function parseTraeStatus(body: Json): ProviderStatus {
  const d = Object.keys(obj(body.data)).length ? obj(body.data) : body;
  const flags = ['checked_in', 'did_checked_in', 'today_checked_in', 'is_checked_in'].map(k => d[k]);
  if (flags.some(yes)) return { status: 'claimed', message: '平台已确认本轮签到', reward: null };
  if (d.enable === false || d.eligible === false) return { status: 'unavailable', message: '当前账号暂无可领取的签到活动', reward: null };
  if (flags.some(no) && d.enable === true) return { status: 'ready', message: '当前账号可以签到', reward: amount(d.credits, d.credit) };
  throw new CheckinError('平台未返回明确的签到状态，请到 TRAE 查看。');
}
/** Only daily credit campaigns qualify. Never claim unrelated newcomer/referral benefits. */
export function parseQoderStatus(body: Json): ProviderStatus {
  const d = Object.keys(obj(body.data)).length ? obj(body.data) : body;
  const campaigns = Array.isArray(d.campaigns) ? d.campaigns.map(obj) : [];
  const daily = campaigns.filter(c => {
    const placements = Array.isArray(c.placements) ? c.placements.map(obj) : [];
    const titles = placements.map(p => str(obj(obj(p.content).zh).title, obj(obj(p.content).en).title)).join(' ');
    return /(?:daily|check.?in|每日|签到)/i.test(`${str(c.campaignKey, c.campaign_key)} ${titles}`) && str(obj(c.benefit).kind).toUpperCase() === 'CREDITS';
  });
  if (daily.length !== 1) return { status: 'unavailable', message: daily.length ? '平台活动规则已变化，请到 Qoder 确认' : '暂无每日积分活动，请到 Qoder CN 检查设备与资格', reward: null };
  const c = daily[0], id = str(c.campaignId, c.campaign_id), state = str(c.claimStatus, c.claim_status).toUpperCase();
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new CheckinError('平台活动标识无效，请到 Qoder 查看。');
  if (state === 'CLAIMED' || state === 'GRANTED') return { status: 'claimed', message: '平台已确认本轮签到', reward: null, campaignId: id };
  if (['PENDING', 'PROCESSING', 'CLAIMING'].includes(state)) return { status: 'pending', message: '平台正在确认领取，请稍后核对', reward: null, campaignId: id };
  if (state === 'CLAIMABLE' && ['CLAIM_BENEFIT', ''].includes(str(c.actionType, c.action_type))) return { status: 'ready', message: '本轮每日积分可以领取', reward: amount(obj(c.benefit).amount), campaignId: id };
  return { status: 'unavailable', message: '当前账号或设备不符合本轮领取条件，请到 Qoder 查看', reward: null, campaignId: id };
}

export class CheckinProviders {
  constructor(readonly request: CheckinRequest) {}
  async sms(phone: string, signal: AbortSignal): Promise<void> { assertResponse(await this.request(`${WB}/v2/plugin/login/send-sms`, { method: 'POST', body: { phone }, signal })); }
  async workbuddyLogin(phone: string, code: string, deviceId: string, signal: AbortSignal): Promise<CheckinCredential> {
    const d = obj(assertResponse(await this.request(`${WB}/v2/plugin/login/token`, { method: 'POST', body: { login_method: 'phone', phone, sms_code: code }, signal })).data);
    const token = str(d.accessToken, d.access_token), claims = jwtClaims(token), id = str(claims.sub);
    if (!token || !id) throw new CheckinError('登录结果不完整，请重新获取验证码。', 'auth');
    return { userId: id, name: `${phone.slice(0, 3)} **** ${phone.slice(-4)}`, accessToken: token, refreshToken: str(d.refreshToken, d.refresh_token), expiresAt: expiry(claims.exp), deviceId };
  }
  async qoderUser(c: CheckinCredential, signal: AbortSignal): Promise<CheckinCredential> {
    const d = assertResponse(await this.request(`${QD}/api/v1/userinfo`, { headers: { Authorization: `Bearer ${c.accessToken}` }, signal }));
    const u = Object.keys(obj(d.data)).length ? obj(d.data) : d;
    const id = str(u.id, u.user_id);
    if (!id) throw new CheckinError('Qoder 未确认账号身份，请重新授权。', 'auth');
    return { ...c, userId: id, name: str(u.name, u.email) || `Qoder · ${id.slice(-6)}` };
  }
  async traeUser(c: CheckinCredential, signal: AbortSignal): Promise<CheckinCredential> {
    const r = assertResponse(await this.request(`${TRAE_EXCHANGE}/cloudide/api/v3/trae/GetUserInfo`, { method: 'POST', headers: { 'x-cloudide-token': c.accessToken }, body: { ReqSource: 'IDE', IDEVersion: TRAE_VERSION }, signal }));
    const u = obj(r.Result ?? r.data ?? r);
    const id = str(u.UserID);
    if (!id) throw new CheckinError('TRAE 未确认账号身份，请重新授权。', 'auth');
    return { ...c, userId: id, name: str(u.ScreenName) || `TRAE · ${id.slice(-6)}` };
  }
  async refresh(provider: CheckinProvider, c: CheckinCredential, signal: AbortSignal): Promise<CheckinCredential> {
    if (!c.refreshToken) throw new CheckinError('登录已失效，请重新连接账号。', 'auth');
    let d: Json;
    if (provider === 'workbuddy') {
      d = obj(assertResponse(await this.request('https://copilot.tencent.com/v2/plugin/auth/token/refresh', { method: 'POST', headers: { ...headers(provider, c), 'X-Refresh-Token': c.refreshToken, 'X-Auth-Refresh-Source': 'plugin', 'X-Domain': 'www.workbuddy.cn' }, body: {}, signal })).data);
    } else if (provider === 'qoder') {
      d = assertResponse(await this.request(`${QD}/api/v1/deviceToken/refresh`, { method: 'POST', body: { refresh_token: c.refreshToken }, signal }));
    } else {
      const r = assertResponse(await this.request(`${TRAE_EXCHANGE}/cloudide/api/v3/trae/oauth/ExchangeToken`, { method: 'POST', body: { ClientID: TRAE_CLIENT_ID, RefreshToken: c.refreshToken, ClientSecret: '-', UserID: c.userId }, signal }));
      d = obj(r.Result ?? r.data ?? r);
    }
    const token = str(d.accessToken, d.access_token, d.token, d.device_token, d.Token, d.AccessToken);
    if (!token) throw new CheckinError('无法更新登录，请重新连接账号。', 'auth');
    return { ...c, accessToken: token, refreshToken: str(d.refreshToken, d.refresh_token, d.RefreshToken) || c.refreshToken, expiresAt: expiry(d.TokenExpireAt ?? jwtClaims(token).exp) || (typeof d.expires_in === 'number' ? Date.now() + d.expires_in : 0) };
  }
  async status(provider: CheckinProvider, c: CheckinCredential, signal: AbortSignal): Promise<ProviderStatus> {
    const url = provider === 'workbuddy' ? `${WB}/v2/billing/meter/checkin-activity-status` : provider === 'qoder' ? `${QD}/sash/api/v1/me/campaigns` : `${TRAE}/trae/api/v2/ug/checkin_credits/status`;
    const body = assertResponse(await this.request(url, { method: provider === 'qoder' ? 'GET' : 'POST', headers: headers(provider, c), ...(provider !== 'qoder' ? { body: {} } : {}), signal }));
    return provider === 'workbuddy' ? parseWorkbuddyStatus(body) : provider === 'qoder' ? parseQoderStatus(body) : parseTraeStatus(body);
  }
  async claim(provider: CheckinProvider, c: CheckinCredential, status: ProviderStatus, signal: AbortSignal): Promise<{ reward: number | null; delayed: boolean }> {
    const url = provider === 'workbuddy' ? `${WB}/v2/billing/meter/daily-checkin` : provider === 'qoder' ? `${QD}/sash/api/v1/me/campaigns/${encodeURIComponent(status.campaignId!)}/claim` : `${TRAE}/trae/api/v2/ug/checkin_credits/claim`;
    const r = await this.request(url, { method: 'POST', headers: headers(provider, c), body: {}, signal });
    // Even an already-claimed response must be checked through the status endpoint.
    if (r.status === 409 || r.body.code === 10001) return { reward: null, delayed: true };
    const b = assertResponse(r), d = obj(b.data ?? b);
    if (['BLOCKED', 'NOT_ELIGIBLE'].includes(str(d.status)) || str(d.failureCode)) throw new CheckinError('平台未通过领取资格检查，请到官方应用查看。', 'blocked');
    return { reward: amount(d.credit, d.credits, obj(d.benefit).amount, d.amount), delayed: d.credit_delayed === true || ['PENDING', 'PROCESSING'].includes(str(d.status)) };
  }
}
