/* 独立评审交互：仅使用内存中的合成数据，不调用 Electron IPC、模型或业务存储。 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 18) => `<span class="ap-icon" aria-hidden="true" style="--icon-size:${size}px">${window.ASSISTANT_PREVIEW_ICONS[name] || ''}</span>`;
  const hydrateIcons = () => document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
  const params = new URLSearchParams(location.search);
  const initialView = ['copy', 'home', 'bazi'].includes(params.get('view')) ? params.get('view') : 'copy';
  const state = { view: initialView, draftId: 'workbench', profileId: 'lin', assistantKey: initialView === 'home' ? 'todo:home' : initialView === 'bazi' ? 'bazi:lin' : 'copy:workbench', open: params.get('open') !== 'false', width: 380, activeRun: null, completed: null, counter: 0 };
  const initialParagraph = '最近这段时间，我一直在想，能不能有一个地方，把每天要用的这些小工具都放在一起。于是我开始做这个工作台，希望用起来能更顺手一些。';
  const replacement = '这段时间，我把待办、写作和命理工具放进了同一个工作台。每天少开几个窗口，做事也更连贯了。';
  const drafts = {
    workbench: { title: '给自己做一个顺手的工作台', paragraphs: [initialParagraph, '最先放进去的是待办。之前总是写在不同的地方，想做的时候找不到，找到的时候又忘了最初为什么要做。现在打开首页，就能看见今天的安排。', '接着是写作。我想保留一个足够安静的编辑区，把刚冒出来的想法先记下来，再慢慢整理成文章。AI 可以陪我推敲，但文字还是要有自己的语气。', '工具不需要一下子做得很大。先把每天真的会用到的几件事做好，再一点点往里面放。'], revision: 1, time: '今天 14:08' },
    weekend: { title: '周末，去河边走了走', paragraphs: ['周日下午，我沿着河边走了一段路。没有特意安排路线，看到哪条路有树荫，就往那边走。', '回来以后发现，那些一直想不清楚的事，也没那么着急要有答案。'], revision: 1, time: '昨天 18:42' },
    reading: { title: '最近读到的一句话', paragraphs: ['把注意力放回能够亲手改变的事。', '记下这句话，是想提醒自己：每天往前挪一点，比反复设想一个完整的计划更有用。'], revision: 1, time: '9月26日 21:15' },
  };
  const profiles = {
    lin: { name: '林川', detail: '1990-08-16 14:30 · 男', day: '癸', wx: '水', animal: '马', pillars: [['年柱', '正印', '庚', '午', '金', '火', '路旁土'], ['月柱', '伤官', '甲', '申', '木', '金', '泉中水'], ['日柱', '日主', '癸', '丑', '水', '土', '桑柘木'], ['时柱', '七杀', '己', '未', '土', '土', '天上火']], count: [1, 1, 3, 2, 1], note: '先认识四柱和五行，再慢慢整理自己的理解。' },
    shen: { name: '沈禾', detail: '另一份合成命例', day: '甲', wx: '木', animal: '兔', pillars: [['年柱', '正印', '癸', '卯', '水', '木', '金箔金'], ['月柱', '比肩', '甲', '子', '木', '水', '海中金'], ['日柱', '日主', '甲', '寅', '木', '木', '大溪水'], ['时柱', '正官', '辛', '未', '金', '土', '路旁土']], count: [4, 0, 1, 1, 2], note: '' },
  };
  const tasks = [
    { id: 'blog', title: '完成工作台的第一篇博客', tag: '创作', time: '今天 17:00', detail: '正文已经写好，接下来整理开头', done: false },
    { id: 'reading', title: '阅读 DAMA BOOK 30 分钟', tag: '学习', time: '今天 20:00', detail: '继续第二章，记下三个要点', done: false },
    { id: 'walk', title: '晚饭后出门散步', tag: '生活', time: '今天 19:30', detail: '留一点不用看屏幕的时间', done: false },
    { id: 'review', title: '整理今天的灵感笔记', tag: '创作', time: '今天 21:00', detail: '把零散想法放回笔记里', done: false },
  ];
  const sessions = new Map();
  const selectedSessions = new Map();
  const wx = { 木: 'var(--bazi-wx-mu)', 火: 'var(--bazi-wx-huo)', 土: 'var(--bazi-wx-tu)', 金: 'var(--bazi-wx-jin)', 水: 'var(--bazi-wx-shui)' };
  function pageKey() { return state.view === 'copy' ? `copy:${state.draftId}` : state.view === 'bazi' ? `bazi:${state.profileId}` : 'todo:home'; }
  function contextFor(key) {
    if (key.startsWith('copy:')) return { key, label: '博客编辑', object: drafts[key.slice(5)]?.title || '未命名笔记', symbol: 'NotePencil', placeholder: '继续聊聊这篇文章…', scope: '关联笔记的标题、正文，以及你引用的段落。其他笔记不会加入这段对话。', suggestions: ['再简洁一些', '语气更自然'] };
    if (key.startsWith('bazi:')) return { key, label: '命理解读', object: `${profiles[key.slice(5)]?.name || '未命名命例'} · 八字命盘`, symbol: 'Moon', placeholder: '围绕这个命盘，继续问我…', scope: '关联命例及八字盘面。本次解读保持只读，不修改命例资料。', suggestions: ['解释一下十神', '先看哪一柱？'] };
    return { key: 'todo:home', label: '待办与日程', object: '今天的安排 · 9月28日', symbol: 'CheckSquare', placeholder: '说说你想怎样安排今天…', scope: '当前待办与日程。修改会先列出建议，由你确认后应用。', suggestions: ['梳理今天的安排', '帮我做个每日复盘'] };
  }
  function context() { return contextFor(pageKey()); }
  function assistantContext() { return contextFor(state.assistantKey); }
  function createSession(key, seed = false) {
    const session = { id: `preview-${++state.counter}`, key, draft: '', entries: [], title: '新对话', scrollTop: null, followTail: true };
    if (seed && key === 'copy:workbench') {
      session.title = '推敲文章的开头';
      session.entries = [{ role: 'user', text: '这段开头有点绕，帮我写得更直接些，保留我的语气。' }, { role: 'assistant', text: '可以。先把你做了什么、带来了什么变化说清楚，保留平实的语气。', proposal: { kind: 'copy', objectId: 'workbench', before: initialParagraph, after: replacement, revision: 1, status: 'pending' } }];
    } else if (seed && key === 'todo:home') {
      session.title = '给写作留出一点时间';
      session.entries = [{ role: 'user', text: '今天想留点时间写博客，把阅读安排到明晚八点。' }, { role: 'assistant', text: '可以，把这项阅读移到明晚 20:00。确认后会更新到你的待办里。', proposal: { kind: 'todo', objectId: 'reading', before: '今天 20:00', after: '明天 20:00', status: 'pending' } }];
    } else if (seed && key === 'bazi:lin') {
      session.title = '从日主和五行开始';
      session.entries = [{ role: 'user', text: '先帮我理解日主和五行分布，别一下讲太多术语。' }, { role: 'assistant', text: '我们先看两个地方，慢慢读这张盘。', reading: true }];
    }
    const list = sessions.get(key) || [];
    list.push(session); sessions.set(key, list); selectedSessions.set(key, session.id);
    return session;
  }
  function currentSession() {
    const key = state.assistantKey;
    if (!sessions.has(key)) return createSession(key);
    return sessions.get(key).find((item) => item.id === selectedSessions.get(key));
  }
  function announce(message) { $('announcer').textContent = message; }
  let toastTimer;
  function toast(message) { $('toast').textContent = message; $('toast').dataset.show = 'true'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').dataset.show = 'false'; }, 2600); announce(message); }
  function setView(view) { state.view = view; $('history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); render(); $('main').scrollTop = 0; announce(`已切换到${context().label}，${context().object}`); }
  function setOpen(open) {
    state.open = open; $('preview').dataset.open = String(open);
    $('assistant-toggle').setAttribute('aria-expanded', String(open)); $('assistant-toggle').setAttribute('aria-label', open ? '收起 AI 助手' : '展开 AI 助手'); $('assistant-toggle').title = open ? '收起 AI 助手' : '展开 AI 助手';
    if (!open) $('assistant-toggle').focus();
    else { $('ai-notification').hidden = true; $('message-input').focus(); }
    updateLayout(); updateRunUI();
  }
  function renderBreadcrumb() {
    const label = state.view === 'copy' ? '自媒体工作台' : state.view === 'bazi' ? '小工具' : '个人工作台';
    $('breadcrumb').innerHTML = `<details class="ap-crumb-menu"><summary>${icon('SidebarSimple', 15)}${label}${icon('CaretDown', 12)}</summary><div class="ap-crumb-options"><button data-go="home">首页 · 待办与日程</button><button data-go="copy">自媒体 · 博客编辑</button><button data-go="bazi">小工具 · 命理</button></div></details><span>/</span><b>${state.view === 'copy' ? '博客编辑' : state.view === 'bazi' ? '命理' : '今日概览'}</b>`;
  }
  function renderCopy() {
    const draft = drafts[state.draftId];
    const options = Object.entries(drafts).map(([id, item]) => `<option value="${id}" ${state.draftId === id ? 'selected' : ''}>${escape(item.title || '未命名笔记')}</option>`).join('');
    return `<div class="ap-page-head"><div><h1>博客编辑</h1><p>把想法写下来，再一起推敲。</p></div><button class="ap-button" data-action="new-draft">${icon('Plus', 14)}新建笔记</button></div>
      <div class="ap-copy-grid"><aside class="ap-notebooks glass" aria-label="笔记列表"><div class="ap-list-head"><span>${icon('Notebook', 16)}我的笔记</span><span>${Object.keys(drafts).length}</span></div>${Object.entries(drafts).map(([id, item]) => `<button class="ap-note" data-draft="${id}" aria-pressed="${id === state.draftId}"><b>${escape(item.title || '未命名笔记')}</b><p>${escape(item.paragraphs[0] || '还没有正文')}</p><time>${item.time}</time></button>`).join('')}<div class="ap-list-foot">${icon('HardDrives', 14)}笔记保存在本机</div></aside>
      <section class="ap-editor"><div class="ap-editor-toolbar"><div><span class="ap-tag">草稿</span><span class="ap-save-state">${icon('Check', 13)}<span id="save-label">已保存</span></span></div><label class="ap-note-selector">笔记 <select id="draft-select" aria-label="切换笔记">${options}</select></label><span class="ap-chip" id="word-count">${draft.paragraphs.join('').length} 字</span></div>
      <div class="ap-editor-inner"><label class="ap-field-label" for="draft-title">标题</label><input class="ap-title-input" id="draft-title" value="${escape(draft.title)}" placeholder="给这篇笔记起个名字"><div class="ap-field-label" id="body-label">正文</div><div class="ap-writing" id="draft-body" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="body-label" spellcheck="false">${draft.paragraphs.map((text, index) => `<p${index === 0 ? ' id="quoted-paragraph"' : ''}>${index === 0 && state.draftId === 'workbench' ? `<mark>${escape(text)}</mark>` : escape(text)}</p>`).join('')}</div></div>
      <div class="ap-editor-footer"><span>${icon('Sparkle', 14)}</span><button data-prompt="帮我润色当前正文，保留我的语气。">润色</button><button data-prompt="根据当前文章，帮我想几个标题。">起标题</button><button data-prompt="把开头段落改得更简洁一些。">改写开头</button></div></section></div>`;
  }
  function renderHome() {
    const finished = 2 + tasks.filter((item) => item.done).length;
    const remaining = tasks.filter((item) => !item.done && item.time.startsWith('今天')).length;
    return `<div class="ap-page-head"><div><h1>下午好，Ono</h1><p>今天已完成 <b>${finished}</b> 项，还有 <b>${remaining}</b> 件事慢慢来。</p></div><span class="ap-chip">9月28日 · 周一</span></div><section class="ap-home-card glass"><div class="ap-section-head"><h2>待办安排</h2><span>按计划，留一点余地</span></div><div class="ap-task-list">${tasks.map((task) => `<label class="ap-task"><input type="checkbox" data-task="${task.id}" ${task.done ? 'checked' : ''} aria-label="完成${task.title}"><span class="ap-task-text"><b>${task.title}</b><span class="ap-task-meta"><span class="ap-tag">${task.tag}</span><span>${task.detail}</span></span></span><span class="ap-task-time">${task.time}</span></label>`).join('')}</div></section>
      <div class="ap-home-lower"><section class="ap-home-card glass"><div class="ap-section-head"><h2>今晚的日程</h2>${icon('CalendarBlank', 17)}</div><div class="ap-schedule"><time>19:30</time><div>出门散步<p>生活 · 30 分钟</p></div></div><div class="ap-schedule"><time>21:00</time><div>整理灵感笔记<p>留给自己的安静时间</p></div></div></section><section class="ap-home-card glass"><div class="ap-section-head"><h2>本周概览</h2><span>已完成 ${finished} 项</span></div><div class="ap-week" role="img" aria-label="本周周一完成${finished}项，其余日期还未开始">${['一', '二', '三', '四', '五', '六', '日'].map((day, i) => `<div><span>${i === 0 ? finished : '—'}</span><i class="ap-week-bar" style="--bar-height:${i === 0 ? 47 : 8}px"></i><span>周${day}</span></div>`).join('')}</div></section></div>`;
  }
  function renderBazi() {
    const profile = profiles[state.profileId];
    return `<div class="ap-page-head"><div><h1>命理</h1><p>读懂盘面，也记录自己的理解。</p></div><span class="ap-tag">八字</span></div><div class="ap-profilebar"><label class="ap-profile-caption">命例 <select class="ap-person-select" id="profile-select" aria-label="切换命例">${Object.entries(profiles).map(([id, item]) => `<option value="${id}" ${id === state.profileId ? 'selected' : ''}>${item.name}</option>`).join('')}</select><span>${profile.detail}</span></label><span class="ap-chip">命例与笔记保存在本机</span></div>
      <section class="ap-pan"><div class="ap-pan-head"><div><b>${profile.name}</b><p>${profile.detail}</p></div><span class="ap-pan-badge">四柱命盘</span></div><div class="ap-pillars">${profile.pillars.map((p, i) => `<div class="ap-pillar" ${i === 2 ? 'id="day-pillar"' : ''}><div class="ap-pillar-label">${p[0]}</div><div class="ap-shishen">${p[1]}</div><div class="ap-ganzhi" style="color:${wx[p[4]]}">${p[2]}</div><div class="ap-ganzhi" style="color:${wx[p[5]]}">${p[3]}</div><div class="ap-nayin">${p[6]}</div></div>`).join('')}</div><div class="ap-pan-foot"><span>日主 <b style="color:${wx[profile.wx]}">${profile.day} · ${profile.wx}</b></span><span>生肖 ${profile.animal}</span><span>${profile.pillars.map((p) => p[2] + p[3]).join('　')}</span></div></section>
      <div class="ap-bazi-lower"><section class="ap-home-card glass"><div class="ap-section-head"><h2>五行分布</h2><span>八字统计</span></div>${Object.keys(wx).map((key, i) => `<div class="ap-wuxing"><i class="ap-wx-dot" style="background:${wx[key]}"></i><span>${key}</span><div class="ap-wx-track"><i style="width:${profile.count[i] / 4 * 100}%;background:${wx[key]}"></i></div><span>${profile.count[i]}</span></div>`).join('')}</section><section class="ap-home-card glass"><div class="ap-section-head"><h2><label for="bazi-note">随盘笔记</label></h2><span id="note-status">已保存</span></div><textarea class="ap-bazi-note" id="bazi-note" placeholder="记下自己的理解…">${escape(profile.note)}</textarea></section></div>`;
  }
  function proposalHTML(proposal, index) {
    const applied = proposal.status === 'applied';
    const title = proposal.kind === 'copy' ? '开头段落' : '调整待办时间';
    const body = proposal.kind === 'copy' ? `<div class="ap-diff"><details class="ap-original"><summary>查看原文 · ${escape(proposal.before.slice(0, 15))}…</summary><p>${escape(proposal.before)}</p></details><div class="ap-replacement"><span class="ap-diff-label">建议改为</span>${escape(proposal.after)}</div></div>` : `<div class="ap-task-change"><b>${tasks.find((item) => item.id === proposal.objectId).title}</b><div class="ap-change-row"><div><span>原计划</span>${proposal.before}</div>${icon('ArrowRight', 15)}<div><span>调整后</span><strong>${proposal.after}</strong></div></div></div>`;
    let actions;
    if (applied) actions = `<span class="ap-applied">${icon('CheckCircle', 15)}已应用</span><button class="ap-button ap-quiet-button" data-undo="${index}">撤销</button>`;
    else if (proposal.status === 'discarded') actions = '<span class="ap-inline-status">已保留原内容</span>';
    else if (proposal.status === 'stale') actions = `<span class="ap-proposal-warning" role="alert">原内容已经变化，请根据最新内容重新生成。</span><button class="ap-button" data-prompt="请根据最新内容重新生成建议。">重新生成</button>`;
    else actions = `<button class="ap-button ap-primary-button" data-apply="${index}">${icon('Check', 14)}${proposal.kind === 'copy' ? '应用到正文' : '确认调整'}</button><button class="ap-button ap-quiet-button" data-discard="${index}">${proposal.kind === 'copy' ? '保留原文' : '暂不调整'}</button>`;
    return `<div class="ap-proposal"><div class="ap-proposal-head">${icon(proposal.kind === 'copy' ? 'NotePencil' : 'CalendarBlank', 15)}${title}<span class="ap-tag">${applied ? '已应用' : proposal.status === 'pending' ? '待确认' : '已处理'}</span></div>${body}<div class="ap-proposal-actions">${actions}</div></div>`;
  }
  function renderMessages(scroll = false) {
    const session = currentSession();
    const oldScroll = session.scrollTop;
    const entries = session.entries.map((entry, index) => {
      if (entry.role === 'user') return `<div class="ap-user-message">${escape(entry.text)}</div>`;
      return `<article class="ap-message"><div class="ap-message-byline">${icon('Sparkle', 15)}<span>AI 助手</span></div>${entry.proposal?.kind === 'copy' ? `<button class="ap-quote-link" data-action="locate-paragraph">${icon('Quotes', 13)}已引用 · 开头第 1 段${icon('ArrowUpRight', 12)}</button>` : ''}<p>${escape(entry.text)}</p>${entry.reading ? `<div class="ap-reading-point"><b>日主是癸水</b><p>看日柱上方的“癸”字。这是解读盘面时常用的起点，同一柱上方的“日主”标记也指向这里。</p><button class="ap-link-button" data-action="locate-day">${icon('CrosshairSimple', 14)}在盘面中定位日主</button></div><div class="ap-reading-point"><b>先认识五行数量</b><p>这张示例盘的八个字中，土有 3 个，金有 2 个，木、火、水各 1 个。数量只是一层信息，还要结合所在位置继续看。</p></div><p style="margin-top:13px">我们可以先停在这里。你更想了解“日主”，还是每一柱分别代表什么？</p>` : ''}${entry.proposal ? proposalHTML(entry.proposal, index) : ''}</article>`;
    }).join('');
    const running = state.activeRun?.session.id === session.id;
    $('messages').innerHTML = session.entries.length ? `<div class="ap-conversation-date">${session.title} · 今天</div>${entries}${running ? `<div class="ap-message"><div class="ap-message-byline">${icon('Sparkle', 15)}正在整理${assistantContext().label === '博客编辑' ? '这篇文章' : '你的问题'}…</div><p>可以先去其他页面，完成后会提醒你。</p></div>` : ''}` : `<div class="ap-empty-chat">${icon('Sparkle', 27)}<h2>${state.assistantKey.startsWith('copy:') ? '这篇文章，从哪里开始？' : state.assistantKey.startsWith('bazi:') ? '想先了解这个命盘的哪一部分？' : '一起安排今天。'}</h2><p>${state.assistantKey.startsWith('copy:') ? '可以聊想法、推敲段落，或帮你起一个标题。建议会先给你看，再应用到正文。' : state.assistantKey.startsWith('bazi:') ? '我会围绕关联命例解读。先从一个具体问题开始。' : '说说想做什么，或哪件事需要重新安排。'}</p></div>`;
    $('messages').scrollTop = scroll || oldScroll === null ? $('messages').scrollHeight : oldScroll;
    updateRunUI();
  }
  function renderAssistant() {
    const ctx = assistantContext();
    const keys = [...new Set([pageKey(), state.assistantKey, ...sessions.keys()])];
    const options = keys.map((key) => { const item = contextFor(key); return `<option value="${escape(key)}" ${key === state.assistantKey ? 'selected' : ''}>${escape(`${item.label} · ${item.object}`)}</option>`; }).join('');
    $('context').innerHTML = `<div class="ap-context-top"><span>正在协助</span></div><select class="ap-context-select" id="assistant-context" aria-label="选择正在协助的对象">${options}</select><div class="ap-context-actions"><button id="context-detail" aria-expanded="false">已关联内容</button><button data-action="page-chat">基于当前页面对话</button></div><p class="ap-context-detail" id="context-scope" hidden>${ctx.scope}</p>`;
    $('message-input').value = currentSession().draft;
    $('message-input').placeholder = ctx.placeholder;
    $('suggestions').innerHTML = ctx.suggestions.map((text) => `<button data-prompt="${text}">${text}</button>`).join('');
    renderMessages();
  }
  function renderHistory() {
    const session = currentSession();
    $('history').innerHTML = `<b>当前对象的对话</b>${[...sessions.get(state.assistantKey)].reverse().map((item) => `<button data-session="${item.id}" aria-current="${session.id === item.id}">${icon('ChatCircleDots', 16)}${escape(item.title)}</button>`).join('')}`;
  }
  function render() {
    $('preview').dataset.view = state.view; $('preview').dataset.open = String(state.open);
    document.querySelectorAll('.ap-rail-btn[data-view]').forEach((button) => { if (button.dataset.view === state.view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    renderBreadcrumb();
    $('main').innerHTML = state.view === 'copy' ? renderCopy() : state.view === 'bazi' ? renderBazi() : renderHome();
    renderAssistant();
    $('assistant-toggle').setAttribute('aria-expanded', String(state.open));
    updateLayout();
  }
  function updateRunUI() {
    const run = state.activeRun;
    const inCurrent = run?.session.id === currentSession().id;
    const otherRun = run && !inCurrent;
    $('send').innerHTML = icon(inCurrent ? 'Stop' : 'ArrowUp', 18);
    $('send').setAttribute('aria-label', inCurrent ? '停止生成' : '发送消息');
    $('send').title = inCurrent ? '停止生成' : '发送消息';
    $('send').disabled = Boolean(otherRun) || (!inCurrent && !$('message-input').value.trim());
    $('compose-hint').textContent = otherRun ? '另一段对话正在回复，可从顶栏返回或停止' : 'Enter 发送 · Shift + Enter 换行';
    const activity = run || state.completed;
    $('background-job').hidden = !activity || (activity.session.id === currentSession().id && state.open);
    const backgroundRunning = Boolean(run && (!state.open || !inCurrent));
    $('assistant-toggle').dataset.backgroundRunning = String(backgroundRunning);
    const toggleLabel = `${state.open ? '收起' : '展开'} AI 助手${backgroundRunning ? '，有对话正在后台生成' : ''}`;
    $('assistant-toggle').setAttribute('aria-label', toggleLabel); $('assistant-toggle').title = toggleLabel;
    if (activity) $('background-job').textContent = `${activity.object.length > 9 ? activity.object.slice(0, 9) + '…' : activity.object} · ${run ? '生成中' : '已完成'}`;
  }
  function startReply(text) {
    if (state.activeRun) { toast('请先等待当前回复完成，或返回原对话停止生成'); return; }
    const session = currentSession(); const ctx = assistantContext();
    session.entries.push({ role: 'user', text }); session.draft = '';
    if (session.title === '新对话') session.title = text.slice(0, 15);
    $('message-input').value = ''; setOpen(true);
    const view = session.key.startsWith('copy:') ? 'copy' : session.key.startsWith('bazi:') ? 'bazi' : 'home';
    const draftId = view === 'copy' ? session.key.slice(5) : state.draftId;
    const profileId = view === 'bazi' ? session.key.slice(5) : state.profileId;
    const draftSnapshot = view === 'copy' ? { id: draftId, revision: drafts[draftId].revision, before: drafts[draftId].paragraphs[0] || '' } : null;
    const run = { session, view, draftId, profileId, object: ctx.object, input: text, timer: null };
    state.activeRun = run; state.completed = null; renderMessages(true);
    run.timer = setTimeout(() => {
      let entry;
      if (run.view === 'copy' && /标题/.test(text)) entry = { role: 'assistant', text: '可以试试这三个方向：① 给自己做一个顺手的工作台；② 把每天的小事，放在同一个地方；③ 我的工作台，从待办和写作开始。你更喜欢哪一个方向？' };
      else if (draftSnapshot && draftSnapshot.before) entry = { role: 'assistant', text: '我整理了一版更直接的开头。你可以先对照原文，再决定是否应用。', proposal: { kind: 'copy', objectId: draftSnapshot.id, before: draftSnapshot.before, after: draftSnapshot.id === 'workbench' ? '我给自己做了一个工作台，把待办、写作和常用工具放到一起。打开它，就能接着做今天的事。' : '把眼前的感受先写下来，等想法清楚一些，再慢慢整理。', revision: draftSnapshot.revision, status: 'pending' } };
      else if (run.view === 'bazi') entry = { role: 'assistant', text: `这段对话仍然围绕${profiles[run.profileId].name}的命盘。可以先从日柱读起：上方的“${profiles[run.profileId].day}”是日主，再结合月柱理解盘面。我们一次只看一部分。` };
      else if (run.view === 'home') entry = { role: 'assistant', text: '可以先把博客作为今天的重点，再检查阅读和散步的时间。需要调整时，我会把具体事项和变更内容列出来，交给你确认。' };
      else entry = { role: 'assistant', text: '先聊聊你想写的事情：发生了什么，哪一个细节最让你想记录下来？' };
      session.entries.push(entry); state.activeRun = null; state.completed = run;
      if (currentSession().id === session.id) renderMessages(true);
      else { $('ai-notification').hidden = false; updateRunUI(); }
      announce(`${run.object}的回复已完成`);
    }, 3600);
  }
  function stopReply() {
    const run = state.activeRun; if (!run) return;
    clearTimeout(run.timer); run.session.entries.push({ role: 'assistant', text: '已停止生成。输入已保留，可以修改后重新发送。' }); run.session.draft = run.input; state.activeRun = null;
    if (currentSession().id === run.session.id) { $('message-input').value = run.input; renderMessages(true); }
    else updateRunUI();
  }
  function actOnProposal(index, action) {
    const proposal = currentSession().entries[index].proposal;
    if (action === 'discard') { proposal.status = 'discarded'; renderMessages(); return; }
    if (action === 'apply') {
      const resource = proposal.kind === 'copy' ? drafts[proposal.objectId] : tasks.find((item) => item.id === proposal.objectId);
      if ((proposal.kind === 'copy' && resource.revision !== proposal.revision) || (proposal.kind === 'todo' && resource.time !== proposal.before)) { proposal.status = 'stale'; renderMessages(); return; }
      if (proposal.kind === 'copy') { resource.paragraphs[0] = proposal.after; resource.revision++; proposal.appliedRevision = resource.revision; }
      else resource.time = proposal.after;
      proposal.status = 'applied'; render(); toast(proposal.kind === 'copy' ? '已应用到当前正文 · 可在建议卡撤销' : '阅读已调整到明天 20:00');
    } else {
      const resource = proposal.kind === 'copy' ? drafts[proposal.objectId] : tasks.find((item) => item.id === proposal.objectId);
      if ((proposal.kind === 'copy' && resource.revision !== proposal.appliedRevision) || (proposal.kind === 'todo' && resource.time !== proposal.after)) { toast('内容已有新的修改，保留当前内容，请重新核对'); return; }
      if (proposal.kind === 'copy') { resource.paragraphs[0] = proposal.before; resource.revision++; proposal.revision = resource.revision; } else resource.time = proposal.before;
      proposal.status = 'pending'; render(); toast('已撤销这次修改');
    }
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.view) setView(button.dataset.view);
    else if (button.dataset.go) setView(button.dataset.go);
    else if (button.dataset.draft) { state.draftId = button.dataset.draft; render(); $('main').scrollTop = 0; }
    else if (button.dataset.prompt) { if (button.closest('.ap-editor-footer')) { state.assistantKey = pageKey(); renderAssistant(); } startReply(button.dataset.prompt); }
    else if (button.dataset.apply !== undefined) actOnProposal(Number(button.dataset.apply), 'apply');
    else if (button.dataset.discard !== undefined) actOnProposal(Number(button.dataset.discard), 'discard');
    else if (button.dataset.undo !== undefined) actOnProposal(Number(button.dataset.undo), 'undo');
    else if (button.dataset.session) { selectedSessions.set(state.assistantKey, button.dataset.session); $('history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); renderAssistant(); }
    else if (button.dataset.action === 'page-chat') { const key = pageKey(); state.assistantKey = key; if (sessions.has(key)) selectedSessions.set(key, sessions.get(key).at(-1).id); else createSession(key); $('history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); renderAssistant(); $('message-input').focus(); }
    else if (button.dataset.action === 'new-draft') {
      const id = `new-${++state.counter}`; drafts[id] = { title: '', paragraphs: [], revision: 1, time: '刚刚' }; state.draftId = id; render(); $('draft-title').focus();
    } else if (button.dataset.action === 'locate-paragraph') { state.draftId = state.assistantKey.slice(5); setView('copy'); $('quoted-paragraph')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); if ($('preview').clientWidth < 1160) setOpen(false); }
    else if (button.dataset.action === 'locate-day') { state.profileId = state.assistantKey.slice(5); setView('bazi'); $('day-pillar')?.classList.add('ap-located'); $('day-pillar')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); if ($('preview').clientWidth < 1160) setOpen(false); toast('已定位：日柱上方的天干就是日主'); }
    else if (button.id === 'context-detail') { const detail = $('context-scope'); detail.hidden = !detail.hidden; button.setAttribute('aria-expanded', String(!detail.hidden)); button.textContent = detail.hidden ? '已关联内容' : '收起关联范围'; }
  });
  document.addEventListener('input', (event) => {
    if (event.target.id === 'message-input') { currentSession().draft = event.target.value; updateRunUI(); }
    if (event.target.id === 'draft-title') { drafts[state.draftId].title = event.target.value; drafts[state.draftId].revision++; if (state.assistantKey === pageKey()) $('assistant-context').selectedOptions[0].textContent = `${assistantContext().label} · ${assistantContext().object}`; }
    if (event.target.id === 'draft-body') { const draft = drafts[state.draftId]; draft.paragraphs = event.target.innerText.trim().split(/\n\s*\n/); draft.revision++; $('word-count').textContent = `${draft.paragraphs.join('').length} 字`; }
    if (event.target.id === 'bazi-note') profiles[state.profileId].note = event.target.value;
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'assistant-context') { state.assistantKey = event.target.value; $('history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); renderAssistant(); }
    if (event.target.id === 'draft-select') { state.draftId = event.target.value; render(); $('main').scrollTop = 0; }
    if (event.target.id === 'profile-select') { state.profileId = event.target.value; render(); $('main').scrollTop = 0; }
    if (event.target.dataset.task) { tasks.find((item) => item.id === event.target.dataset.task).done = event.target.checked; const finished = 2 + tasks.filter((item) => item.done).length; $('task-count').textContent = `${finished}/6`; document.querySelector('.ap-tiny-progress > i').style.width = `${finished / 6 * 100}%`; $('main').innerHTML = renderHome(); }
  });
  $('assistant-toggle').addEventListener('click', () => setOpen(!state.open));
  $('assistant-close').addEventListener('click', () => setOpen(false));
  $('new-chat').addEventListener('click', () => { createSession(state.assistantKey); renderAssistant(); $('message-input').focus(); });
  $('history-toggle').addEventListener('click', () => { renderHistory(); $('history').hidden = !$('history').hidden; $('history-toggle').setAttribute('aria-expanded', String(!$('history').hidden)); });
  $('composer').addEventListener('submit', (event) => { event.preventDefault(); if (state.activeRun?.session.id === currentSession().id) { stopReply(); return; } const text = $('message-input').value.trim(); if (text) startReply(text); });
  $('message-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } });
  $('messages').addEventListener('scroll', () => { const messages = $('messages'); currentSession().scrollTop = messages.scrollTop; currentSession().followTail = messages.scrollHeight - messages.clientHeight - messages.scrollTop < 25; });
  new ResizeObserver(() => { if (currentSession().followTail) $('messages').scrollTop = $('messages').scrollHeight; }).observe($('messages'));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!$('history').hidden) { $('history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); $('history-toggle').focus(); } else if (state.open) setOpen(false); } });
  $('background-job').addEventListener('click', () => { const run = state.activeRun || state.completed; if (!run) return; state.draftId = run.draftId; state.profileId = run.profileId; state.assistantKey = run.session.key; selectedSessions.set(run.session.key, run.session.id); setView(run.view); setOpen(true); state.completed = null; updateRunUI(); });
  function setTheme(theme) { document.documentElement.dataset.theme = theme; $('theme-select').value = theme; }
  $('theme-select').addEventListener('change', (event) => setTheme(event.target.value));
  $('theme-shortcut').addEventListener('click', () => { const themes = ['mist', 'cool', 'warm']; setTheme(themes[(themes.indexOf(document.documentElement.dataset.theme) + 1) % 3]); });
  function updateLayout() { $('layout-label').textContent = !state.open ? '助手已收起' : $('preview').clientWidth < 1160 ? '覆盖展开' : '并排停靠'; }
  function setSize(size) { $('preview').style.setProperty('--preview-width', size === 'auto' ? '100%' : `${size}px`); $('preview').style.setProperty('--preview-height', size === 'auto' ? '100%' : size === '1280' ? '820px' : '680px'); $('size-select').value = size; updateLayout(); }
  $('size-select').addEventListener('change', (event) => setSize(event.target.value));
  new ResizeObserver(updateLayout).observe($('preview'));
  function setWidth(width) { state.width = Math.min(480, Math.max(340, width)); $('preview').style.setProperty('--assistant-width', `${state.width}px`); $('resizer').setAttribute('aria-valuenow', String(state.width)); }
  $('resizer').addEventListener('pointerdown', (event) => { if (event.button !== 0) return; const startX = event.clientX; const startWidth = state.width; const grip = event.currentTarget; grip.setPointerCapture(event.pointerId); const move = (e) => setWidth(startWidth + startX - e.clientX); const end = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end); }; grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end); });
  $('resizer').addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(state.width + (event.key === 'ArrowLeft' ? 20 : -20)); } });
  $('reset-demo').addEventListener('click', () => location.reload());
  createSession('copy:workbench', true); createSession('todo:home', true); createSession('bazi:lin', true);
  hydrateIcons(); setTheme(['mist', 'cool', 'warm'].includes(params.get('theme')) ? params.get('theme') : 'mist'); setSize(['1280', '1024'].includes(params.get('width')) ? params.get('width') : 'auto'); render();
})();
