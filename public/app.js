/* Nova AI Hub — frontend (vanilla JS, no build step) */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const uid = () => Math.random().toString(36).slice(2, 10);
const S = {
  settings: { lang: 'fa', theme: 'dark' }, providers: [], presets: [], prompts: [], chats: [],
  route: 'chat', chat: null, streams: new Map(), attachments: [], dir: null, agentMode: false,
  compare: false, compareKeys: [], selectedKey: localStorage.getItem('nova.model') || null,
  studioTab: 'image', studioKey: { image: null, video: null }, studioResults: [], jobs: [], galleryFilter: 'all',
  chatSearch: '', modelsFilter: { q: '', cap: 'all' }, free: null, sideOpen: false
};
function t(k, vars) {
  let s = (I18N[S.settings.lang] || I18N.fa)[k] || I18N.en[k] || k;
  if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
  return s;
}
// ------------------------------------------------------------ API
async function api(path, opts = {}) {
  const o = Object.assign({ headers: {} }, opts);
  if (o.body && typeof o.body !== 'string') { o.body = JSON.stringify(o.body); o.headers['content-type'] = 'application/json'; }
  const r = await fetch('/api' + path, o);
  let data = null; try { data = await r.json(); } catch { }
  if (r.status === 401 && data && data.needsLogin) { renderLogin(); throw new Error('auth'); }
  if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
  return data;
}
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.innerHTML = (kind === 'ok' ? icon('check') : kind === 'bad' ? icon('x') : '') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3000);
}
async function loadState() {
  const st = await api('/state');
  S.fsEnabled = st.fsEnabled; S.platform = st.platform; S.settings = st.settings; S.providers = st.providers; S.presets = st.presets; S.prompts = st.prompts; S.chats = st.chats;
  applyLook();
  if (!S.selectedKey || !findModel(S.selectedKey)) S.selectedKey = S.settings.defaultModel && findModel(S.settings.defaultModel) ? S.settings.defaultModel : (allModels().find(m => m.caps.chat) || {}).key || null;
}
function applyLook() {
  const h = document.documentElement;
  h.dataset.theme = S.settings.theme || 'dark';
  h.lang = S.settings.lang || 'fa';
  h.dir = S.settings.lang === 'en' ? 'ltr' : 'rtl';
  document.title = t('appName');
}
async function saveSettings(patch) { Object.assign(S.settings, patch); applyLook(); await api('/settings', { method: 'PUT', body: patch }); }

// ------------------------------------------------------------ models
const presetOf = p => S.presets.find(x => x.id === p.preset) || {};
const pColor = p => presetOf(p).color || '#7c5cff';
const pInitial = p => (p.name || '?').replace(/[^A-Za-z0-9\u0600-\u06FF]/g, '').slice(0, 1).toUpperCase() || '?';
function allModels(onlyEnabled = true) {
  const out = [];
  for (const p of S.providers) {
    if (onlyEnabled && !p.enabled) continue;
    for (const m of p.models || []) {
      if (onlyEnabled && m.enabled === false) continue;
      out.push(Object.assign({}, m, { key: p.id + '::' + m.id, provider: p }));
    }
  }
  return out;
}
function findModel(key) {
  if (!key) return null;
  const i = key.indexOf('::'); const pid = key.slice(0, i), mid = key.slice(i + 2);
  const p = S.providers.find(x => x.id === pid); if (!p) return null;
  const m = (p.models || []).find(x => x.id === mid); if (!m) return null;
  return Object.assign({}, m, { key, provider: p });
}
function capChips(caps = {}, free) {
  const list = [['chat', 'chat'], ['vision', 'eye'], ['image', 'image'], ['video', 'video']];
  let h = list.filter(([k]) => caps[k]).map(([k, ic]) => `<span class="cap ${k}">${icon(ic)}${t('cap_' + k)}</span>`).join('');
  if (free) h += `<span class="cap free">${icon('gift')}${t('cap_free')}</span>`;
  return `<span class="caps">${h}</span>`;
}
function modelMode(m) { if (!m) return 'chat'; if (m.caps.video && !m.caps.chat) return 'video'; if (m.caps.image && !m.caps.chat) return 'image'; return 'chat'; }
const shortName = m => m ? (m.name && m.name !== m.id && m.name.length < 48 ? m.name : m.id) : '';

// ------------------------------------------------------------ shell
const NAV = [['chat', 'chat'], ['code', 'code'], ['studio', 'wand'], ['providers', 'plug'], ['models', 'cube'], ['free', 'gift'], ['gallery', 'gallery'], ['prompts', 'book'], ['settings', 'settings']];
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <nav class="rail">
      <div class="logo">${icon('sparkles')}</div>
      ${NAV.map(([r, ic]) => `<button class="nav-btn ${S.route === r ? 'active' : ''}" data-route="${r}" title="${t('nav_' + r)}">${icon(ic)}<span>${t('nav_' + r)}</span></button>`).join('')}
      <div class="spacer"></div>
      <button class="nav-btn" id="themeBtn" title="${t('theme')}">${icon(S.settings.theme === 'dark' ? 'sun' : 'moon')}</button>
      <button class="nav-btn" id="langBtn" title="${t('language')}">${icon('globe')}<span>${S.settings.lang === 'fa' ? 'EN' : 'فا'}</span></button>
    </nav>
    <main class="main" id="main"></main></div>`;
  $$('.nav-btn[data-route]').forEach(b => b.onclick = () => go(b.dataset.route));
  $('#themeBtn').onclick = async () => { await saveSettings({ theme: S.settings.theme === 'dark' ? 'light' : 'dark' }); renderShell(); renderRoute(); };
  $('#langBtn').onclick = async () => { await saveSettings({ lang: S.settings.lang === 'fa' ? 'en' : 'fa' }); renderShell(); renderRoute(); };
  renderRoute();
}
function go(route) { S.route = route; location.hash = route; $$('.nav-btn[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === route)); renderRoute(); }
function renderRoute() {
  const r = { chat: renderChat, code: () => renderCode(), studio: renderStudio, providers: renderProviders, models: renderModels, free: renderFree, gallery: renderGallery, prompts: renderPrompts, settings: renderSettings }[S.route] || renderChat;
  r();
}
function pageHead(title, sub, actions = '') { return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="row">${actions}</div></div>`; }

