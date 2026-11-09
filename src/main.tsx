import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App';
import { DesktopIslandApp } from './views/DesktopIsland';
import { IslandAssistant } from './views/IslandAssistant';
import './shell.css';
import './views/speech.css';
import './views/island-settings.css';
import '../modules/todo/ui/todo.css';
import '../modules/bazi/ui/bazi.css';
import '../modules/copywriting/ui/copy.css';
import '../modules/browser/ui/pane.css';
import '../modules/reading/ui/reading.css';

const root = createRoot(document.getElementById('root')!);

// 桌面灵动岛:沿用独立窗口查询参数载入同一 bundle
if (new URLSearchParams(location.search).get('window') === 'island-assistant') {
  root.render(<StrictMode><IslandAssistant /></StrictMode>);
} else if (new URLSearchParams(location.search).get('window') === 'float') {
  root.render(
    <StrictMode>
      <DesktopIslandApp />
    </StrictMode>,
  );
} else if ((import.meta.env.DEV || import.meta.env.MODE === 'diagnostics') && location.hash.startsWith('#dev/browser')) {
  void import('./views/DevBrowserView').then(({ DevBrowserView }) => root.render(
    <StrictMode>
      <DevBrowserView />
    </StrictMode>,
  ));
} else if ((import.meta.env.DEV || import.meta.env.MODE === 'diagnostics') && location.hash.startsWith('#dev/office')) {
  void import('./views/DevOfficeView').then(({ DevOfficeView }) => root.render(
    <StrictMode>
      <DevOfficeView />
    </StrictMode>,
  ));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
