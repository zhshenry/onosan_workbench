import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App';
import { DevBrowserView } from './views/DevBrowserView';
import { DevOfficeView } from './views/DevOfficeView';
import './shell.css';
import '../modules/todo/ui/todo.css';
import '../modules/bazi/ui/bazi.css';
import '../modules/copywriting/ui/copy.css';

const root = createRoot(document.getElementById('root')!);

// 开发调试路由(不进导航):#dev/<模块名>
const devPage = location.hash.match(/^#dev\/(\w+)/)?.[1];
if (devPage === 'browser') {
  root.render(
    <StrictMode>
      <DevBrowserView />
    </StrictMode>,
  );
} else if (devPage === 'office') {
  root.render(
    <StrictMode>
      <DevOfficeView />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
