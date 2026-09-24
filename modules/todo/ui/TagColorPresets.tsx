const TAG_COLOR_PRESETS = [
  '#b8532f', '#c76b4d', '#b98145', '#9b8a48',
  '#6f8f79', '#4f8a72', '#4d8888', '#4f7897',
  '#5877ad', '#676fa3', '#8c78a5', '#a86f9c',
  '#b56f82', '#a75a63', '#8b6b57', '#6d7078',
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLOR_PRESETS[0];

export function TagColorPresets({ value, onChange }: { value: string; onChange(value: string): void }) {
  return <div className="tag-color-presets" role="group" aria-label="新标签颜色">
    {TAG_COLOR_PRESETS.map(color => <button key={color} type="button" aria-label={`选择颜色 ${color}`} aria-pressed={value === color} style={{ backgroundColor: color }} onClick={() => onChange(color)} />)}
  </div>;
}
