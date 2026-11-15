import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { CheckinError, CheckinProviders, QD, TRAE_CLIENT_ID, TRAE_VERSION, assertResponse, obj, str, type CheckinCredential } from './checkin-providers';

function parseParam(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return obj(JSON.parse(raw)); } catch { try { return obj(JSON.parse(decodeURIComponent(raw))); } catch { return {}; } }
}
/** TRAE requires /authorize; the callback trace and PKCE bind this authorization attempt. */
export async function traeCallback(signal: AbortSignal): Promise<{ url: string; loginTraceId: string; result: Promise<URLSearchParams>; close(): void }> {
  const path = '/authorize', loginTraceId = randomBytes(16).toString('hex');
  let resolve!: (value: URLSearchParams) => void, reject!: (error: Error) => void, consumed = false;
  const result = new Promise<URLSearchParams>((yes, no) => { resolve = yes; reject = no; });
  // Cancellation may happen while the browser is still opening.
  void result.catch(() => {});
  const server = createServer({ maxHeaderSize: 65536 }, (req, res) => {
    const address = server.address();
    const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    let url: URL;
    try { url = new URL(req.url || '/', `http://${host}`); }
    catch { res.writeHead(400).end(); return; }
    if (!['GET', 'OPTIONS'].includes(req.method || '') || req.headers.host !== host || url.pathname !== path || consumed || signal.aborted || (req.url?.length || 0) > 60000) { res.writeHead(404).end(); return; }
    if (req.headers.origin && req.headers.origin !== 'https://www.trae.cn') { res.writeHead(403).end(); return; }
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', 'https://www.trae.cn');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'x-jwt-token');
      if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (url.searchParams.get('loginTraceID') !== loginTraceId || !str(parseParam(url.searchParams.get('authCodeInfo')).AuthCode)) { res.writeHead(400).end('Invalid authorization result'); return; }
    consumed = true;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    res.end('<!doctype html><meta charset="utf-8"><title>连接 Workbench</title><style>body{font:16px system-ui;margin:60px;color:#25272b}p{color:#626770}</style><h1>正在检查连接</h1><p>请返回 Workbench 查看连接结果。你可以关闭此页面。</p><script>history.replaceState(null,"",location.pathname)</script>');
    resolve(url.searchParams);
  });
  server.requestTimeout = 10000;
  const abort = (): void => { reject(new CheckinError('授权已取消或超时，请重新连接。')); server.close(); server.closeAllConnections(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    await new Promise<void>((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === 'string') throw new CheckinError('无法启动本机授权回调。');
    return { url: `http://127.0.0.1:${address.port}${path}`, loginTraceId, result, close() { signal.removeEventListener('abort', abort); server.close(); server.closeAllConnections(); } };
  } catch { signal.removeEventListener('abort', abort); server.close(); throw new CheckinError('无法接收官方授权，请稍后重试。'); }
}

export async function authorizeCheckin(provider: 'qoder' | 'trae', deviceId: string, providers: CheckinProviders, signal: AbortSignal, open: (url: string) => Promise<void>, verifying: () => void): Promise<CheckinCredential> {
  if (provider === 'qoder') {
    const verifier = randomBytes(32).toString('base64url'), nonce = randomUUID();
    const query = new URLSearchParams({ challenge: createHash('sha256').update(verifier).digest('base64url'), challenge_method: 'S256', nonce, redirect_uri: 'qoder-work-cn://', client_id: '1c5e33e1-364d-4ce6-b02c-acaa81274a5c', machine_id: deviceId });
    await open(`https://qoder.com.cn/device/selectAccounts?${query}`);
    const poll = new URLSearchParams({ nonce, verifier, challenge_method: 'S256' });
    while (!signal.aborted) {
      const response = await providers.request(`${QD}/api/v1/deviceToken/poll?${poll}`, { signal });
      if (![202, 404].includes(response.status)) {
        const d = assertResponse(response), token = str(d.token, d.device_token);
        if (token) {
          verifying();
          return providers.qoderUser({ userId: str(d.user_id) || 'pending', name: '', accessToken: token, refreshToken: str(d.refresh_token), expiresAt: typeof d.expires_in === 'number' ? Date.now() + d.expires_in : 0, deviceId }, signal);
        }
      }
      await delay(2500, undefined, { signal });
    }
    throw new CheckinError('授权已取消或超时，请重新连接。');
  }
  const callback = await traeCallback(signal);
  try {
    const verifier = randomBytes(48).toString('base64url');
    const query = new URLSearchParams({ login_version: '1', auth_from: 'trae', login_channel: 'native_ide', plugin_version: '2.3.102035', auth_type: 'local', client_id: TRAE_CLIENT_ID, redirect: '0', login_trace_id: callback.loginTraceId, auth_callback_url: callback.url, machine_id: deviceId, device_id: deviceId, x_device_id: deviceId, x_machine_id: deviceId, x_device_brand: 'PC', x_device_type: process.platform === 'win32' ? 'PC' : process.platform, x_os_version: process.platform === 'win32' ? 'Windows' : process.platform, x_app_version: TRAE_VERSION, x_app_type: 'stable', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    await open(`https://www.trae.cn/authorization?${query}`);
    const params = await callback.result;
    verifying();
    return await providers.traeLogin(str(parseParam(params.get('authCodeInfo')).AuthCode), verifier, deviceId, signal);
  } finally { callback.close(); }
}
