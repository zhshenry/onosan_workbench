import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotHostState } from '../../shared/bot-contracts';
import { errorText } from '../ui/controls';
import { Rows } from './SettingsView';

const wb = window.workbench;
// A change can still be running when the user leaves and reopens settings.
let backgroundChange: Promise<BotHostState> | undefined;

export function BotManagement() {
  const [host, setHost] = useState<BotHostState>();
  const [hostError, setHostError] = useState('');
  const [busy, setBusy] = useState(false);
  const hostRequest = useRef(0);

  const readHost = useCallback(() => {
    const request = ++hostRequest.current;
    const pending = backgroundChange;
    setBusy(Boolean(pending));
    setHostError('');
    void (pending ?? wb.bot.getHostState()).then(next => {
      if (request === hostRequest.current) setHost(next);
    }, cause => {
      if (request !== hostRequest.current) return;
      setHost(undefined);
      setHostError(errorText(cause));
    }).finally(() => {
      if (request === hostRequest.current) setBusy(false);
    });
  }, []);

  useEffect(() => {
    readHost();
    let timer: number | undefined;
    const unsubscribe = wb.bot.onChanged(({ kind }) => {
      if (kind !== 'host' || backgroundChange || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!backgroundChange) readHost();
      }, 250);
    });
    return () => {
      hostRequest.current++;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [readHost]);

  function changeBackground() {
    if (!host || backgroundChange) return;
    const pending = wb.bot.setBackground(!host.supervised);
    backgroundChange = pending;
    const clear = () => { backgroundChange = undefined; };
    void pending.then(clear, clear);
    readHost();
  }

  const issue = hostError || host?.error;
  return <section className="bot-management" aria-labelledby="bot-management-runtime">
    <h2 id="bot-management-runtime">后台运行</h2>
    <Rows query="" rows={[{
      key: 'botBackground',
      title: '独立 Bot 后台',
      desc: '登录系统后待命。退出应用后，可继续执行所需资源仍可用的任务。休眠或关机时暂停。浏览器任务需要工作区在线。',
      control: <button type="button" className="toggle" role="switch" aria-checked={host?.supervised ?? false}
        aria-label="独立 Bot 后台" disabled={busy || !host} onClick={changeBackground} />,
    }]} />
    {issue && <div className="bot-management-feedback">
      <p className="error" role="alert">{issue}</p>
      <button type="button" className="set-btn" disabled={busy} onClick={readHost}>重新读取后台状态</button>
    </div>}
  </section>;
}