// ------------------------------------------------------------ modal / popover helpers
function modal({ title, body, foot = '', wide = false, onMount }) {
  const root = $('#modal-root');
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="mh"><h3>${title}</h3><button class="btn ghost icon" data-close>${icon('x')}</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('[data-close]').onclick = close;
  root.appendChild(ov);
  if (onMount) onMount(ov, close);
  return { el: ov, close };
}
function confirmBox(text) {
  return new Promise(res => {
    modal({ title: t('confirm'), body: `<p style="margin:0;line-height:1.8">${esc(text)}</p>`, foot: `<button class="btn" data-no>${t('cancel')}</button><button class="btn primary" data-yes style="background:var(--bad)">${t('delete')}</button>`, onMount(el, close) { el.querySelector('[data-no]').onclick = () => { close(); res(false); }; el.querySelector('[data-yes]').onclick = () => { close(); res(true); }; } });
  });
}
function promptBox(title, value = '', ltr = false) {
  return new Promise(res => {
    modal({ title, body: `<input class="input ${ltr ? 'ltr' : ''}" id="pbx" value="${esc(value)}">`, foot: `<button class="btn" data-no>${t('cancel')}</button><button class="btn primary" data-yes>${t('confirm')}</button>`, onMount(el, close) { const i = el.querySelector('#pbx'); i.focus(); i.select(); const ok = () => { close(); res(i.value.trim()); }; i.onkeydown = e => { if (e.key === 'Enter') ok(); }; el.querySelector('[data-no]').onclick = () => { close(); res(null); }; el.querySelector('[data-yes]').onclick = ok; } });
  });
}
let popEl = null;
function closePopover() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', popOutside, true); } }
function popOutside(e) { if (popEl && !popEl.contains(e.target)) closePopover(); }
// Model picker: opts { filter: 'chat'|'image'|'video'|null, multi, selected:[], onPick(key|keys) }
function openModelPicker(anchor, opts) {
  closePopover();
  const st = { q: '', cap: opts.filter || 'all', sel: new Set(opts.selected || []), kb: 0 };
  popEl = document.createElement('div'); popEl.className = 'popover';
  const rect = anchor.getBoundingClientRect();
  popEl.style.top = Math.min(rect.bottom + 8, innerHeight - 200) + 'px';
  const rtl = document.documentElement.dir === 'rtl';
  if (rtl) popEl.style.right = Math.max(12, innerWidth - rect.right) + 'px'; else popEl.style.left = Math.max(12, rect.left) + 'px';
  const caps = ['all', 'chat', 'vision', 'image', 'video', 'free'];
  popEl.innerHTML = `<div class="ph"><input class="input" placeholder="${t('searchModels')}" id="mpq">
    <div class="filters">${caps.map(c => `<button data-cap="${c}">${c === 'all' ? t('all') : c === 'free' ? t('cap_free') : t('cap_' + c)}</button>`).join('')}</div>
    ${opts.multi ? `<div class="dim" style="font-size:12px">${t('compareSelect')}</div>` : ''}</div><div class="pl" id="mpl"></div>`;
  document.body.appendChild(popEl);
  setTimeout(() => document.addEventListener('mousedown', popOutside, true));
  const draw = () => {
    $$('.filters button', popEl).forEach(b => b.classList.toggle('on', b.dataset.cap === st.cap));
    const q = st.q.toLowerCase();
    let list = allModels().filter(m => (st.cap === 'all' ? (m.caps.chat || m.caps.image || m.caps.video) : st.cap === 'free' ? (m.free || m.provider.type === 'pollinations') : m.caps[st.cap]) && (!q || (m.id + ' ' + m.name + ' ' + m.provider.name).toLowerCase().includes(q)));
    list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
    st.flat = list.slice(0, 600);
    if (!list.length) { $('#mpl', popEl).innerHTML = `<div class="empty" style="padding:30px">${t('noModels')}</div>`; return; }
    let html = '', last = null, idx = 0;
    for (const m of st.flat) {
      if (m.provider.id !== last) { last = m.provider.id; html += `<div class="pgroup"><i style="background:${pColor(m.provider)}"></i>${esc(m.provider.name)}</div>`; }
      html += `<div class="mitem ${st.sel.has(m.key) ? 'sel' : ''} ${idx === st.kb ? 'kb' : ''}" data-key="${esc(m.key)}">
        ${opts.multi ? `<input type="checkbox" ${st.sel.has(m.key) ? 'checked' : ''} style="pointer-events:none">` : ''}
        <div class="mid"><b>${esc(m.id)}</b>${m.name && m.name !== m.id ? `<small>${esc(m.name)}</small>` : ''}</div>
        ${m.favorite ? icon('star', 'star') : ''}${capChips(m.caps, m.free)}</div>`;
      idx++;
    }
    $('#mpl', popEl).innerHTML = html;
    $$('.mitem', popEl).forEach(el => el.onclick = () => pick(el.dataset.key));
  };
  const pick = key => {
    if (opts.multi) {
      if (st.sel.has(key)) st.sel.delete(key); else if (st.sel.size < 3) st.sel.add(key);
      opts.onPick([...st.sel]); draw();
    } else { closePopover(); opts.onPick(key); }
  };
  $$('.filters button', popEl).forEach(b => b.onclick = () => { st.cap = b.dataset.cap; st.kb = 0; draw(); });
  const qi = $('#mpq', popEl);
  qi.oninput = () => { st.q = qi.value; st.kb = 0; draw(); };
  qi.onkeydown = e => {
    if (e.key === 'ArrowDown') { st.kb = Math.min(st.kb + 1, (st.flat || []).length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { st.kb = Math.max(st.kb - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && st.flat && st.flat[st.kb]) pick(st.flat[st.kb].key);
    if (e.key === 'Escape') closePopover();
  };
  draw(); qi.focus();
}

// ------------------------------------------------------------ CHAT
function chatGroupLabel(ts) {
  const d = (Date.now() - ts) / 864e5;
  const fa = S.settings.lang === 'fa';
  if (d < 1) return fa ? 'امروز' : 'Today'; if (d < 2) return fa ? 'دیروز' : 'Yesterday'; if (d < 7) return fa ? '۷ روز گذشته' : 'Previous 7 days'; return fa ? 'قدیمی‌تر' : 'Older';
}
function renderChat() {
  $('#main').innerHTML = `<div class="chat-layout">
    <aside class="chat-side ${S.sideOpen ? 'open' : ''}" id="side">
      <div class="top"><button class="btn primary" id="newChat">${icon('plus')}${t('newChat')}</button>
      <input class="input" id="chatSearch" placeholder="${t('searchChats')}" value="${esc(S.chatSearch)}"></div>
      <div class="chat-list" id="chatList"></div></aside>
    <section class="chat-main">
      <header class="chat-head" id="chatHead"></header>
      <div class="messages" id="messages"><div class="msgs-inner" id="msgs"></div></div>
      <div class="composer-wrap" id="composerWrap"></div>
    </section></div>`;
  $('#newChat').onclick = () => { S.chat = null; S.attachments = []; S.sideOpen = false; renderChat(); };
  $('#chatSearch').oninput = e => { S.chatSearch = e.target.value; renderChatList(); };
  renderChatList(); renderChatHead(); renderMessages(); renderComposer();
}
function renderChatList() {
  const el = $('#chatList'); if (!el) return;
  const q = S.chatSearch.toLowerCase();
  const list = S.chats.filter(c => !q || (c.title || '').toLowerCase().includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
  if (!list.length) { el.innerHTML = `<div class="empty" style="padding:30px 10px">${icon('chat')}<div>${t('noChats')}</div></div>`; return; }
  let html = '', last = null;
  for (const c of list) {
    const g = c.pinned ? t('pinned') : chatGroupLabel(c.updatedAt);
    if (g !== last) { html += `<div class="chat-group">${g}</div>`; last = g; }
    html += `<div class="chat-item ${S.chat && S.chat.id === c.id ? 'active' : ''}" data-id="${c.id}">${icon(c.pinned ? 'pin' : 'chat')}<span class="t" dir="auto">${esc(c.title)}</span>
      <span class="acts"><button data-a="pin" title="${t('pin')}">${icon('pin')}</button><button data-a="ren" title="${t('renameChat')}">${icon('edit')}</button><button data-a="del" title="${t('delete')}">${icon('trash')}</button></span></div>`;
  }
  el.innerHTML = html;
  $$('.chat-item', el).forEach(it => it.onclick = async e => {
    const id = it.dataset.id; const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    const c = S.chats.find(x => x.id === id);
    if (a === 'del') { e.stopPropagation(); if (!(await confirmBox(t('delete') + '؟'))) return; await api('/chats/' + id, { method: 'DELETE' }); S.chats = S.chats.filter(x => x.id !== id); if (S.chat && S.chat.id === id) S.chat = null; renderChat(); return; }
    if (a === 'ren') { e.stopPropagation(); const n = await promptBox(t('renameChat'), c.title); if (n) { c.title = n; await api('/chats/' + id, { method: 'PUT', body: { title: n } }); if (S.chat && S.chat.id === id) S.chat.title = n; renderChatList(); } return; }
    if (a === 'pin') { e.stopPropagation(); c.pinned = !c.pinned; await api('/chats/' + id, { method: 'PUT', body: { pinned: c.pinned } }); renderChatList(); return; }
    await openChat(id);
  });
}
async function openChat(id) {
  S.chat = await api('/chats/' + id); S.attachments = []; S.sideOpen = false;
  if (S.chat.model && findModel(S.chat.model)) S.selectedKey = S.chat.model;
  $('#side') && $('#side').classList.remove('open');
  renderChatList(); renderChatHead(); renderMessages(); renderComposer();
}
function renderChatHead() {
  const el = $('#chatHead'); if (!el) return;
  const m = findModel(S.selectedKey);
  const mode = modelMode(m);
  el.innerHTML = `
    <button class="btn ghost icon mobile-top" id="sideToggle">${icon('menu')}</button>
    <button class="model-btn" id="modelBtn">${m ? `<span class="pdot" style="background:${pColor(m.provider)}">${pInitial(m.provider)}</span><span class="mn"><b>${esc(shortName(m))}</b><small>${esc(m.provider.name)}</small></span>` : `<span class="mn"><b>${t('selectModel')}</b></span>`}${icon('chevron')}</button>
    ${m ? capChips(m.caps, m.free) : ''}
    ${mode !== 'chat' ? `<span class="mode-pill ${mode}">${t('cap_' + mode)}</span>` : ''}
    <div class="grow"></div>
    <button class="chip-toggle ${S.compare ? 'on' : ''}" id="cmpBtn" title="${t('compareHint')}">${icon('columns')}<span class="hide-sm">${t('compare')}${S.compare && S.compareKeys.length ? ' (' + S.compareKeys.length + ')' : ''}</span></button>
    <button class="chip-toggle ${S.chat && S.chat.system ? 'on' : ''}" id="sysBtn" title="${t('systemPromptHint')}">${icon('brain')}<span class="hide-sm">${t('systemPrompt')}</span></button>
    ${hasFolder() ? `<span class="folder-chip" id="folderBtn" title="${t('folder')}">${icon('folder')}<span dir="ltr">${esc(folderName())}</span></span>
      <button class="chip-toggle ${S.agentMode ? 'on' : ''}" id="agentBtn" title="${t('agentModeHint')}">${icon('code')}<span class="hide-sm">${t('agentMode')}</span></button>`
      : `<button class="chip-toggle" id="folderBtn" title="${t('folder')}">${icon('folder')}<span class="hide-sm">${t('chooseFolder')}</span></button>`}
    ${S.chat ? `<button class="btn ghost icon" id="exportChat" title="${t('exportChat')}">${icon('download')}</button>` : ''}`;
  $('#sideToggle').onclick = () => { S.sideOpen = !S.sideOpen; $('#side').classList.toggle('open', S.sideOpen); };
  $('#modelBtn').onclick = e => openModelPicker(e.currentTarget, { onPick: k => { S.selectedKey = k; localStorage.setItem('nova.model', k); renderChatHead(); renderComposer(); } });
  $('#cmpBtn').onclick = e => {
    if (S.compare) { S.compare = false; renderChatHead(); return; }
    S.compare = true; if (!S.compareKeys.length && S.selectedKey) S.compareKeys = [S.selectedKey];
    renderChatHead();
    openModelPicker($('#cmpBtn'), { filter: 'chat', multi: true, selected: S.compareKeys, onPick: keys => { S.compareKeys = keys; const b = $('#cmpBtn span'); if (b) b.textContent = t('compare') + ' (' + keys.length + ')'; } });
  };
  $('#sysBtn').onclick = () => editSystemPrompt();
  $('#folderBtn').onclick = () => hasFolder() ? folderMenu() : pickFolder();
  if ($('#agentBtn')) $('#agentBtn').onclick = () => { S.agentMode = !S.agentMode; renderChatHead(); };
  if ($('#exportChat')) $('#exportChat').onclick = exportChatMd;
}
function editSystemPrompt() {
  const cur = (S.chat && S.chat.system) || S.pendingSystem || '';
  modal({
    title: icon('brain') + t('systemPrompt'), body: `<p class="muted" style="margin-top:0">${t('systemPromptHint')}</p>
    <div class="row" style="flex-wrap:wrap;margin-bottom:10px">${S.prompts.map(p => `<button class="btn sm" data-pid="${p.id}">${esc(p.title)}</button>`).join('')}</div>
    <textarea class="textarea" id="sysTa" rows="8" dir="auto">${esc(cur)}</textarea>`,
    foot: `<button class="btn" data-close2>${t('cancel')}</button><button class="btn primary" id="sysSave">${t('save')}</button>`,
    onMount(el, close) {
      $$('[data-pid]', el).forEach(b => b.onclick = () => { $('#sysTa', el).value = S.prompts.find(p => p.id === b.dataset.pid).text; });
      el.querySelector('[data-close2]').onclick = close;
      $('#sysSave', el).onclick = async () => {
        const v = $('#sysTa', el).value.trim();
        if (S.chat) { S.chat.system = v; await api('/chats/' + S.chat.id, { method: 'PUT', body: { system: v } }); } else S.pendingSystem = v;
        close(); renderChatHead(); toast(t('saved'), 'ok');
      };
    }
  });
}
function exportChatMd() {
  const c = S.chat; if (!c) return;
  let md = `# ${c.title}\n\n`;
  for (const m of c.messages) md += `### ${m.role === 'user' ? 'User' : 'Assistant' + (m.model ? ' (' + m.model.split('::')[1] + ')' : '')}\n\n${m.content || ''}\n\n${(m.images || []).map(u => `![](${location.origin}${u})`).join('\n')}\n\n`;
  downloadText((c.title || 'chat').replace(/[\\/:*?"<>|]/g, '_') + '.md', md);
}
function downloadText(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

function renderMessages() {
  const el = $('#msgs'); if (!el) return;
  const msgs = (S.chat && S.chat.messages) || [];
  if (!msgs.length) {
    const sug = [['sparkles', 's1'], ['code', 's2'], ['globe', 's3'], ['image', 's4']];
    el.innerHTML = `<div class="welcome"><div class="orb">${icon('sparkles')}</div><h2>${t('welcomeTitle')}</h2><p>${t('welcomeSub')}</p>
      <div class="suggest">${sug.map(([ic, k]) => `<button data-s="${k}">${icon(ic)}<span>${t(k)}</span></button>`).join('')}</div></div>`;
    $$('.suggest button', el).forEach(b => b.onclick = () => {
      const ta = $('#input'); ta.value = t(b.dataset.s); autoGrow(ta); ta.focus();
      if (b.dataset.s === 's4') { const im = allModels().find(m => m.caps.image && !m.caps.chat); if (im) { S.selectedKey = im.key; renderChatHead(); renderComposer(); $('#input').value = t('s4'); } }
    });
    return;
  }
  let html = ''; let i = 0;
  while (i < msgs.length) {
    const m = msgs[i];
    if (m.role === 'assistant' && m.group) {
      const g = []; while (i < msgs.length && msgs[i].group === m.group) g.push(msgs[i++]);
      if (g.length > 1) { html += `<div class="compare-row">${g.map(x => `<div class="cmp">${msgHtml(x, true)}</div>`).join('')}</div>`; continue; }
      html += msgHtml(g[0]); continue;
    }
    html += msgHtml(m); i++;
  }
  el.innerHTML = html;
  bindMsgActions(el);
  scrollBottom(true);
}
function msgHtml(m, compact = false) {
  if (m.role === 'user') {
    const imgs = (m.attachments || []).filter(a => a.type === 'image');
    const files = (m.attachments || []).filter(a => a.type === 'text');
    return `<div class="msg user" data-mid="${m.id}"><div class="av">${S.settings.lang === 'fa' ? 'من' : 'You'}</div><div class="body">
      ${imgs.length ? `<div class="att-thumbs">${imgs.map(a => `<img src="${a.dataUrl}" alt="">`).join('')}</div>` : ''}
      ${files.length ? `<div class="att-row">${files.map(a => `<span class="att">${icon('file')}<span>${esc(a.name)}</span></span>`).join('')}</div>` : ''}
      <div class="bubble" dir="auto">${esc(m.content)}</div>
      <div class="msg-actions"><button data-act="copy">${icon('copy')}</button><button data-act="edit">${icon('edit')}</button><button data-act="del">${icon('trash')}</button></div></div></div>`;
  }
  const mm = findModel(m.model);
  const p = mm ? mm.provider : null;
  const live = S.streams.has(m.id);
  let inner = '';
  if (m.reasoning) inner += `<details class="reasoning" ${live && !m.content ? 'open' : ''}><summary>${icon('brain')}${t('reasoning')}${live && !m.content ? '…' : ''}</summary><div class="rbody" dir="auto">${esc(m.reasoning)}</div></details>`;
  if (m.content) inner += `<div class="bubble ${live ? 'cursor' : ''}">${renderMarkdown(m.content)}</div>`;
  if (m.kind === 'image' && m.pending) inner += `<div class="gen-media">${Array.from({ length: m.n || 1 }).map(() => `<div class="gen-placeholder">${t('generatingImage')}</div>`).join('')}</div>`;
  if (m.kind === 'video' && m.pending) inner += `<div class="job"><div class="grow"><div class="muted" style="margin-bottom:6px">${t('generatingVideo')} ${m.progress ? Math.round(m.progress) + '%' : ''}</div><div class="bar"><i style="width:${m.progress || 4}%"></i></div></div></div>`;
  if ((m.images || []).length) inner += `<div class="gen-media">${m.images.map(u => `<a href="${u}" target="_blank"><img src="${u}" loading="lazy" alt=""></a>`).join('')}</div>`;
  if (m.video) inner += `<div class="gen-media"><video src="${m.video}" controls playsinline></video></div>`;
  if (m.error) inner += `<div class="err-box">${esc(m.error)}</div>`;
  if ((m.applied || []).length) inner += `<div class="applied"><span class="dim">${icon('check')} ${t('writtenToFolder')}</span>${m.applied.map(p => `<button class="applied-file" data-act="open-file" data-path="${esc(p)}" dir="ltr">${icon('file')}${esc(p)}</button>`).join('')}</div>`;
  if (live && !m.content && !m.reasoning && !m.pending) inner += `<div class="typing"><i></i><i></i><i></i></div>`;
  const files = extractCodeBlocks(m.content || '').filter(b => b.path);
  return `<div class="msg assistant" data-mid="${m.id}">${compact ? '' : `<div class="av" style="background:${p ? pColor(p) : 'var(--grad)'}">${p ? pInitial(p) : icon('sparkles')}</div>`}<div class="body" style="${compact ? 'max-width:100%' : ''}">
    <div class="msg-meta"><b>${esc(mm ? shortName(mm) : (m.model || '').split('::')[1] || '')}</b>${m.ms ? `<span>${(m.ms / 1000).toFixed(1)}${t('seconds')}</span>` : ''}${m.content ? `<span>~${Math.ceil(m.content.length / 3.6)} ${t('tokensApprox')}</span>` : ''}</div>
    ${inner}
    ${live ? '' : `<div class="msg-actions"><button data-act="copy">${icon('copy')}${t('copy')}</button><button data-act="regen">${icon('refresh')}${t('regenerate')}</button>${files.length ? `<button data-act="apply">${icon('folder')}${t('applyAll')} (${files.length})</button>` : ''}<button data-act="del">${icon('trash')}</button></div>`}
  </div></div>`;
}
function bindMsgActions(root) {
  root.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act; if (!act) return;
    const mel = b.closest('.msg'); const cb = b.closest('.codeblock');
    if (act === 'open-file') { openFile(b.dataset.path); return; }
    if (act === 'run-code') { const code = cb.querySelector('code').textContent.trim(); if (!(S.ws && S.ws.root)) return toast(t('noFolder'), 'bad'); if (S.route !== 'code') go('code'); setTimeout(() => runCmd(code.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).join(' && ')), 50); return; }
    if (act === 'copy-code' || act === 'save-code') {
      const code = cb.querySelector('code').textContent;
      if (act === 'copy-code') { navigator.clipboard.writeText(code); toast(t('copied'), 'ok'); }
      else await saveCodeToFolder(cb.dataset.path, code, cb.dataset.lang);
      return;
    }
    if (!mel || !S.chat) return;
    const idx = S.chat.messages.findIndex(x => x.id === mel.dataset.mid); const m = S.chat.messages[idx]; if (!m) return;
    if (act === 'copy') { navigator.clipboard.writeText(m.content || ''); toast(t('copied'), 'ok'); }
    if (act === 'del') { S.chat.messages.splice(idx, 1); await persistChat(); renderMessages(); }
    if (act === 'edit') { const ta = $('#input'); ta.value = m.content; S.attachments = m.attachments || []; S.chat.messages.splice(idx); await persistChat(); renderMessages(); renderAttachments(); autoGrow(ta); ta.focus(); }
    if (act === 'regen') {
      let u = idx - 1; while (u >= 0 && S.chat.messages[u].role !== 'user') u--;
      if (u < 0) return;
      const userMsg = S.chat.messages[u];
      S.chat.messages.splice(u);
      if (m.model && findModel(m.model)) S.selectedKey = m.model;
      await runTurn(userMsg.content, userMsg.attachments || []);
    }
    if (act === 'apply') { await applyAssistantFiles(m); await persistChat(); renderMessages(); }
  };
}
let scrollPinned = true;
function scrollBottom(force) { const el = $('#messages'); if (!el) return; if (force || scrollPinned) el.scrollTop = el.scrollHeight; }
function updateMsgDom(m) {
  const el = document.querySelector(`.msg[data-mid="${m.id}"]`);
  if (!el) return renderMessages();
  const compact = !!el.closest('.cmp');
  const tmp = document.createElement('div'); tmp.innerHTML = msgHtml(m, compact);
  el.replaceWith(tmp.firstElementChild);
  scrollBottom();
}
function renderComposer() {
  const el = $('#composerWrap'); if (!el) return;
  const m = findModel(S.selectedKey); const mode = modelMode(m);
  const busy = S.streams.size > 0;
  el.innerHTML = `<div class="composer" id="composer">
    <div class="att-row" id="attRow"></div>
    <textarea id="input" rows="1" dir="auto" placeholder="${mode === 'image' ? t('typeImagePrompt') : mode === 'video' ? t('typeVideoPrompt') : t('typeMessage')}"></textarea>
    <div class="tools">
      <button class="btn ghost icon" id="attBtn" title="${t('attach')}">${icon('paperclip')}</button>
      ${hasFolder() ? `<button class="btn ghost icon" id="fromFolderBtn" title="${t('fromFolder')}">${icon('folder')}</button>` : ''}
      <button class="btn ghost icon" id="libBtn" title="${t('prompts')}">${icon('book')}</button>
      <input type="file" id="fileIn" multiple hidden>
      <div class="grow"></div>
      <button class="send-btn ${busy ? 'stop' : ''}" id="sendBtn" title="${busy ? t('stop') : t('send')}">${busy ? icon('stop') : icon('send', 'flip')}</button>
    </div></div>
    <div class="hint-line">${m ? esc(m.provider.name) + ' · ' + esc(m.id) : t('pickModelFirst')}${S.agentMode && hasFolder() ? ' · ' + t('agentMode') + ' ✓' : ''}</div>`;
  const ta = $('#input');
  if (S.draft) { ta.value = S.draft; S.draft = ''; }
  ta.oninput = () => autoGrow(ta);
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSend(); } };
  ta.onpaste = e => { const files = [...(e.clipboardData.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } };
  $('#sendBtn').onclick = () => S.streams.size ? stopAll() : onSend();
  $('#attBtn').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  if ($('#fromFolderBtn')) $('#fromFolderBtn').onclick = pickFilesFromFolder;
  $('#libBtn').onclick = () => promptLibraryPicker(text => { ta.value = (ta.value ? ta.value + '\n' : '') + text; autoGrow(ta); ta.focus(); });
  const comp = $('#composer');
  comp.ondragover = e => { e.preventDefault(); comp.classList.add('drag'); };
  comp.ondragleave = () => comp.classList.remove('drag');
  comp.ondrop = e => { e.preventDefault(); comp.classList.remove('drag'); addFiles([...e.dataTransfer.files]); };
  const msgs = $('#messages'); if (msgs) msgs.onscroll = () => { scrollPinned = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80; };
  renderAttachments(); autoGrow(ta); ta.focus();
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; }
const TEXT_EXT = /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|html|htm|css|scss|less|xml|yml|yaml|toml|ini|env|sh|bash|zsh|sql|csv|tsv|vue|svelte|dart|swift|lua|r|m|log|conf|gradle|dockerfile|gitignore)$/i;
async function addFiles(files) {
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) { toast(t('tooBig') + ': ' + f.name, 'bad'); continue; }
    if (f.type.startsWith('image/')) {
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      S.attachments.push({ type: 'image', name: f.name, dataUrl: await downscale(dataUrl) });
    } else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name) || f.type === 'application/json') {
      S.attachments.push({ type: 'text', name: f.name, text: (await f.text()).slice(0, 400000) });
    } else if (f.type === 'application/pdf') {
      toast('PDF: ' + f.name + ' → text not extracted; attach as image or text', 'bad');
    } else {
      try { S.attachments.push({ type: 'text', name: f.name, text: (await f.text()).slice(0, 200000) }); } catch { toast(f.name, 'bad'); }
    }
  }
  renderAttachments();
}
function downscale(dataUrl, max = 1600) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      if (s === 1 && dataUrl.length < 1.5e6) return res(dataUrl);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .88));
    };
    img.onerror = () => res(dataUrl); img.src = dataUrl;
  });
}
function renderAttachments() {
  const el = $('#attRow'); if (!el) return;
  el.innerHTML = S.attachments.map((a, i) => `<span class="att">${a.type === 'image' ? `<img src="${a.dataUrl}">` : icon('file')}<span>${esc(a.name)}</span><button data-i="${i}">${icon('x')}</button></span>`).join('');
  $$('button', el).forEach(b => b.onclick = () => { S.attachments.splice(+b.dataset.i, 1); renderAttachments(); });
}
function stopAll() { for (const [, c] of S.streams) c.abort(); }
async function persistChat() {
  if (!S.chat) return;
  const msgs = S.chat.messages.map(m => { const c = Object.assign({}, m); delete c.pending; return c; });
  await api('/chats/' + S.chat.id, { method: 'PUT', body: { messages: msgs, title: S.chat.title, model: S.selectedKey, system: S.chat.system } }).catch(() => { });
  const li = S.chats.find(c => c.id === S.chat.id);
  if (li) { li.title = S.chat.title; li.updatedAt = Date.now(); }
}
async function onSend() {
  const ta = $('#input'); const text = ta.value.trim();
  if (!text && !S.attachments.length) return;
  if (!findModel(S.selectedKey)) { toast(t('pickModelFirst'), 'bad'); return; }
  const atts = S.attachments; S.attachments = []; ta.value = ''; autoGrow(ta);
  await runTurn(text, atts);
}
async function ensureChat(firstText) {
  if (S.chat) return;
  const title = (firstText || t('newChat')).replace(/\s+/g, ' ').slice(0, 48);
  S.chat = await api('/chats', { method: 'POST', body: { title: (S.route === 'code' && S.ws && S.ws.root ? '💻 ' : '') + title, model: S.selectedKey, system: S.pendingSystem || '', wsRoot: S.route === 'code' && S.ws && S.ws.root ? S.ws.root : undefined } });
  S.pendingSystem = '';
  S.chats.unshift({ id: S.chat.id, title: S.chat.title, updatedAt: Date.now(), wsRoot: S.chat.wsRoot });
  renderChatList();
}
async function runTurn(text, atts) {
  await ensureChat(text);
  const user = { id: uid(), role: 'user', content: text, attachments: atts, ts: Date.now() };
  S.chat.messages.push(user);
  const base = findModel(S.selectedKey); const mode = modelMode(base);
  if (mode === 'image') return runImageTurn(base, text);
  if (mode === 'video') return runVideoTurn(base, text);
  const keys = S.compare && S.compareKeys.length ? S.compareKeys.filter(k => findModel(k)) : [S.selectedKey];
  const group = uid();
  const outs = keys.map(k => ({ id: uid(), role: 'assistant', content: '', reasoning: '', model: k, group, ts: Date.now() }));
  S.chat.messages.push(...outs);
  renderMessages(); renderComposer();
  const history = buildHistory();
  const system = await buildSystem();
  await Promise.all(outs.map(o => streamInto(o, history, system)));
  renderComposer(); renderMessages();
  if ((S.agentMode || S.route === 'code') && hasFolder()) {
    for (const o of outs) { try { await applyAssistantFiles(o); } catch (e) { toast(e.message, 'bad'); } }
    renderMessages();
  }
  await persistChat();
}
function buildHistory() {
  const out = []; const seen = new Set();
  for (const m of S.chat.messages) {
    if (m.role === 'assistant') {
      if (m.group && seen.has(m.group)) continue; if (m.group) seen.add(m.group);
      if (m.error && !m.content) continue;
      if (!m.content && !(m.images || []).length) continue;
      out.push({ role: 'assistant', content: m.content || '[image generated]' });
    } else out.push({ role: 'user', content: m.content, attachments: m.attachments || [] });
  }
  // drop the trailing empty assistant placeholders
  while (out.length && out[out.length - 1].role === 'assistant' && !out[out.length - 1].content) out.pop();
  return out;
}
async function buildSystem() {
  let s = (S.chat && S.chat.system) || S.settings.systemPrompt || '';
  if ((S.agentMode || S.route === 'code') && hasFolder()) s += '\n\n' + AGENT_RULES + '\n\n' + await workspaceContext();
  return s.trim();
}
async function streamInto(o, history, system) {
  const mm = findModel(o.model);
  const ctrl = new AbortController(); S.streams.set(o.id, ctrl);
  let pending = false;
  const flush = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; updateMsgDom(o); }); };
  try {
    const r = await fetch('/api/chat/stream', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ providerId: mm.provider.id, modelId: mm.id, messages: history, system, temperature: S.settings.temperature, wantsImage: !!mm.caps.image }) });
    if (!r.ok) { let e = 'HTTP ' + r.status; try { e = (await r.json()).error; } catch { } throw new Error(e); }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.delta) o.content += ev.delta;
        if (ev.reasoning) o.reasoning += ev.reasoning;
        if (ev.image) (o.images = o.images || []).push(ev.image);
        if (ev.error) o.error = ev.error;
        if (ev.done) o.ms = ev.ms;
        flush();
      }
    }
  } catch (e) { if (e.name !== 'AbortError') o.error = e.message; }
  S.streams.delete(o.id);
  if (!o.reasoning) delete o.reasoning;
  updateMsgDom(o);
}
async function runImageTurn(m, prompt) {
  const o = { id: uid(), role: 'assistant', content: '', model: m.key, kind: 'image', pending: true, n: 1, ts: Date.now() };
  S.chat.messages.push(o); renderMessages();
  const t0 = Date.now(); const ctrl = new AbortController(); S.streams.set(o.id, ctrl); renderComposer();
  try { const r = await api('/image', { method: 'POST', body: { providerId: m.provider.id, modelId: m.id, prompt, n: 1, size: '1024x1024' }, signal: ctrl.signal }); o.images = r.items.map(x => x.url); }
  catch (e) { if (e.name !== 'AbortError') o.error = e.message; }
  o.pending = false; o.ms = Date.now() - t0; S.streams.delete(o.id);
  renderMessages(); renderComposer(); await persistChat();
}
async function runVideoTurn(m, prompt) {
  const o = { id: uid(), role: 'assistant', content: '', model: m.key, kind: 'video', pending: true, progress: 2, ts: Date.now() };
  S.chat.messages.push(o); renderMessages();
  const t0 = Date.now(); S.streams.set(o.id, new AbortController()); renderComposer();
  try {
    const job = await api('/video', { method: 'POST', body: { providerId: m.provider.id, modelId: m.id, prompt } });
    while (true) {
      await new Promise(r => setTimeout(r, 4000));
      if (!S.streams.has(o.id)) break;
      const j = await api('/video/' + job.id);
      o.progress = j.progress; updateMsgDom(o);
      if (j.status === 'completed') { o.video = j.result.url; break; }
      if (j.status === 'failed') { o.error = j.error; break; }
    }
  } catch (e) { o.error = e.message; }
  o.pending = false; o.ms = Date.now() - t0; S.streams.delete(o.id);
  renderMessages(); renderComposer(); await persistChat();
}
function promptLibraryPicker(onUse) {
  modal({
    title: icon('book') + t('prompts'),
    body: S.prompts.length ? S.prompts.map(p => `<div class="card" style="margin-bottom:10px;padding:14px"><div class="row"><b class="grow" dir="auto">${esc(p.title)}</b><button class="btn sm primary" data-use="${p.id}">${t('usePrompt')}</button></div><p class="muted" dir="auto" style="margin:8px 0 0;font-size:13px;line-height:1.7">${esc(p.text.slice(0, 220))}</p></div>`).join('') : `<div class="empty">${t('noChats')}</div>`,
    onMount(el, close) { $$('[data-use]', el).forEach(b => b.onclick = () => { onUse(S.prompts.find(p => p.id === b.dataset.use).text); close(); }); }
  });
}

