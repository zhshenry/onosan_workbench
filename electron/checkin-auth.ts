import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { CheckinError, CheckinProviders, QD, TRAE_CLIENT_ID, TRAE_VERSION, assertResponse, jwtClaims, obj, str, type CheckinCredential } from './checkin-providers';

function parseParam(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return obj(JSON.parse(raw)); } catch { try { return obj(JSON.parse(decodeURIComponent(raw))); } catch { return {}; } }
}
/** A random callback path binds the loopback response to this authorization attempt. */
export async function traeCallback(signal: AbortSignal): Promise<{ url: string; result: Promise<URLSearchParams>; close(): void }> {
  const path = `/${randomBytes(32).toString('hex')}/authorize`;
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
    if (req.method !== 'GET' || req.headers.host !== host || url.pathname !== path || consumed || signal.aborted || (req.url?.length || 0) > 60000) { res.writeHead(404).end(); return; }
    if (!url.searchParams.has('refreshToken') && !url.searchParams.has('refresh_token') && !url.searchParams.has('userJwt')) { res.writeHead(400).end('Missing authorization result'); return; }
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
    return { url: `http://127.0.0.1:${address.port}${path}`, result, close() { signal.removeEventListener('abort', abort); server.close(); server.closeAllConnections(); } };
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
    const query = new URLSearchParams({ login_version: '1', auth_from: 'solo', login_channel: 'native_ide', plugin_version: '2.3.62834', auth_type: 'local', client_id: TRAE_CLIENT_ID, redirect: '0', login_trace_id: randomUUID().replaceAll('-', ''), auth_callback_url: callback.url, machine_id: deviceId, device_id: deviceId, x_device_id: deviceId, x_machine_id: deviceId, x_device_brand: 'PC', x_device_type: process.platform === 'win32' ? 'PC' : process.platform, x_os_version: process.platform === 'win32' ? 'Windows' : process.platform, x_app_version: TRAE_VERSION, x_app_type: 'stable' });
    await open(`https://www.trae.cn/authorization?${query}`);
    const params = await callback.result, user = parseParam(params.get('userInfo')), jwt = parseParam(params.get('userJwt'));
    verifying();
    const token = str(jwt.Token), refreshToken = str(params.get('refreshToken'), params.get('refresh_token'), jwt.RefreshToken);
    let credential: CheckinCredential = { userId: str(user.UserID, jwtClaims(token).sub) || 'pending', name: '', accessToken: token || 'pending', refreshToken, expiresAt: 0, deviceId };
    if (refreshToken) credential = await providers.refresh('trae', credential, signal);
    else if (!token) throw new CheckinError('官方授权结果不完整，请重新连接。', 'auth');
    return await providers.traeUser(credential, signal);
  } finally { callback.close(); }
}
