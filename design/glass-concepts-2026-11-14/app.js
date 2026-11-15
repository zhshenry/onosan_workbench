(() => {
  const params = new URLSearchParams(location.search);
  const state = {
    scheme: params.get('scheme') || 'e',
    page: params.get('page') || 'home',
    light: params.get('light') || 'afternoon',
    nav: params.get('nav') || 'collapsed',
    ai: params.get('ai') || 'open',
  };
  const shot = params.has('shot');
  const win = document.querySelector('.win');
  const rail = win.querySelector('.rail');
  const flyout = rail.querySelector('.rflyout');
  const toastEl = document.querySelector('.deck-toast');
  const floatLayout = () => state.scheme === 'b' || state.scheme === 'e';
  const currentWorkbench = () => (state.page === 'home' ? 'home' : 'life');
  let hideTimer = 0, toastTimer = 0;

  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = window.PH[el.dataset.icon] ?? ''; });
  if (shot) document.body.classList.add('shot');

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function render() {
    document.body.dataset.scheme = state.scheme;
    Object.assign(win.dataset, state, { layout: floatLayout() ? 'float' : 'classic' });
    const wb = currentWorkbench();
    rail.querySelectorAll('.ritem').forEach(item => {
      const on = item.dataset.wb === wb;
      item.classList.toggle('on', on);
      if (on) item.setAttribute('aria-current', 'true'); else item.removeAttribute('aria-current');
    });
    rail.querySelectorAll('.rgroup').forEach(group => group.classList.toggle('open', group.dataset.wb === wb));
    rail.querySelectorAll('.rsub').forEach(sub => {
      const on = sub.dataset.view === state.page;
      sub.classList.toggle('on', on);
      if (on) sub.setAttribute('aria-current', 'page'); else sub.removeAttribute('aria-current');
    });
    const toggle = win.querySelector('.nav-toggle');
    toggle.setAttribute('aria-expanded', String(state.nav === 'expanded'));
    toggle.setAttribute('aria-label', state.nav === 'expanded' ? '收起导航' : '展开导航');
    const aiButton = win.querySelector('.ai-btn');
    aiButton.classList.toggle('on', state.ai === 'open');
    aiButton.setAttribute('aria-expanded', String(state.ai === 'open'));
    aiButton.setAttribute('aria-label', state.ai === 'open' ? '收起 AI 助手' : '打开 AI 助手');
    document.querySelectorAll('[data-control]').forEach(group => {
      group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === state[group.dataset.control])));
    });
    document.querySelector('.light-tabs').hidden = !['a', 'e'].includes(state.scheme);
    document.querySelector('.nav-tabs').hidden = !floatLayout();
    if (state.nav === 'expanded' || !floatLayout()) hideFlyout(true);
    if (!shot) {
      const query = new URLSearchParams({ scheme: state.scheme, page: state.page });
      if (floatLayout()) query.set('nav', state.nav);
      if (state.ai === 'closed') query.set('ai', 'closed');
      if (['a', 'e'].includes(state.scheme)) query.set('light', state.light);
      history.replaceState(null, '', `?${query}`);
    }
  }

  function navigate(view) {
    if (view !== 'home' && view !== 'todo') { toast('方案稿只包含「首页」和「日程待办」两页'); return false; }
    state.page = view;
    render();
    return true;
  }

  function showFlyout(group) {
    if (!floatLayout() || state.nav !== 'collapsed') return;
    const subs = [...group.querySelectorAll('.rsub')];
    if (!subs.length) { hideFlyout(true); return; }
    clearTimeout(hideTimer);
    const item = group.querySelector('.ritem');
    flyout.querySelector('h4').textContent = item.title;
    flyout.querySelector('.rflyout-list').replaceChildren(...subs.map(sub => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fsub' + (sub.dataset.view === state.page ? ' on' : '');
      button.setAttribute('role', 'menuitem');
      button.textContent = sub.textContent;
      if (sub.dataset.view) button.dataset.view = sub.dataset.view;
      return button;
    }));
    const railRect = rail.getBoundingClientRect(), itemRect = item.getBoundingClientRect();
    const scale = itemRect.height / 44 || 1;
    flyout.style.setProperty('--fy', `${(itemRect.top - railRect.top) / scale - 4}px`);
    flyout.dataset.wb = group.dataset.wb;
    flyout.classList.add('show');
  }
  function hideFlyout(now = false) {
    clearTimeout(hideTimer);
    if (now) { flyout.classList.remove('show'); return; }
    hideTimer = setTimeout(() => flyout.classList.remove('show'), 180);
  }

  rail.addEventListener('pointerover', event => {
    clearTimeout(hideTimer);
    if (event.target.closest('.rflyout')) return;
    const group = event.target.closest('.rgroup');
    if (group) showFlyout(group);
    else if (event.target.closest('.rail-bot')) hideFlyout(true);
  });
  rail.addEventListener('pointerleave', () => hideFlyout());
  rail.addEventListener('focusin', event => {
    const group = event.target.closest('.rgroup');
    if (group && event.target.classList.contains('ritem')) showFlyout(group);
  });
  rail.addEventListener('keydown', event => {
    if (event.key === 'Escape' && flyout.classList.contains('show')) {
      const owner = rail.querySelector(`.ritem[data-wb="${flyout.dataset.wb}"]`);
      hideFlyout(true);
      owner?.focus();
    } else if (event.key === 'ArrowRight' && event.target.classList.contains('ritem') && flyout.classList.contains('show')) {
      event.preventDefault();
      flyout.querySelector('.fsub')?.focus();
    }
  });
  rail.addEventListener('click', event => {
    const fsub = event.target.closest('.fsub');
    if (fsub) { if (navigate(fsub.dataset.view)) hideFlyout(true); return; }
    const sub = event.target.closest('.rsub');
    if (sub) { navigate(sub.dataset.view); return; }
    const item = event.target.closest('.ritem');
    if (!item) return;
    const wb = item.dataset.wb;
    if (wb === 'home') { hideFlyout(true); navigate('home'); }
    else if (wb === 'life') { navigate('todo'); showFlyout(item.closest('.rgroup')); }
    else if (wb === 'settings') toast('设置会打开居中弹窗，方案稿未包含');
    else toast('方案稿只包含「首页」和「日程待办」两页');
  });

  win.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'nav') {
      if (!floatLayout()) { toast('导航展开态只做在 B / E 的悬浮布局里'); return; }
      state.nav = state.nav === 'expanded' ? 'collapsed' : 'expanded';
      render();
    } else if (action === 'ai') {
      state.ai = state.ai === 'open' ? 'closed' : 'open';
      render();
    }
  });

  document.querySelectorAll('[data-control]').forEach(group => group.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    state[group.dataset.control] = button.dataset.value;
    render();
  }));

  function fit() {
    if (shot) return;
    const wrap = document.querySelector('.stage-wrap');
    const scale = Math.min(1, wrap.clientWidth / 1280, (window.innerHeight - 60 - 48) / 820);
    document.querySelector('.stage').style.setProperty('--fit', scale.toFixed(4));
  }
  window.addEventListener('resize', fit);
  render();
  fit();
  const forced = params.get('flyout');
  if (forced) requestAnimationFrame(() => { const group = rail.querySelector(`.rgroup[data-wb="${forced}"]`); if (group) showFlyout(group); });
})();