// ------------------------------------------------------------ workspace folder (File System Access API)
const IGNORE = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'venv', '__pycache__', '.idea', '.vscode', '.DS_Store']);
async function pickFolder() {
  if (S.fsEnabled || window.novaDesktop) return openFolderDialog();
  if (!window.showDirectoryPicker) { toast(t('folderNotSupported'), 'bad'); return; }
  try { S.dir = await window.showDirectoryPicker({ mode: 'readwrite' }); S.agentMode = true; toast(t('folder') + ': ' + S.dir.name, 'ok'); renderChatHead(); renderComposer(); } catch { }
}
function folderMenu() {
  modal({
    title: icon('folder') + esc(folderName()), body: `<div class="set-row"><div><b>${t('agentMode')}</b><small>${t('agentModeHint')}</small></div><label class="switch"><input type="checkbox" id="amSw" ${S.agentMode ? 'checked' : ''}><i></i></label></div>`,
    foot: `<button class="btn" id="fmChange">${icon('folder')}${t('chooseFolder')}</button><button class="btn" id="fmFiles">${icon('file')}${t('fromFolder')}</button><button class="btn danger" id="fmClose">${icon('x')}${t('remove')}</button>`,
    onMount(el, close) {
      $('#amSw', el).onchange = e => { S.agentMode = e.target.checked; renderChatHead(); renderComposer(); };
      $('#fmChange', el).onclick = () => { close(); pickFolder(); };
      if (S.ws && S.ws.root) $('#fmFiles', el).insertAdjacentHTML('beforebegin', `<button class="btn" id="fmCode">${icon('code')}${t('nav_code')}</button>`), $('#fmCode', el).onclick = () => { close(); go('code'); };
      $('#fmFiles', el).onclick = () => { close(); pickFilesFromFolder(); };
      $('#fmClose', el).onclick = async () => { S.dir = null; S.agentMode = false; close(); if (S.ws && S.ws.root) await closeWorkspace(); else { renderChatHead(); renderComposer(); } };
    }
  });
}
async function listFolder(dir, prefix, out, depth) {
  if (depth > 6 || out.length > 1500) return out;
  for await (const [name, h] of dir.entries()) {
    if (IGNORE.has(name)) continue;
    const p = prefix ? prefix + '/' + name : name;
    if (h.kind === 'directory') await listFolder(h, p, out, depth + 1); else out.push({ path: p, handle: h });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
async function pickFilesFromFolder() {
  if (!hasFolder()) return pickFolder();
  const files = (S.ws && S.ws.root) ? flatFiles(S.ws.tree).map(p => ({ path: p, server: true })) : await listFolder(S.dir, '', [], 0);
  modal({
    title: icon('folder') + t('selectFiles'), wide: true,
    body: `<input class="input" id="ffq" placeholder="${t('searchModels').replace('مدل', 'فایل')}" style="margin-bottom:10px"><div class="file-tree" id="ft">${files.map((f, i) => `<label data-p="${esc(f.path.toLowerCase())}"><input type="checkbox" data-i="${i}">${esc(f.path)}</label>`).join('')}</div>`,
    foot: `<button class="btn primary" id="ffAdd">${icon('paperclip')}${t('attachSelected')}</button>`,
    onMount(el, close) {
      $('#ffq', el).oninput = e => { const q = e.target.value.toLowerCase(); $$('#ft label', el).forEach(l => l.style.display = l.dataset.p.includes(q) ? '' : 'none'); };
      $('#ffAdd', el).onclick = async () => {
        const sel = $$('#ft input:checked', el).map(c => files[+c.dataset.i]);
        for (const f of sel) { if (f.server) { const r = await api('/ws/file?path=' + encodeURIComponent(f.path)).catch(() => null); if (r && !r.binary) S.attachments.push({ type: 'text', name: f.path, text: r.content }); continue; } const file = await f.handle.getFile(); if (file.type.startsWith('image/')) await addFiles([new File([file], f.path, { type: file.type })]); else S.attachments.push({ type: 'text', name: f.path, text: (await file.text()).slice(0, 400000) }); }
        renderAttachments(); close();
      };
    }
  });
}
async function writeToDir(relPath, content) {
  const parts = relPath.replace(/^\.?\/+/, '').split('/').filter(x => x && x !== '..');
  let dir = S.dir;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable(); await w.write(content); await w.close();
}
const EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh', java: 'java', go: 'go', rust: 'rs', php: 'php', sql: 'sql', yaml: 'yml', yml: 'yml', markdown: 'md', md: 'md', tsx: 'tsx', jsx: 'jsx', c: 'c', cpp: 'cpp', csharp: 'cs', kotlin: 'kt', swift: 'swift', dart: 'dart' };
async function saveCodeToFolder(path, code, lang) {
  let p = path;
  if (!p) { p = await promptBox(t('fileName'), 'file.' + (EXT[(lang || '').toLowerCase()] || 'txt'), true); if (!p) return; }
  if (S.ws && S.ws.root) { try { await wsApply([{ path: p, code }]); if (S.route === 'code') { drawTree(); openFile(p); } } catch (e) { toast(e.message, 'bad'); } return; }
  if (!S.dir) {
    if (S.fsEnabled || window.showDirectoryPicker) { await pickFolder(); if (!hasFolder()) return; if (S.ws && S.ws.root) return saveCodeToFolder(p, code, lang); }
    else { downloadText(p.split('/').pop(), code); return; }
  }
  try { await writeToDir(p, code); toast(t('fileSaved', { f: p }), 'ok'); } catch (e) { toast(e.message, 'bad'); }
}
async function writeFilesToFolder(files) {
  if (S.ws && S.ws.root) { const ps = await wsApply(files); if (S.route === 'code') drawTree(); return ps; }
  if (!S.dir) { if (window.showDirectoryPicker) { await pickFolder(); if (!S.dir) return; } else { files.forEach(f => downloadText(f.path.split('/').pop(), f.code)); return; } }
  let n = 0; for (const f of files) { try { await writeToDir(f.path, f.code); n++; } catch (e) { toast(f.path + ': ' + e.message, 'bad'); } }
  if (n) toast(t('filesSaved', { n }), 'ok');
}

// ------------------------------------------------------------ PROVIDERS
function renderProviders() {
  const cards = S.providers.map(p => {
    const ms = p.models || [];
    const cnt = k => ms.filter(m => m.caps && m.caps[k]).length;
    return `<div class="card pcard">
      <div class="ptop"><div class="plogo" style="background:${pColor(p)}">${pInitial(p)}</div>
        <div class="grow"><div class="row"><h3 dir="auto">${esc(p.name)}</h3>${p.builtin ? `<span class="badge grad">${t('builtin')}</span>` : ''}</div><div class="url">${esc(p.baseUrl)}</div></div>
        <label class="switch" title="${p.enabled ? t('enabled') : t('disabled')}"><input type="checkbox" data-toggle="${p.id}" ${p.enabled ? 'checked' : ''}><i></i></label></div>
      <div class="row" style="gap:6px;font-size:12px"><span class="status-dot ${!p.enabled ? 'off' : (p.hasKey || presetOf(p).noKey) ? '' : 'warn'}"></span><span class="muted" dir="ltr">${p.hasKey ? esc(p.apiKey) : presetOf(p).noKey ? t('noKeyNeeded') : '—'}</span><span class="grow"></span><span class="dim">${p.fetchedAt ? t('lastFetch') + ': ' + new Date(p.fetchedAt).toLocaleDateString(S.settings.lang === 'fa' ? 'fa-IR' : 'en-US') : ''}</span></div>
      <div class="stats"><div class="stat"><b>${ms.length}</b><small>${t('models')}</small></div><div class="stat"><b style="color:var(--c-vision)">${cnt('vision')}</b><small>${t('cap_vision')}</small></div><div class="stat"><b style="color:var(--c-image)">${cnt('image')}</b><small>${t('cap_image')}</small></div><div class="stat"><b style="color:var(--c-video)">${cnt('video')}</b><small>${t('cap_video')}</small></div></div>
      <div class="acts"><button class="btn sm primary" data-fetch="${p.id}">${icon('refresh')}${t('fetchModels')}</button><button class="btn sm" data-models="${p.id}">${icon('cube')}${t('manageModels')}</button><button class="btn sm icon" data-test="${p.id}" title="${t('testConn')}">${icon('activity')}</button><button class="btn sm icon" data-edit="${p.id}" title="${t('edit')}">${icon('edit')}</button>${p.builtin ? '' : `<button class="btn sm icon danger" data-del="${p.id}" title="${t('delete')}">${icon('trash')}</button>`}</div></div>`;
  }).join('');
  $('#main').innerHTML = `<div class="page">${pageHead(t('providers'), t('providersSub'), `<button class="btn" id="addCustom">${icon('code')}${t('customProvider')}</button><button class="btn primary" id="addProv">${icon('plus')}${t('addProvider')}</button>`)}
    <div class="grid">${cards}<button class="card add-card" id="addProv2"><div><div class="big">${icon('plus')}</div><b>${t('addProvider')}</b><div class="dim" style="font-size:12px;margin-top:4px">OpenAI · Claude · Gemini · Kimi · DeepSeek · Grok · OpenRouter …</div></div></button></div></div>`;
  $('#addProv').onclick = $('#addProv2').onclick = () => addProviderFlow();
  $('#addCustom').onclick = () => providerForm(S.presets.find(p => p.id === 'custom'));
  $$('[data-toggle]').forEach(c => c.onchange = async () => { await api('/providers/' + c.dataset.toggle, { method: 'PUT', body: { enabled: c.checked } }); await loadState(); renderProviders(); });
  $$('[data-fetch]').forEach(b => b.onclick = () => fetchModelsFor(b.dataset.fetch, b));
  $$('[data-models]').forEach(b => b.onclick = () => modelsManager(b.dataset.models));
  $$('[data-edit]').forEach(b => b.onclick = () => { const p = S.providers.find(x => x.id === b.dataset.edit); providerForm(presetOf(p), p); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!(await confirmBox(t('deleteProviderQ')))) return; await api('/providers/' + b.dataset.del, { method: 'DELETE' }); await loadState(); renderProviders(); toast(t('deleted')); });
  $$('[data-test]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await api('/providers/' + b.dataset.test + '/test', { method: 'POST' }).catch(e => ({ ok: false, error: e.message })); b.disabled = false; r.ok ? toast(t('connOk', { ms: r.ms, n: r.count }), 'ok') : toast(t('connFail') + ': ' + r.error, 'bad'); });
}
async function fetchModelsFor(id, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = icon('refresh') + '…'; }
  try {
    const r = await api('/providers/' + id + '/fetch-models', { method: 'POST' });
    const f = r.fetched; toast(t('modelsFetched', { n: f.total, i: f.image, v: f.video, s: f.vision }), 'ok');
  } catch (e) { toast(t('error') + ': ' + e.message, 'bad'); }
  await loadState(); if (S.route === 'providers') renderProviders();
}
function addProviderFlow() {
  const draw = (el, q = '') => {
    const ql = q.toLowerCase();
    $('#pg', el).innerHTML = S.presets.filter(p => !ql || (p.name + p.desc).toLowerCase().includes(ql)).map(p => `<button class="preset" data-p="${p.id}"><div class="plogo" style="background:${p.color}">${p.name.slice(0, 1)}</div><div class="grow"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></div></button>`).join('');
    $$('[data-p]', el).forEach(b => b.onclick = () => { el.remove(); providerForm(S.presets.find(p => p.id === b.dataset.p)); });
  };
  modal({ title: icon('plug') + t('choosePreset'), wide: true, body: `<input class="input" id="pq" placeholder="${t('searchModels')}" style="margin-bottom:14px"><div class="preset-grid" id="pg"></div>`, onMount(el) { draw(el); $('#pq', el).oninput = e => draw(el, e.target.value); $('#pq', el).focus(); } });
}
function providerForm(preset, existing) {
  const p = existing || {};
  const isCustom = preset.custom || (existing && presetOf(existing).custom);
  modal({
    title: `<span class="plogo" style="width:32px;height:32px;font-size:13px;border-radius:10px;background:${preset.color}">${(p.name || preset.name).slice(0, 1)}</span>${esc(existing ? p.name : preset.name)}`,
    body: `
      ${preset.keyUrl ? `<a class="btn sm" href="${preset.keyUrl}" target="_blank" rel="noopener" style="margin-bottom:16px">${icon('key')}${t('getKey')} ${icon('external')}</a>` : ''}
      <label class="field"><span>${t('name')}</span><input class="input" id="fName" value="${esc(p.name || preset.name)}"></label>
      <label class="field"><span>${t('apiKey')}</span><div class="row"><input class="input ltr" id="fKey" type="password" autocomplete="off" placeholder="${preset.noKey ? t('noKeyNeeded') : 'sk-...'}" value="${esc(p.apiKey || '')}"><button class="btn icon" id="fEye" type="button">${icon('eye')}</button></div></label>
      <label class="field"><span>${t('baseUrl')}</span><input class="input ltr" id="fUrl" value="${esc(p.baseUrl || preset.baseUrl)}" placeholder="https://api.example.com/v1"></label>
      ${isCustom ? `<label class="field"><span>${t('apiType')}</span><select class="select" id="fType"><option value="openai">OpenAI-compatible (/chat/completions)</option><option value="anthropic">Anthropic (/messages)</option><option value="gemini">Google Gemini</option></select></label>
      <label class="field"><span>${t('headers')}</span><textarea class="textarea ltr" id="fHead" rows="3" placeholder='{"X-Custom": "value"}'>${p.headers && Object.keys(p.headers).length ? esc(JSON.stringify(p.headers, null, 2)) : ''}</textarea></label>` : ''}`,
    foot: `<button class="btn" data-c>${t('cancel')}</button><button class="btn primary" id="fSave">${icon('check')}${existing ? t('save') : t('add') + ' + ' + t('fetchModels')}</button>`,
    onMount(el, close) {
      if ($('#fType', el)) $('#fType', el).value = p.type || 'openai';
      el.querySelector('[data-c]').onclick = close;
      $('#fEye', el).onclick = () => { const i = $('#fKey', el); i.type = i.type === 'password' ? 'text' : 'password'; };
      $('#fSave', el).onclick = async () => {
        const btn = $('#fSave', el); btn.disabled = true; btn.textContent = '…';
        let headers = {};
        if ($('#fHead', el) && $('#fHead', el).value.trim()) { try { headers = JSON.parse($('#fHead', el).value); } catch { toast('Headers JSON ✗', 'bad'); btn.disabled = false; return; } }
        const body = { preset: preset.id, name: $('#fName', el).value.trim(), apiKey: $('#fKey', el).value.trim(), baseUrl: $('#fUrl', el).value.trim(), headers };
        if ($('#fType', el)) body.type = $('#fType', el).value;
        try {
          if (existing) { await api('/providers/' + existing.id, { method: 'PUT', body }); toast(t('saved'), 'ok'); }
          else {
            const r = await api('/providers', { method: 'POST', body });
            if (r.fetched) toast(t('modelsFetched', { n: r.fetched.total, i: r.fetched.image, v: r.fetched.video, s: r.fetched.vision }), 'ok');
            else if (r.error) toast(t('connFail') + ': ' + r.error, 'bad'); else toast(t('saved'), 'ok');
          }
          close(); await loadState(); if (S.route === 'providers') renderProviders(); else renderRoute();
        } catch (e) { toast(e.message, 'bad'); btn.disabled = false; btn.textContent = t('save'); }
      };
    }
  });
}
function modelsManager(pid) {
  const st = { q: '', cap: 'all' };
  const prov = () => S.providers.find(x => x.id === pid);
  const m0 = modal({
    title: `<span class="plogo" style="width:32px;height:32px;font-size:13px;border-radius:10px;background:${pColor(prov())}">${pInitial(prov())}</span>${esc(prov().name)} — ${t('manageModels')}`, wide: true,
    body: `<div class="row" style="flex-wrap:wrap;margin-bottom:12px"><input class="input grow" id="mq" placeholder="${t('searchModels')}" style="min-width:180px;flex:1">
        <div class="filters" id="mf">${['all', 'chat', 'vision', 'image', 'video'].map(c => `<button data-cap="${c}">${c === 'all' ? t('all') : t('cap_' + c)}</button>`).join('')}</div></div>
      <div class="row" style="flex-wrap:wrap;margin-bottom:14px"><button class="btn sm" id="mFetch">${icon('refresh')}${t('fetchModels')}</button><button class="btn sm" id="mRedetect">${icon('eyeScan')}${t('redetect')}</button><button class="btn sm" id="mAllOn">${t('enableAll')}</button><button class="btn sm" id="mAllOff">${t('disableAll')}</button></div>
      <div class="card" style="padding:14px;margin-bottom:14px;background:var(--panel-2)"><b style="display:block;margin-bottom:10px">${icon('plus')} ${t('addModelManual')}</b>
        <div class="row" style="flex-wrap:wrap"><input class="input ltr" id="newId" placeholder="${t('modelId')}  e.g. gpt-4o, kimi-k2, veo-3" style="flex:1;min-width:200px">
        ${['chat', 'vision', 'image', 'video'].map(c => `<label class="row" style="gap:4px;font-size:12.5px"><input type="checkbox" data-nc="${c}" ${c === 'chat' ? 'checked' : ''}>${t('cap_' + c)}</label>`).join('')}
        <button class="btn sm" id="autoCaps" title="auto">${icon('sparkles')}</button><button class="btn sm primary" id="addM">${t('add')}</button></div></div>
      <div style="max-height:48vh;overflow:auto;border:1px solid var(--line);border-radius:12px"><table class="mtable"><thead><tr><th></th><th>${t('enabled')}</th><th>${t('modelId')}</th><th>${t('caps')}</th><th></th></tr></thead><tbody id="mt"></tbody></table></div>`,
    onMount(el) {
      const draw = () => {
        $$('#mf button', el).forEach(b => b.classList.toggle('on', b.dataset.cap === st.cap));
        const p = prov(); const q = st.q.toLowerCase();
        const list = (p.models || []).filter(m => (st.cap === 'all' || m.caps[st.cap]) && (!q || (m.id + m.name).toLowerCase().includes(q)));
        $('#mt', el).innerHTML = list.slice(0, 800).map(m => `<tr data-id="${esc(m.id)}">
          <td><button class="iconbtn ${m.favorite ? 'on' : ''}" data-a="fav" title="${t('favorite')}">${icon('star')}</button></td>
          <td><label class="switch"><input type="checkbox" data-a="en" ${m.enabled !== false ? 'checked' : ''}><i></i></label></td>
          <td><div class="mname" title="${esc(m.id)}">${esc(m.id)}</div>${m.manual ? '<span class="badge">manual</span>' : ''}${m.free ? ` <span class="cap free">${t('cap_free')}</span>` : ''}${p.defaultModel === m.id ? ` <span class="badge grad">${t('defaultModel')}</span>` : ''}</td>
          <td><span class="caps">${['chat', 'vision', 'image', 'video'].map(c => `<button class="cap ${c} ${m.caps[c] ? '' : 'off'}" data-a="cap" data-c="${c}">${t('cap_' + c)}</button>`).join('')}</span></td>
          <td style="white-space:nowrap"><button class="iconbtn" data-a="chat" title="${t('useInChat')}">${icon('chat')}</button><button class="iconbtn" data-a="probe" title="${t('probe')}: ${t('probeHint')}">${icon('zap')}</button><button class="iconbtn" data-a="def" title="${t('setDefault')}">${icon('pin')}</button><button class="iconbtn" data-a="del" title="${t('delete')}">${icon('trash')}</button></td></tr>`).join('') || `<tr><td colspan="5"><div class="empty">${t('noModels')}</div></td></tr>`;
      };
      const upd = async body => { await api('/providers/' + pid + '/models', { method: 'POST', body }); await loadState(); draw(); };
      $('#mt', el).onclick = async e => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('tr').dataset.id; const m = prov().models.find(x => x.id === id);
        const a = b.dataset.a;
        if (a === 'fav') upd({ action: 'update', id, favorite: !m.favorite });
        if (a === 'cap') upd({ action: 'update', id, caps: { [b.dataset.c]: !m.caps[b.dataset.c] } });
        if (a === 'del') upd({ action: 'delete', id });
        if (a === 'def') { await api('/providers/' + pid, { method: 'PUT', body: { defaultModel: id } }); await saveSettings({ defaultModel: pid + '::' + id }); await loadState(); draw(); toast(t('saved'), 'ok'); }
        if (a === 'chat') { S.selectedKey = pid + '::' + id; localStorage.setItem('nova.model', S.selectedKey); m0.close(); go(modelMode(findModel(S.selectedKey)) === 'chat' ? 'chat' : 'chat'); }
        if (a === 'probe') {
          b.innerHTML = '…';
          const r = await api('/probe', { method: 'POST', body: { providerId: pid, modelId: id, image: !!m.caps.image } }).catch(e => ({ chatError: e.message }));
          toast(`${id}: ${t('cap_chat')} ${r.chat ? '✓' : '✗'}${r.image !== null && r.image !== undefined ? ' · ' + t('cap_image') + ' ' + (r.image ? '✓' : '✗') : ''}`, r.chat || r.image ? 'ok' : 'bad');
          await loadState(); draw();
        }
      };
      $('#mt', el).onchange = e => { if (e.target.dataset.a === 'en') upd({ action: 'update', id: e.target.closest('tr').dataset.id, enabled: e.target.checked }); };
      $('#mq', el).oninput = e => { st.q = e.target.value; draw(); };
      $$('#mf button', el).forEach(b => b.onclick = () => { st.cap = b.dataset.cap; draw(); });
      $('#mFetch', el).onclick = async () => { await fetchModelsFor(pid, $('#mFetch', el)); $('#mFetch', el).disabled = false; $('#mFetch', el).innerHTML = icon('refresh') + t('fetchModels'); draw(); };
      $('#mRedetect', el).onclick = () => upd({ action: 'redetect' });
      $('#mAllOn', el).onclick = () => upd({ action: 'bulk', enabled: true });
      $('#mAllOff', el).onclick = () => upd({ action: 'bulk', enabled: false });
      $('#autoCaps', el).onclick = () => {
        const id = $('#newId', el).value.toLowerCase();
        const img = /(dall-?e|gpt-image|imagen|flux|diffusion|sdxl|sd3|seedream|cogview|kolors|ideogram|recraft|image)/.test(id), vid = /(sora|veo|kling|wan|hailuo|seedance|runway|luma|video|cogvideo)/.test(id);
        const vis = /(vision|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|vl|pixtral|llava)/.test(id);
        $$('[data-nc]', el).forEach(c => { c.checked = { chat: !img && !vid, vision: vis, image: img, video: vid }[c.dataset.nc]; });
      };
      $('#addM', el).onclick = async () => {
        const id = $('#newId', el).value.trim(); if (!id) return;
        const caps = {}; $$('[data-nc]', el).forEach(c => caps[c.dataset.nc] = c.checked);
        await upd({ action: 'add', id, caps }); $('#newId', el).value = ''; toast(t('saved'), 'ok');
      };
      draw();
    }
  });
}

