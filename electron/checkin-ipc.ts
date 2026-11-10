import { app, ipcMain, Notification, powerMonitor, safeStorage, session, shell, type WebContents } from 'electron';
import { z } from 'zod';
import { CheckinProviderSchema, CheckinSettingsSchema, WorkbuddyLoginSchema, WorkbuddyPhoneSchema } from '../shared/checkin-contracts';
import { speechAppUrl } from '../shared/speech-contracts';
import { CheckinService } from './checkin';
import { CHECKIN_HOSTS, CheckinError, CheckinProviders, checkinError, obj, type CheckinRequest } from './checkin-providers';
import { checkinDeviceId, qoderNativeIdentity } from './checkin-runtime';

export function trustedCheckinSender(sender: unknown, primary: unknown, mainFrame: boolean, url: string, appUrl: string): boolean {
  return !!sender && sender === primary && mainFrame && speechAppUrl(url, appUrl);
}
export function registerCheckinIpc(primary: () => WebContents | undefined, appUrl: string): CheckinService {
  const checkinSession = session.fromPartition('workbench-checkin');
  const request: CheckinRequest = async (value, options) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !CHECKIN_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw new CheckinError('签到请求地址无效。');
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(20000)]);
    try {
      const response = await checkinSession.fetch(url.href, { method: options.method || 'GET', headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal, redirect: 'error', credentials: 'omit' });
      const reader = response.body?.getReader();
      if (!reader) throw new CheckinError('平台未返回签到结果。');
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.byteLength;
          if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new CheckinError('平台响应过大，已停止本次操作。'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      let body = {};
      try { body = obj(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { if (response.ok && response.status !== 202) throw new CheckinError('无法识别平台返回结果，请到官方应用确认。'); }
      return { status: response.status, body };
    } catch (error) {
      if (error instanceof CheckinError) throw error;
      throw new CheckinError(options.signal.aborted ? '操作已取消或超时。' : '网络暂时不可用，请检查连接后重试。', 'network');
    }
  };
  const requireEncryption = (): void => {
    if (!safeStorage.isEncryptionAvailable() || process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') throw new CheckinError('系统加密服务不可用，暂时不能保存登录凭据。', 'storage');
  };
  const service = new CheckinService({
    directory: app.getPath('userData'), providers: new CheckinProviders(request),
    protect(value) { requireEncryption(); return safeStorage.encryptString(value).toString('base64'); },
    unprotect(value) { requireEncryption(); return safeStorage.decryptString(Buffer.from(value, 'base64')); },
    async open(value) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['qoder.com.cn', 'www.trae.cn'].includes(url.hostname)) throw new CheckinError('授权页面无效，请重新连接。');
      try { await shell.openExternal(url.href); } catch { throw new CheckinError('无法打开系统浏览器，请检查默认浏览器设置。'); }
    },
    changed(state) { const target = primary(); if (target && !target.isDestroyed()) target.send('checkin:changed', state); },
    notify(body) { if (Notification.isSupported()) new Notification({ title: '每日签到需要处理', body }).show(); },
    deviceId: checkinDeviceId, native: qoderNativeIdentity,
  });
  const handle = (name: string, action: (input: unknown) => unknown): void => {
    ipcMain.handle(`checkin:${name}`, async (event, input: unknown) => {
      if (!trustedCheckinSender(event.sender, primary(), event.senderFrame === event.sender.mainFrame, event.senderFrame?.url || '', appUrl)) throw new Error('仅工作台主窗口可管理签到账号。');
      try { return await action(input); }
      catch (error) { throw new Error(error instanceof z.ZodError ? '输入格式不正确，请检查后重试。' : checkinError(error)); }
    });
  };
  handle('state', () => service.state());
  handle('run', input => service.run(z.array(CheckinProviderSchema).min(1).max(3).parse(input)));
  handle('refresh', input => service.refresh(CheckinProviderSchema.parse(input)));
  handle('sms', input => service.sendSms(WorkbuddyPhoneSchema.parse(input)));
  handle('workbuddy-login', input => service.loginWorkbuddy(WorkbuddyLoginSchema.parse(input)));
  handle('authorize', input => service.authorize(z.enum(['qoder', 'trae']).parse(input)));
  handle('reopen-auth', input => service.reopenAuth(z.string().uuid().parse(input)));
  handle('cancel-auth', input => service.cancelAuth(z.union([z.string().uuid(), CheckinProviderSchema]).parse(input)));
  handle('disconnect', input => service.disconnect(CheckinProviderSchema.parse(input)));
  handle('settings', input => service.saveSettings(CheckinSettingsSchema.parse(input)));
  handle('guide', async input => {
    const provider = CheckinProviderSchema.parse(input);
    await shell.openExternal(provider === 'workbuddy' ? 'https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting' : provider === 'qoder' ? 'https://docs.qoder.cn/events/100credits' : 'https://docs.trae.cn/ide_plans-and-billing');
  });
  const resume = (): void => { void service.tick('resume'); };
  powerMonitor.on('resume', resume);
  powerMonitor.on('unlock-screen', resume);
  app.once('before-quit', () => { powerMonitor.off('resume', resume); powerMonitor.off('unlock-screen', resume); service.dispose(); });
  service.start();
  return service;
}
