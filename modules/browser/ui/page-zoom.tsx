import { ArrowCounterClockwise, Minus, Plus } from '@phosphor-icons/react';
import './page-zoom.css';

const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export function PageZoomControls({ zoomFactor, disabled, onZoomChange }: {
  zoomFactor: number; disabled: boolean; onZoomChange(factor: number): void;
}) {
  const percent = Math.round(zoomFactor * 100);
  const smaller = [...ZOOM_STEPS].reverse().find(value => value < percent), larger = ZOOM_STEPS.find(value => value > percent);
  return <div className="browser-zoom" role="group" aria-label="网页缩放">
    <span>缩放</span>
    <div className="browser-zoom-steps">
      <button type="button" aria-label="缩小网页" title="缩小网页" disabled={disabled || smaller === undefined} onClick={() => smaller !== undefined && onZoomChange(smaller / 100)}><Minus size={16} /></button>
      <output aria-label="当前网页缩放" aria-live="polite">{percent}%</output>
      <button type="button" aria-label="放大网页" title="放大网页" disabled={disabled || larger === undefined} onClick={() => larger !== undefined && onZoomChange(larger / 100)}><Plus size={16} /></button>
    </div>
    <button type="button" aria-label="重置网页缩放" title="恢复 100%" disabled={disabled || percent === 100} onClick={() => onZoomChange(1)}><ArrowCounterClockwise size={18} /></button>
  </div>;
}