// ------------------------------------------------------------ MODELS (all)
function renderModels() {
  const f = S.modelsFilter;
  $('#main').innerHTML = `<div class="page">${pageHead(t('allModels'), t('modelsSub'))}
    <div class="row" style="flex-wrap:wrap;margin-bottom:16px"><input class="input" id="amq" placeholder="${t('searchModels')}" value="${esc(f.q)}" style="max-width:360px">
    <div class="filters" id="amf">${['all', 'chat', 'vision', 'image', 'video', 'free'].map(c => `<button data-cap="${c}">${c === 'all' ? t('all') : t('cap_' + c)}</button>`).join('')}</div><span class="dim" id="amc"></span></div>
    <div class="card" style="padding:0;overflow:hidden"><div style="max-height:calc(100vh - 240px);overflow:auto"><table class="mtable"><thead><tr><th></th><th>${t('modelId')}</th><th>${t('providers')}</th><th>${t('caps')}</th><th></th></tr></thead><tbody id="amt"></tbody></table></div></div></div>`;
  const draw = () => {
    $$('#amf button').forEach(b => b.classList.toggle('on', b.dataset.cap === f.cap));
    const q = f.q.toLowerCase();
    const list = allModels().filter(m => (f.cap === 'all' || (f.cap === 'free' ? (m.free || m.provider.type === 'pollinations') : m.caps[f.cap])) && (!q || (m.id + m.name + m.provider.name).toLowerCase().includes(q)));
    $('#amc').textContent = list.length + ' ' + t('models');
    $('#amt').innerHTML = list.slice(0, 1000).map(m => `<tr data-key="${esc(m.key)}"><td><span class="plogo" style="width:28px;height:28px;font-size:12px;border-radius:8px;background:${pColor(m.provider)}">${pInitial(m.provider)}</span></td>
      <td><div class="mname">${esc(m.id)}</div>${m.name && m.name !== m.id ? `<div class="dim" style="font-size:11.5px;direction:ltr;text-align:left">${esc(m.name)}</div>` : ''}</td><td class="muted">${esc(m.provider.name)}</td><td>${capChips(m.caps, m.free)}</td>
      <td style="white-space:nowrap">${m.caps.chat ? `<button class="btn sm" data-a="chat">${icon('chat')}${t('useInChat')}</button>` : ''} ${m.caps.image || m.caps.video ? `<button class="btn sm" data-a="studio">${icon('wand')}${t('nav_studio')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5"><div class="empty">${icon('cube')}<div>${t('noModels')}</div></div></td></tr>`;
  };
  $('#amq').oninput = e => { f.q = e.target.value; draw(); };
  $$('#amf button').forEach(b => b.onclick = () => { f.cap = b.dataset.cap; draw(); });
  $('#amt').onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const key = b.closest('tr').dataset.key; const m = findModel(key);
    if (b.dataset.a === 'chat') { S.selectedKey = key; localStorage.setItem('nova.model', key); go('chat'); }
    else { const tab = m.caps.video && !m.caps.image ? 'video' : 'image'; S.studioTab = tab; S.studioKey[tab] = key; go('studio'); }
  };
  draw();
}

// ------------------------------------------------------------ FREE
async function renderFree() {
  $('#main').innerHTML = `<div class="page">${pageHead(t('freeTitle'), t('freeSub'), `<button class="btn" id="frRefresh">${icon('refresh')}</button>`)}<div id="freeBody"><div class="grid">${Array.from({ length: 6 }).map(() => '<div class="gen-placeholder" style="aspect-ratio:auto;height:150px"></div>').join('')}</div></div></div>`;
  $('#frRefresh').onclick = () => { S.free = null; renderFree(); };
  try { if (!S.free) S.free = await api('/free-models'); } catch (e) { $('#freeBody').innerHTML = `<div class="err-box">${esc(e.message)}</div>`; return; }
  const F = S.free;
  const orProv = S.providers.find(p => p.preset === 'openrouter' && p.hasKey);
  const card = (m, src) => `<div class="card free-card"><div class="row"><span class="plogo" style="width:34px;height:34px;font-size:13px;border-radius:10px;background:${src === 'pollinations' ? '#0ea5e9' : '#6467f2'}">${src === 'pollinations' ? 'P' : 'O'}</span><div class="grow"><b dir="auto" style="display:block;font-size:14px">${esc(m.name)}</b><div class="mname">${esc(m.id)}</div></div></div>
    ${capChips(m.caps, true)}${m.description ? `<p>${esc(m.description)}</p>` : '<p></p>'}
    <div class="row"><span class="badge">${src === 'pollinations' ? t('noKeyNeeded') : (orProv ? 'OpenRouter ✓' : 'OpenRouter 🔑')}</span><span class="grow"></span>${m.context ? `<span class="dim" style="font-size:11px">${Math.round(m.context / 1000)}K ctx</span>` : ''}<button class="btn sm primary" data-use="${esc(m.id)}" data-src="${src}">${icon('zap')}${t('useNow')}</button></div></div>`;
  $('#freeBody').innerHTML = `
    <div class="section-title">${icon('sparkles')} Pollinations — ${t('noKeyNeeded')}</div><div class="grid">${F.pollinations.map(m => card(m, 'pollinations')).join('')}</div>
    <div class="section-title">${icon('gift')} OpenRouter Free (${F.openrouter.length}) ${orProv ? '' : `<button class="btn sm" id="addOR">${icon('key')}${t('addKey')}</button>`}</div><div class="grid">${F.openrouter.filter(m => m.caps.chat || m.caps.image).map(m => card(m, 'openrouter')).join('')}</div>
    <div class="section-title">${icon('plug')} ${t('freeTierProviders')}</div><div class="preset-grid">${F.freeTier.map(x => { const pr = S.presets.find(p => p.id === x.preset) || {}; return `<button class="preset" data-fp="${x.preset}"><div class="plogo" style="background:${pr.color}">${x.name.slice(0, 1)}</div><div class="grow"><b>${esc(x.name)}</b><small>${esc(x.note)}</small></div></button>`; }).join('')}</div>`;
  if ($('#addOR')) $('#addOR').onclick = () => providerForm(S.presets.find(p => p.id === 'openrouter'));
  $$('[data-fp]').forEach(b => b.onclick = () => providerForm(S.presets.find(p => p.id === b.dataset.fp)));
  $$('[data-use]').forEach(b => b.onclick = async () => {
    const id = b.dataset.use, src = b.dataset.src;
    const m = (src === 'pollinations' ? F.pollinations : F.openrouter).find(x => x.id === id);
    let prov = src === 'pollinations' ? S.providers.find(p => p.type === 'pollinations') : S.providers.find(p => p.preset === 'openrouter' && p.hasKey);
    if (!prov) { toast(t('needsFreeKey')); providerForm(S.presets.find(p => p.id === 'openrouter')); return; }
    if (!prov.models.find(x => x.id === id)) await api('/providers/' + prov.id + '/models', { method: 'POST', body: { action: 'add', id, caps: m.caps, free: true } });
    if (!prov.enabled) await api('/providers/' + prov.id, { method: 'PUT', body: { enabled: true } });
    await loadState();
    const key = prov.id + '::' + id;
    if (m.caps.chat) { S.selectedKey = key; localStorage.setItem('nova.model', key); go('chat'); }
    else { S.studioTab = 'image'; S.studioKey.image = key; go('studio'); }
  });
}

// ------------------------------------------------------------ STUDIO
function renderStudio() {
  const tab = S.studioTab;
  const models = allModels().filter(m => m.caps[tab]);
  if (!S.studioKey[tab] || !findModel(S.studioKey[tab])) S.studioKey[tab] = (models[0] || {}).key || null;
  const m = findModel(S.studioKey[tab]);
  $('#main').innerHTML = `<div class="page">${pageHead(t('studio'), t('studioSub'), `<div class="seg"><button data-tab="image" class="${tab === 'image' ? 'active' : ''}">${icon('image')}${t('imageTab')}</button><button data-tab="video" class="${tab === 'video' ? 'active' : ''}">${icon('video')}${t('videoTab')}</button></div>`)}
    <div class="studio"><div class="card sticky">
      ${models.length ? '' : `<div class="err-box" style="direction:inherit;text-align:start;margin-bottom:14px;color:var(--text-2);border-color:var(--line-2);background:var(--panel-2)">${tab === 'image' ? t('noImageModels') : t('noVideoModels')}</div>`}
      <label class="field"><span>${t('selectModel')}</span><button class="model-btn" id="stModel" style="width:100%;max-width:none">${m ? `<span class="pdot" style="background:${pColor(m.provider)}">${pInitial(m.provider)}</span><span class="mn grow"><b>${esc(shortName(m))}</b><small>${esc(m.provider.name)}</small></span>` : `<span class="mn grow"><b>${t('selectModel')}</b></span>`}${icon('chevron')}</button></label>
      <label class="field"><span>${t('prompt')}</span><textarea class="textarea" id="stPrompt" rows="6" dir="auto" placeholder="${tab === 'image' ? t('typeImagePrompt') : t('typeVideoPrompt')}">${esc(S.studioPrompt || '')}</textarea></label>
      <button class="btn sm" id="stEnhance" style="margin:-4px 0 14px">${icon('sparkles')}${t('enhance')}</button>
      ${tab === 'image' ? `<div class="row"><label class="field grow"><span>${t('size')}</span><select class="select ltr" id="stSize">${['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792', '768x768', '512x512'].map(s => `<option>${s}</option>`).join('')}</select></label>
        <label class="field" style="width:100px"><span>${t('count')}</span><select class="select" id="stN">${[1, 2, 3, 4].map(n => `<option>${n}</option>`).join('')}</select></label></div>`
      : `<div class="row"><label class="field grow"><span>${t('aspect')}</span><select class="select ltr" id="stAspect"><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label>
        <label class="field" style="width:120px"><span>${t('duration')}</span><select class="select" id="stSec">${[4, 8, 12].map(n => `<option>${n}</option>`).join('')}</select></label></div>`}
      <button class="btn primary" id="stGo" style="width:100%;height:46px;font-size:15px" ${m ? '' : 'disabled'}>${icon('wand')}${t('generate')}</button></div>
    <div><div id="stJobs"></div><div class="section-title" style="margin-top:0">${t('results')}</div><div class="media-grid" id="stRes"></div></div></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.studioTab = b.dataset.tab; S.studioPrompt = $('#stPrompt').value; renderStudio(); });
  $('#stModel').onclick = e => openModelPicker(e.currentTarget, { filter: tab, onPick: k => { S.studioKey[tab] = k; S.studioPrompt = $('#stPrompt').value; renderStudio(); } });
  $('#stPrompt').oninput = e => S.studioPrompt = e.target.value;
  $('#stEnhance').onclick = () => enhancePrompt($('#stEnhance'));
  $('#stGo').onclick = () => tab === 'image' ? studioImage() : studioVideo();
  drawStudioResults(); drawJobs();
}
async function enhancePrompt(btn) {
  const ta = $('#stPrompt'); const idea = ta.value.trim(); if (!idea) return;
  const cm = findModel(S.settings.defaultModel) && findModel(S.settings.defaultModel).caps.chat ? findModel(S.settings.defaultModel) : allModels().find(m => m.caps.chat);
  if (!cm) return toast(t('pickModelFirst'), 'bad');
  btn.disabled = true; let out = '';
  try {
    const r = await fetch('/api/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ providerId: cm.provider.id, modelId: cm.id, system: `Rewrite the user's idea as one vivid, detailed English prompt for an AI ${S.studioTab} generator: subject, style, lighting, camera, mood${S.studioTab === 'video' ? ', motion' : ''}. Output only the prompt, no quotes.`, messages: [{ role: 'user', content: idea }] }) });
    const txt = await r.text();
    txt.split('\n').forEach(l => { if (l.startsWith('data:')) { try { const j = JSON.parse(l.slice(5)); if (j.delta) out += j.delta; } catch { } } });
    if (out.trim()) { ta.value = out.trim(); S.studioPrompt = ta.value; }
  } catch (e) { toast(e.message, 'bad'); }
  btn.disabled = false;
}
function drawStudioResults() {
  const el = $('#stRes'); if (!el) return;
  el.innerHTML = S.studioResults.length ? S.studioResults.map(mediaTile).join('') : `<div class="empty" style="grid-column:1/-1">${icon('image')}<div>${t('emptyGallery')}</div></div>`;
  bindMediaTiles(el);
}
function mediaTile(x) {
  if (x.pending) return `<div class="gen-placeholder">${t('generatingImage')}</div>`;
  if (x.error) return `<div class="err-box" style="aspect-ratio:1;overflow:auto">${esc(x.error)}</div>`;
  return `<div class="media" data-id="${x.id}">${x.type === 'video' ? `<video src="${x.url}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video>` : `<img src="${x.url}" loading="lazy" alt="">`}
    <span class="type cap ${x.type}" style="background:rgba(0,0,0,.5)">${t('cap_' + x.type)}</span>
    <div class="ov"><p dir="auto">${esc(x.prompt || '')}</p><div class="row"><span class="dim" style="font-size:11px;color:#ddd;direction:ltr">${esc(x.model || '')}</span><span class="grow"></span>
    <button data-a="open" title="open">${icon('external')}</button><button data-a="reuse" title="${t('openPrompt')}">${icon('refresh')}</button><a href="${x.url}" download><button data-a="dl" title="${t('download')}">${icon('download')}</button></a><button data-a="del" title="${t('delete')}">${icon('trash')}</button></div></div></div>`;
}
function bindMediaTiles(el) {
  el.onclick = async e => {
    const b = e.target.closest('[data-a]'); const tile = e.target.closest('.media'); if (!tile) return;
    const id = tile.dataset.id; const item = (S.media || []).concat(S.studioResults).find(x => x.id === id);
    const a = b ? b.dataset.a : 'open';
    if (a === 'dl') return;
    if (a === 'open') { modal({ title: icon(item.type === 'video' ? 'video' : 'image') + `<span dir="ltr" style="font-size:13px">${esc(item.model || '')}</span>`, wide: true, body: `${item.type === 'video' ? `<video src="${item.url}" controls autoplay style="width:100%;border-radius:14px"></video>` : `<img src="${item.url}" style="width:100%;border-radius:14px">`}<p dir="auto" class="muted" style="line-height:1.8">${esc(item.prompt || '')}</p>`, foot: `<a class="btn" href="${item.url}" download>${icon('download')}${t('download')}</a>` }); }
    if (a === 'reuse') { S.studioPrompt = item.prompt; S.studioTab = item.type === 'video' ? 'video' : 'image'; if (item.provider && findModel(item.provider + '::' + item.model)) S.studioKey[S.studioTab] = item.provider + '::' + item.model; go('studio'); }
    if (a === 'del') { await api('/media/' + id, { method: 'DELETE' }); S.studioResults = S.studioResults.filter(x => x.id !== id); if (S.media) S.media = S.media.filter(x => x.id !== id); S.route === 'gallery' ? drawGallery() : drawStudioResults(); }
  };
}
async function studioImage() {
  const m = findModel(S.studioKey.image); const prompt = $('#stPrompt').value.trim(); if (!m || !prompt) return;
  const n = +$('#stN').value; const size = $('#stSize').value;
  const ph = Array.from({ length: n }).map(() => ({ pending: true, id: uid() }));
  S.studioResults.unshift(...ph); drawStudioResults();
  const btn = $('#stGo'); btn.disabled = true;
  try { const r = await api('/image', { method: 'POST', body: { providerId: m.provider.id, modelId: m.id, prompt, n, size } }); S.studioResults = S.studioResults.filter(x => !ph.includes(x)); S.studioResults.unshift(...r.items); }
  catch (e) { S.studioResults = S.studioResults.filter(x => !ph.includes(x)); S.studioResults.unshift({ id: uid(), error: e.message }); }
  if ($('#stGo')) $('#stGo').disabled = false; drawStudioResults();
}
async function studioVideo() {
  const m = findModel(S.studioKey.video); const prompt = $('#stPrompt').value.trim(); if (!m || !prompt) return;
  try {
    const job = await api('/video', { method: 'POST', body: { providerId: m.provider.id, modelId: m.id, prompt, aspect: $('#stAspect').value, seconds: +$('#stSec').value, size: $('#stAspect').value === '9:16' ? '720x1280' : '1280x720' } });
    S.jobs.unshift(job); drawJobs(); pollJob(job.id);
  } catch (e) { toast(e.message, 'bad'); }
}
async function pollJob(id) {
  while (true) {
    await new Promise(r => setTimeout(r, 4000));
    const j = await api('/video/' + id).catch(() => null); if (!j) return;
    const i = S.jobs.findIndex(x => x.id === id); if (i >= 0) S.jobs[i] = j;
    if (j.status === 'completed') { S.jobs.splice(i, 1); S.studioResults.unshift(j.result); toast(t('cap_video') + ' ✓', 'ok'); drawStudioResults(); drawJobs(); return; }
    if (j.status === 'failed') { toast(j.error, 'bad'); drawJobs(); return; }
    drawJobs();
  }
}
function drawJobs() {
  const el = $('#stJobs'); if (!el) return;
  el.innerHTML = S.jobs.length ? `<div class="section-title" style="margin-top:0">${t('jobs')}</div>` + S.jobs.map(j => `<div class="job">${icon('video')}<div class="grow"><div class="row"><span class="grow" dir="auto" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(j.prompt)}</span><span class="dim" style="font-size:12px">${j.status === 'failed' ? '✗ ' + esc(j.error || '') : Math.round(j.progress || 0) + '%'}</span></div><div class="bar" style="margin-top:6px"><i style="width:${j.progress || 3}%"></i></div></div></div>`).join('') : '';
}

// ------------------------------------------------------------ GALLERY
async function renderGallery() {
  $('#main').innerHTML = `<div class="page">${pageHead(t('gallery'), t('gallerySub'), `<div class="seg" id="gseg">${[['all', t('all')], ['image', t('images')], ['video', t('videos')]].map(([k, l]) => `<button data-g="${k}" class="${S.galleryFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div>`)}<div class="media-grid" id="gal"></div></div>`;
  $$('[data-g]').forEach(b => b.onclick = () => { S.galleryFilter = b.dataset.g; $$('[data-g]').forEach(x => x.classList.toggle('active', x === b)); drawGallery(); });
  S.media = await api('/media'); drawGallery();
}
function drawGallery() {
  const el = $('#gal'); if (!el) return;
  const list = (S.media || []).filter(x => S.galleryFilter === 'all' || x.type === S.galleryFilter);
  el.innerHTML = list.length ? list.map(mediaTile).join('') : `<div class="empty" style="grid-column:1/-1">${icon('gallery')}<div>${t('emptyGallery')}</div></div>`;
  bindMediaTiles(el);
}

// ------------------------------------------------------------ PROMPTS
function renderPrompts() {
  $('#main').innerHTML = `<div class="page">${pageHead(t('prompts'), t('promptsSub'), `<button class="btn primary" id="newP">${icon('plus')}${t('newPrompt')}</button>`)}
    <div class="grid">${S.prompts.map(p => `<div class="card"><div class="row" style="margin-bottom:8px"><b class="grow" dir="auto">${esc(p.title)}</b><button class="iconbtn" data-del="${p.id}">${icon('trash')}</button></div><p class="muted" dir="auto" style="margin:0 0 14px;font-size:13px;line-height:1.8;white-space:pre-wrap">${esc(p.text.slice(0, 400))}</p>
      <div class="row"><button class="btn sm primary" data-use="${p.id}">${icon('chat')}${t('usePrompt')}</button><button class="btn sm" data-sys="${p.id}">${icon('brain')}${t('systemPrompt')}</button></div></div>`).join('')}</div></div>`;
  $('#newP').onclick = () => modal({
    title: t('newPrompt'), body: `<label class="field"><span>${t('title')}</span><input class="input" id="npT"></label><label class="field"><span>${t('text')}</span><textarea class="textarea" id="npX" rows="8" dir="auto"></textarea></label>`,
    foot: `<button class="btn primary" id="npS">${t('save')}</button>`,
    onMount(el, close) { $('#npS', el).onclick = async () => { const title = $('#npT', el).value.trim(), text = $('#npX', el).value.trim(); if (!title || !text) return; S.prompts = await api('/prompts', { method: 'POST', body: { title, text } }); close(); renderPrompts(); }; }
  });
  $$('[data-del]').forEach(b => b.onclick = async () => { S.prompts = await api('/prompts/' + b.dataset.del, { method: 'DELETE' }); renderPrompts(); });
  $$('[data-use]').forEach(b => b.onclick = () => { S.draft = S.prompts.find(p => p.id === b.dataset.use).text; go('chat'); });
  $$('[data-sys]').forEach(b => b.onclick = () => { S.chat = null; S.pendingSystem = S.prompts.find(p => p.id === b.dataset.sys).text; go('chat'); toast(t('systemPrompt') + ' ✓', 'ok'); });
}

// ------------------------------------------------------------ SETTINGS
function renderSettings() {
  const dm = findModel(S.settings.defaultModel);
  $('#main').innerHTML = `<div class="page" style="max-width:900px">${pageHead(t('settings'), '')}
    <div class="card">
      <div class="set-row"><div><b>${t('language')}</b><small>فارسی / English</small></div><div class="seg"><button data-lang="fa" class="${S.settings.lang === 'fa' ? 'active' : ''}">فارسی</button><button data-lang="en" class="${S.settings.lang === 'en' ? 'active' : ''}">English</button></div></div>
      <div class="set-row"><div><b>${t('theme')}</b></div><div class="seg"><button data-theme="dark" class="${S.settings.theme === 'dark' ? 'active' : ''}">${icon('moon')}${t('dark')}</button><button data-theme="light" class="${S.settings.theme === 'light' ? 'active' : ''}">${icon('sun')}${t('light')}</button></div></div>
      <div class="set-row"><div><b>${t('defaultModel')}</b></div><button class="model-btn" id="defM">${dm ? `<span class="pdot" style="background:${pColor(dm.provider)}">${pInitial(dm.provider)}</span><span class="mn"><b>${esc(shortName(dm))}</b><small>${esc(dm.provider.name)}</small></span>` : `<span class="mn"><b>${t('selectModel')}</b></span>`}${icon('chevron')}</button></div>
      <div class="set-row"><div class="grow"><b>${t('temperature')}: <span id="tv">${S.settings.temperature}</span></b><input type="range" min="0" max="2" step="0.1" value="${S.settings.temperature}" id="temp" style="width:100%;margin-top:8px;accent-color:var(--accent)"></div></div>
      <div class="set-row" style="display:block"><b>${t('defaultSystem')}</b><textarea class="textarea" id="defSys" rows="4" dir="auto" style="margin-top:10px">${esc(S.settings.systemPrompt || '')}</textarea><button class="btn sm primary" id="saveSys" style="margin-top:8px">${t('save')}</button></div>
    </div>
    ${window.NovaAndroid ? `<div class="section-title">${icon('globe')} ${t('serverUrl')}</div><div class="card"><div class="row"><span class="grow" dir="ltr">${esc(location.origin)}</span><button class="btn" id="chgSrv">${t('changeServer')}</button></div></div>` : ''}
    <div class="section-title">${icon('download')} ${t('backup')}</div>
    <div class="card"><div class="row" style="flex-wrap:wrap"><a class="btn" href="/api/export">${icon('download')}${t('exportCfg')}</a><a class="btn" href="/api/export?keys=1">${icon('key')}${t('exportKeys')}</a><button class="btn" id="imp">${icon('upload')}${t('importCfg')}</button><input type="file" id="impF" accept=".json" hidden></div></div>
    <div class="section-title">${icon('telegram')} ${t('telegram')} <span class="badge grad">${t('comingSoon')}</span></div>
    <div class="card"><p class="muted" style="margin:0;line-height:1.9">${t('telegramSub')}</p></div>
    <div class="section-title">${icon('sparkles')} ${t('about')}</div>
    <div class="card"><div class="row"><div class="plogo" style="background:var(--grad)">${icon('sparkles')}</div><div><b>${t('appName')}</b><div class="dim">${t('tagline')} · v1.0</div></div></div>
    <p class="muted" style="line-height:1.9;margin-bottom:0">${t('shortcuts')}: <code>Ctrl+K</code> ${t('selectModel')} · <code>Ctrl+Shift+O</code> ${t('newChat')}</p></div></div>`;
  $$('[data-lang]').forEach(b => b.onclick = async () => { await saveSettings({ lang: b.dataset.lang }); renderShell(); });
  $$('[data-theme]').forEach(b => b.onclick = async () => { await saveSettings({ theme: b.dataset.theme }); renderShell(); });
  $('#defM').onclick = e => openModelPicker(e.currentTarget, { filter: 'chat', onPick: async k => { await saveSettings({ defaultModel: k }); S.selectedKey = k; renderSettings(); } });
  $('#temp').oninput = e => $('#tv').textContent = e.target.value;
  $('#temp').onchange = e => saveSettings({ temperature: +e.target.value });
  $('#saveSys').onclick = async () => { await saveSettings({ systemPrompt: $('#defSys').value }); toast(t('saved'), 'ok'); };
  if ($('#chgSrv')) $('#chgSrv').onclick = () => window.NovaAndroid.resetServer();
  $('#imp').onclick = () => $('#impF').click();
  $('#impF').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await api('/import', { method: 'POST', body: JSON.parse(await f.text()) }); await loadState(); toast(t('saved'), 'ok'); renderShell(); } catch (er) { toast(er.message, 'bad'); } };
}

