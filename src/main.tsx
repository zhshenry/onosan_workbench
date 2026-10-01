import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App';
import { FloatTodoApp } from './views/FloatTodo';
import { DevBrowserView } from './views/DevBrowserView';
import { DevOfficeView } from './views/DevOfficeView';
import './shell.css';
import '../modules/todo/ui/todo.css';
import '../modules/bazi/ui/bazi.css';
import '../modules/copywriting/ui/copy.css';
import '../modules/browser/ui/pane.css';

const root = createRoot(document.getElementById('root')!);

// 悬浮待办窗:独立小窗经 ?window=float 载入同一 bundle
if (new URLSearchParams(location.search).get('window') === 'float') {
  root.render(
    <StrictMode>
      <FloatTodoApp />
    </StrictMode>,
  );
} else if (location.hash.startsWith('#dev/browser')) {
  root.render(
    <StrictMode>
      <DevBrowserView />
    </StrictMode>,
  );
} else if (location.hash.startsWith('#dev/office')) {
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
