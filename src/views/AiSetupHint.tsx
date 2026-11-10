import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { AiConfig } from '../../shared/workbench-api';
import { AiTopbarHint } from '../ui/AiTopbarHint';

const DISMISSED_KEY = 'wb.ai.setup-hint.dismissed.v1';

export function AiSetupHint({ trigger, active, onConfigure }: {
  trigger: RefObject<HTMLButtonElement | null>; active: boolean; onConfigure(): void;
}) {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, '1'); setDismissed(true);
  }, []);

  useEffect(() => {
    let mounted = true, received = false;
    const apply = (config: AiConfig): void => {
      setNeedsSetup(config.models.length === 0);
      if (config.models.length > 0) dismiss();
    };
    const off = window.workbench.ai.onConfigChanged(config => { received = true; apply(config); });
    void window.workbench.ai.config().then(config => { if (mounted && !received) apply(config); }, () => {});
    return () => { mounted = false; off(); };
  }, [dismiss]);

  return <AiTopbarHint trigger={trigger} active={active && needsSetup && !dismissed} kind="setup" title="配置模型，开启 AI 助手"
    message={<>添加一个对话模型，<br />就能在工作台里对话与创作。</>} closeLabel="关闭配置引导" actionLabel="去配置" onDismiss={dismiss} onAction={onConfigure} />;
}