// ------------------------------------------------------------ login
function renderLogin() {
  $('#app').innerHTML = `<div class="shell" style="grid-template-columns:1fr"><main class="main" style="display:grid;place-items:center"><div class="card login"><div class="welcome" style="margin:0"><div class="orb">${icon('lock')}</div><h2>${t('appName')}</h2></div>
    <input class="input" type="password" id="lp" placeholder="${t('password')}" style="margin-bottom:12px"><button class="btn primary" id="lb" style="width:100%">${t('login')}</button></div></main></div>`;
  const go2 = async () => { const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('#lp').value }) }); if (r.ok) boot(); else toast(t('wrongPass'), 'bad'); };
  $('#lb').onclick = go2; $('#lp').onkeydown = e => { if (e.key === 'Enter') go2(); };
}

// ------------------------------------------------------------ boot + sync
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (S.route !== 'chat') go('chat'); setTimeout(() => $('#modelBtn') && $('#modelBtn').click(), 30); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); S.chat = null; go('chat'); }
  if (e.key === 'Escape') closePopover();
});
// Light sync loop: picks up changes made elsewhere (another tab, or the Telegram bot later)
setInterval(async () => {
  if (document.hidden || S.streams.size || !S.providers.length) return;
  try {
    const st = await api('/state');
    const sig = x => JSON.stringify(x.providers.map(p => [p.id, p.enabled, (p.models || []).length])) + JSON.stringify(x.chats.map(c => c.id + c.updatedAt));
    if (sig(st) !== sig(S)) { S.providers = st.providers; S.chats = st.chats; S.prompts = st.prompts; if (S.route === 'chat') { renderChatList(); renderChatHead(); } else if (S.route === 'providers') renderProviders(); }
  } catch { }
}, 20000);
async function boot() {
  try { await loadState(); } catch (e) { if (e.message === 'auth') return; $('#app').innerHTML = `<div class="err-box" style="margin:40px">${esc(e.message)}</div>`; return; }
  const h = location.hash.slice(1); if (NAV.find(n => n[0] === h)) S.route = h;
  renderShell();
}
boot();
