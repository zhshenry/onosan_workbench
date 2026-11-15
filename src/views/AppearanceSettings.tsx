import { useId } from 'react';
import { Check } from '@phosphor-icons/react';
import type { UiTheme } from '../../shared/contracts';
import type { AppearanceController } from '../appearance';

const THEMES: { value: UiTheme; label: string; description: string }[] = [
  { value: 'mist', label: '雾珀', description: '雾蓝与微暖光晕' },
  { value: 'warm', label: '暖砂', description: '杏色与柔和砂岩' },
  { value: 'celadon', label: '青瓷', description: '清润青绿' },
  { value: 'wisteria', label: '藤紫', description: '低饱和紫雾' },
  { value: 'rose', label: '蔷薇', description: '温柔灰粉' },
  { value: 'oat', label: '燕麦', description: '自然中性色' },
  { value: 'windowlight', label: '窗影', description: '光影随时段切换' },
  { value: 'spatial', label: '空间窗景', description: '安静的室内景深' },
];

export function AppearanceSettings({ controller }: { controller: AppearanceController }) {
  const id = useId();
  const { value, status, error, change, retry } = controller;
  const disabled = !controller.ready;
  return <section className="appearance-settings" aria-label="外观设置">
    <fieldset disabled={disabled} data-setting-key="navigationStyle">
      <legend>导航样式</legend>
      <p>切换顶栏与侧栏的呈现方式，保留展开状态。</p>
      <div className="appearance-pair">
        {([{ value: 'classic', label: '经典', description: '连贯顶栏，固定侧栏' },
          { value: 'floating', label: '悬浮', description: '独立胶囊，侧栏居中' }] as const).map(option =>
          <label className="appearance-choice" key={option.value}>
            <input type="radio" name={`${id}-navigation`} checked={value.navigationStyle === option.value}
              onChange={() => change({ navigationStyle: option.value })} />
            <span className="navigation-preview" data-style={option.value} aria-hidden="true"><i /><i /><i /><i /></span>
            <span><b>{option.label}</b><small>{option.description}</small></span><Check className="appearance-check" aria-hidden="true" />
          </label>)}
      </div>
    </fieldset>
    <fieldset disabled={disabled} data-setting-key="glassIntensity">
      <legend>玻璃质感</legend><p>只调整透明度、模糊与边缘光，不改变布局。</p>
      <div className="appearance-pair">
        {([{ value: 'normal', label: '普通玻璃', description: '熟悉的清晰与轻盈' },
          { value: 'strong', label: '强玻璃', description: '更透的层次，柔和的磨砂' }] as const).map(option =>
          <label className="appearance-choice" key={option.value}>
            <input type="radio" name={`${id}-glass`} checked={value.glassIntensity === option.value}
              onChange={() => change({ glassIntensity: option.value })} />
            <span className="material-preview" data-material={option.value} aria-hidden="true"><i /></span>
            <span><b>{option.label}</b><small>{option.description}</small></span><Check className="appearance-check" aria-hidden="true" />
          </label>)}
      </div>
    </fieldset>
    <fieldset disabled={disabled} data-setting-key="uiTheme">
      <legend>界面主题</legend><p>选择背景与配色。导航和玻璃质感保持你的选择。</p>
      <div className="appearance-themes">
        {THEMES.map(theme => <label className="appearance-choice theme-choice" key={theme.value}>
          <input type="radio" name={`${id}-theme`} checked={value.uiTheme === theme.value}
            onChange={() => change({ uiTheme: theme.value })} />
          <span className="theme-preview" data-theme={theme.value} data-window-light={value.windowLight} aria-hidden="true"><i /><i /><i /></span>
          <span><b>{theme.label}</b><small>{theme.description}</small></span><Check className="appearance-check" aria-hidden="true" />
        </label>)}
      </div>
    </fieldset>
    {value.uiTheme === 'windowlight' && <fieldset disabled={disabled} data-setting-key="windowLight">
      <legend>窗影时段</legend><p>手动选择光线，切换其他主题后仍会保留。</p>
      <div className="appearance-light">
        {([{ value: 'morning', label: '上午' }, { value: 'afternoon', label: '午后' }, { value: 'dusk', label: '傍晚' }] as const).map(light =>
          <label className="appearance-choice" key={light.value}>
            <input type="radio" name={`${id}-light`} checked={value.windowLight === light.value} onChange={() => change({ windowLight: light.value })} />
            <span>{light.label}</span><Check className="appearance-check" aria-hidden="true" />
          </label>)}
      </div>
    </fieldset>}
    <div className="appearance-save" role={error ? 'alert' : 'status'}>
      {error || (status === 'loading' ? '正在读取外观设置…' : status === 'saving' ? '正在保存…' : '已保存，重启后继续使用')}
      {error && <button type="button" className="btn secondary" onClick={retry}>重试</button>}
    </div>
  </section>;
}
