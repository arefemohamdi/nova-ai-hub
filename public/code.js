/* Nova AI Hub — Code workspace (VS Code-like): explorer, editor, terminal, AI agent that writes files into the folder */
'use strict';
S.ws = { root: null, tree: [] }; S.tabs = []; S.activeTab = null; S.expanded = new Set(); S.term = { open: false, out: '' }; S.changed = new Set(); S.idePane = 'editor';
let CM = null;
const LANG_BY_EXT = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'text/typescript', tsx: 'text/typescript-jsx', json: 'application/json', html: 'htmlmixed', htm: 'htmlmixed', vue: 'htmlmixed', svelte: 'htmlmixed', xml: 'xml', svg: 'xml', css: 'css', scss: 'text/x-scss', less: 'text/x-less', py: 'python', md: 'markdown', markdown: 'markdown', c: 'text/x-csrc', h: 'text/x-csrc', cpp: 'text/x-c++src', hpp: 'text/x-c++src', cc: 'text/x-c++src', java: 'text/x-java', kt: 'text/x-kotlin', cs: 'text/x-csharp', sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', yml: 'yaml', yaml: 'yaml', go: 'go', php: 'php', dart: 'dart', swift: 'text/x-csrc', rs: 'text/x-csrc' };
const EXT_COLOR = { js: '#f7df1e', ts: '#3178c6', tsx: '#3178c6', jsx: '#61dafb', json: '#cbcb41', html: '#e34c26', css: '#2965f1', scss: '#c6538c', py: '#3776ab', md: '#9ca3af', java: '#b07219', kt: '#a97bff', go: '#00add8', php: '#777bb4', dart: '#0175c2', rs: '#dea584', c: '#555', cpp: '#f34b7d', cs: '#178600', sh: '#89e051', sql: '#e38c00', yml: '#cb171e', yaml: '#cb171e', vue: '#41b883', svg: '#ffb13b', txt: '#9ca3af' };
const extOf = p => (p.split('/').pop().split('.').length > 1 ? p.split('.').pop().toLowerCase() : '');
const hasFolder = () => !!((S.ws && S.ws.root) || S.dir);
const folderName = () => (S.ws && S.ws.root) ? S.ws.name : (S.dir ? S.dir.name : '');

async function loadWs() { try { S.ws = await api('/ws'); } catch { S.ws = { root: null, tree: [] }; } }
function flatFiles(nodes, out = []) { for (const n of nodes || []) { if (n.type === 'file') out.push(n.path); else flatFiles(n.children, out); } return out; }

// ---------------------------------------------------------------- folder dialog
async function openFolderDialog() {
  if (window.novaDesktop && window.novaDesktop.pickFolder) {
    const p = await window.novaDesktop.pickFolder(); if (p) await openWorkspace(p); return;
  }
  if (!S.fsEnabled) { if (window.showDirectoryPicker) return pickBrowserFolder(); toast(t('folderNotSupported'), 'bad'); return; }
  let cur = null;
  const m = modal({
    title: icon('folder') + t('chooseFolder'), wide: true,
    body: `<div class="row" style="margin-bottom:10px"><button class="btn sm icon" id="fbUp" title="..">${icon('chevron')}</button><input class="input ltr" id="fbPath"><button class="btn sm" id="fbGo">${icon('search')}</button></div>
      <div class="row" id="fbQuick" style="flex-wrap:wrap;margin-bottom:10px"></div>
      <div class="file-tree" id="fbList" style="max-height:44vh"></div>`,
    foot: `<button class="btn" id="fbNew">${icon('plus')}${t('newFolder')}</button><span class="grow"></span><button class="btn primary" id="fbOpen">${icon('check')}${t('openThisFolder')}</button>`,
    onMount(el, close) {
      $('#fbUp', el).style.transform = 'rotate(180deg)';
      const load = async p => {
        try {
          const r = await api('/ws/browse' + (p ? '?path=' + encodeURIComponent(p) : ''));
          cur = r; $('#fbPath', el).value = r.path;
          $('#fbQuick', el).innerHTML = [r.home, ...r.drives].map(d => `<button class="btn sm" data-q="${esc(d)}">${icon(d === r.home ? 'folder' : 'cube')}<span dir="ltr">${esc(d === r.home ? '~' : d)}</span></button>`).join('') + (S.ws.recent || []).slice(0, 4).map(d => `<button class="btn sm" data-q="${esc(d)}">${icon('refresh')}<span dir="ltr">${esc(d.split(/[\\/]/).pop())}</span></button>`).join('');
          $$('[data-q]', el).forEach(b => b.onclick = () => load(b.dataset.q));
          $('#fbList', el).innerHTML = r.dirs.length ? r.dirs.map(d => `<label data-d="${esc(d)}">${icon('folder')}${esc(d)}</label>`).join('') : `<div class="dim" style="padding:14px">— empty —</div>`;
          $$('[data-d]', el).forEach(l => { l.onclick = () => load(r.path + r.sep + l.dataset.d); });
        } catch (e) { toast(e.message, 'bad'); }
      };
      $('#fbUp', el).onclick = () => cur && cur.parent && load(cur.parent);
      $('#fbGo', el).onclick = () => load($('#fbPath', el).value);
      $('#fbPath', el).onkeydown = e => { if (e.key === 'Enter') load(e.target.value); };
      $('#fbNew', el).onclick = async () => { const n = await promptBox(t('newFolder'), 'my-project', true); if (n && cur) { await openWorkspace(cur.path + cur.sep + n, true); close(); } };
      $('#fbOpen', el).onclick = async () => { if (cur) { await openWorkspace(cur.path); close(); } };
      load((S.ws && S.ws.root) || null);
    }
  });
  return m;
}
async function pickBrowserFolder() {
  try { S.dir = await window.showDirectoryPicker({ mode: 'readwrite' }); S.agentMode = true; toast(t('folder') + ': ' + S.dir.name, 'ok'); rerenderFolderUi(); } catch { }
}
async function openWorkspace(p, create) {
  try {
    S.ws = await api('/ws/open', { method: 'POST', body: { path: p, create: !!create } });
    S.tabs = []; S.activeTab = null; S.expanded = new Set(); S.changed = new Set(); S.dir = null; S.agentMode = true;
    toast(t('folder') + ': ' + S.ws.name, 'ok');
    await pickWorkspaceChat();
    rerenderFolderUi();
    if (S.pendingPrompt) { const txt = S.pendingPrompt; S.pendingPrompt = null; setTimeout(() => { const ta = document.querySelector('#input'); if (ta) { ta.value = txt; onSend(); } }, 60); }
  } catch (e) { toast(e.message, 'bad'); }
}
async function closeWorkspace() { S.ws = await api('/ws/close', { method: 'POST' }); S.tabs = []; S.activeTab = null; S.dir = null; rerenderFolderUi(); }
function rerenderFolderUi() { if (S.route === 'code') renderCode(); else { renderChatHead(); renderComposer(); } }
async function pickWorkspaceChat() {
  const c = S.chats.filter(x => x.wsRoot && x.wsRoot === S.ws.root).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  S.chat = c ? await api('/chats/' + c.id) : null;
}

// ---------------------------------------------------------------- apply AI output to the folder
function parseAgentOutput(text) {
  const files = [], deletes = [];
  String(text || '').replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, info, code) => {
    const m = /path=([^\s]+)/.exec(info) || /^\s*\S+\s+([\w./-]+\.\w+)\s*$/.exec(info);
    const lang = (info.trim().split(/\s+/)[0] || '').toLowerCase();
    if (lang === 'delete' && m) deletes.push(m[1]);
    else if (m) files.push({ path: m[1].replace(/^\.?\//, ''), code: code.replace(/\n$/, '') });
  });
  return { files, deletes };
}
async function wsApply(files, deletes = []) {
  const r = await api('/ws/apply', { method: 'POST', body: { files: files.map(f => ({ path: f.path, content: f.code })), deletes } });
  S.ws.tree = r.tree;
  const ok = r.results.filter(x => x.ok);
  ok.forEach(x => { S.changed.add(x.path); x.path.split('/').slice(0, -1).reduce((acc, seg) => { const p = acc ? acc + '/' + seg : seg; S.expanded.add(p); return p; }, ''); });
  r.results.filter(x => !x.ok).forEach(x => toast(x.path + ': ' + x.error, 'bad'));
  // refresh open, unmodified tabs
  for (const tab of S.tabs) { if (ok.find(x => x.path === tab.path) && tab.doc.isClean(tab.gen)) { const f = await api('/ws/file?path=' + encodeURIComponent(tab.path)).catch(() => null); if (f) { tab.doc.setValue(f.content); tab.gen = tab.doc.changeGeneration(); } } }
  S.tabs = S.tabs.filter(tab => !deletes.includes(tab.path));
  if (ok.length) toast(t('filesSaved', { n: ok.length }), 'ok');
  return ok.map(x => x.path);
}
async function applyAssistantFiles(o) {
  const { files, deletes } = parseAgentOutput(o.content);
  if (!files.length && !deletes.length) return;
  if (S.ws && S.ws.root) {
    o.applied = await wsApply(files, deletes);
    if (S.route === 'code') { drawTree(); if (o.applied[0] && !deletes.includes(o.applied[0])) openFile(o.applied.find(p => !deletes.includes(p))); }
  } else if (S.dir) { await writeFilesToFolder(files); o.applied = files.map(f => f.path); }
}
async function workspaceContext() {
  if (S.ws && S.ws.root) {
    const files = flatFiles(S.ws.tree);
    let s = `Project folder: ${S.ws.root}\nFiles (${files.length}):\n${files.slice(0, 400).join('\n') || '(empty folder)'}`;
    const tab = S.tabs.find(x => x.path === S.activeTab);
    if (tab && S.route === 'code') s += `\n\nCurrently open file in the editor: ${tab.path}\n\`\`\`\n${tab.doc.getValue().slice(0, 60000)}\n\`\`\``;
    return s;
  }
  if (S.dir) { try { const files = await listFolder(S.dir, '', [], 0); return `Project folder: ${S.dir.name}\nFiles:\n${files.slice(0, 300).map(f => f.path).join('\n')}`; } catch { } }
  return '';
}
const AGENT_RULES = `You are an expert software engineer working directly inside the user's project folder (like an AI agent in VS Code).
Rules:
- To create or change a file, output the COMPLETE file content in a fenced code block whose info string is: \`\`\`<lang> path=<relative/path/from/project/root>
  The app writes these files into the folder automatically. Never output partial files or "rest unchanged" placeholders.
- To delete a file, output an empty block: \`\`\`delete path=<relative/path>\`\`\`
- Shell commands (install, build, run) go in \`\`\`bash blocks; the user runs them from the terminal.
- Keep explanations short and in the user's language. Organise projects with sensible folders.`;

// ---------------------------------------------------------------- IDE view
async function renderCode() {
  if (!S.wsLoaded) { await loadWs(); S.wsLoaded = true; if (S.ws.root && !S.chat) await pickWorkspaceChat(); }
  S.agentMode = true;
  const root = S.ws && S.ws.root;
  $('#main').innerHTML = `<div class="ide" data-pane="${S.idePane}">
    <div class="ide-mobile seg"><button data-pane="files">${icon('folder')}</button><button data-pane="editor">${icon('code')}</button><button data-pane="ai">${icon('sparkles')}</button></div>
    <aside class="ide-explorer">
      <div class="ide-ph"><span class="grow" dir="ltr" title="${esc(root || '')}">${root ? esc(S.ws.name).toUpperCase() : t('explorer').toUpperCase()}</span>
        ${root ? `<button class="iconbtn" id="exNewFile" title="${t('newFile')}">${icon('file')}</button><button class="iconbtn" id="exNewDir" title="${t('newFolder')}">${icon('folder')}</button><button class="iconbtn" id="exRefresh" title="Refresh">${icon('refresh')}</button>` : ''}
        <button class="iconbtn" id="exOpen" title="${t('chooseFolder')}">${icon('upload')}</button></div>
      <div class="ide-tree" id="tree"></div>
    </aside>
    <section class="ide-center">
      <div class="ide-tabs" id="tabs"></div>
      <div class="ide-editor" id="editorHost"></div>
      <div class="ide-term ${S.term.open ? '' : 'hidden'}" id="term"><div class="ide-ph"><span class="grow">${icon('code')} ${t('terminal')}</span><button class="iconbtn" id="termClear" title="clear">${icon('trash')}</button><button class="iconbtn" id="termClose">${icon('x')}</button></div>
        <pre id="termOut" dir="ltr"></pre><div class="term-in" dir="ltr"><span>$</span><input id="termIn" spellcheck="false" placeholder="npm install, python main.py, git status ..."></div></div>
    </section>
    <aside class="ide-ai">
      <header class="chat-head" id="chatHead"></header>
      <div class="messages" id="messages"><div class="msgs-inner" id="msgs"></div></div>
      <div class="composer-wrap" id="composerWrap"></div>
    </aside>
    <footer class="ide-status"><span>${icon('folder')} <b dir="ltr">${root ? esc(root) : t('noFolder')}</b></span><span class="grow"></span><span id="stPos" dir="ltr"></span><span id="stLang" dir="ltr"></span>
      <button id="termToggle">${icon('code')} ${t('terminal')}</button></footer>
  </div>`;
  $$('.ide-mobile [data-pane]').forEach(b => { b.classList.toggle('active', b.dataset.pane === S.idePane); b.onclick = () => { S.idePane = b.dataset.pane; $('.ide').dataset.pane = S.idePane; $$('.ide-mobile [data-pane]').forEach(x => x.classList.toggle('active', x === b)); if (CM) CM.refresh(); }; });
  $('#exOpen').onclick = openFolderDialog;
  if (root) {
    $('#exNewFile').onclick = () => newEntry('file');
    $('#exNewDir').onclick = () => newEntry('dir');
    $('#exRefresh').onclick = async () => { await loadWs(); drawTree(); };
  }
  $('#termToggle').onclick = toggleTerm; $('#termClose').onclick = toggleTerm;
  $('#termClear').onclick = () => { S.term.out = ''; $('#termOut').textContent = ''; };
  $('#termIn').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { runCmd(e.target.value.trim()); e.target.value = ''; } };
  $('#termOut').textContent = S.term.out;
  drawTree(); drawTabs(); mountEditor();
  renderChatHead(); renderMessages(); renderComposer();
}
function toggleTerm() { S.term.open = !S.term.open; $('#term').classList.toggle('hidden', !S.term.open); if (S.term.open) $('#termIn').focus(); if (CM) CM.refresh(); }
async function runCmd(cmd) {
  if (!S.ws.root) return toast(t('noFolder'), 'bad');
  if (!S.term.open) toggleTerm();
  const out = $('#termOut');
  S.term.out += `\n$ ${cmd}\n`; out.textContent = S.term.out; out.scrollTop = out.scrollHeight;
  const r = await api('/ws/exec', { method: 'POST', body: { cmd } }).catch(e => ({ output: e.message, code: -1 }));
  S.term.out += (r.output || '') + (r.code ? `\n[exit ${r.code}]` : '') + '\n';
  if ($('#termOut')) { $('#termOut').textContent = S.term.out; $('#termOut').scrollTop = 1e9; }
  if (r.tree) { S.ws.tree = r.tree; drawTree(); }
}
window.runCmd = runCmd;
function drawTree() {
  const el = $('#tree'); if (!el) return;
  if (!S.ws.root) {
    el.innerHTML = `<div class="ide-empty"><p class="muted">${t('noFolder')}</p><button class="btn primary" id="tOpen">${icon('folder')}${t('chooseFolder')}</button>
      ${(S.ws.recent || []).length ? `<div class="dim" style="margin:18px 0 6px;font-size:12px">${t('recent')}</div>` + S.ws.recent.map(r => `<button class="recent" data-r="${esc(r)}" dir="ltr">${icon('folder')}<span>${esc(r)}</span></button>`).join('') : ''}</div>`;
    $('#tOpen').onclick = openFolderDialog;
    $$('[data-r]', el).forEach(b => b.onclick = () => openWorkspace(b.dataset.r));
    return;
  }
  const row = (n, depth) => {
    const pad = 10 + depth * 14;
    if (n.type === 'dir') {
      const open = S.expanded.has(n.path);
      return `<div class="tnode dir" data-p="${esc(n.path)}" data-t="dir" style="padding-inline-start:${pad}px"><span class="chev ${open ? 'open' : ''}">${icon('chevron')}</span>${icon('folder')}<span class="tn">${esc(n.name)}</span><span class="tacts"><button data-a="newin" title="${t('newFile')}">${icon('plus')}</button><button data-a="ren">${icon('edit')}</button><button data-a="del">${icon('trash')}</button></span></div>` + (open ? (n.children || []).map(c => row(c, depth + 1)).join('') : '');
    }
    const ext = extOf(n.name);
    return `<div class="tnode file ${S.activeTab === n.path ? 'active' : ''} ${S.changed.has(n.path) ? 'changed' : ''}" data-p="${esc(n.path)}" data-t="file" style="padding-inline-start:${pad + 18}px"><i class="fdot" style="background:${EXT_COLOR[ext] || '#8b93b5'}"></i><span class="tn">${esc(n.name)}</span><span class="tacts"><button data-a="ren">${icon('edit')}</button><button data-a="del">${icon('trash')}</button></span></div>`;
  };
  el.innerHTML = (S.ws.tree || []).map(n => row(n, 0)).join('') || `<div class="ide-empty"><p class="muted">${t('emptyFolder')}</p><button class="btn sm" id="tNew">${icon('file')}${t('newFile')}</button></div>`;
  if ($('#tNew')) $('#tNew').onclick = () => newEntry('file');
  el.onclick = async e => {
    const node = e.target.closest('.tnode'); if (!node) return;
    const p = node.dataset.p; const act = e.target.closest('[data-a]') && e.target.closest('[data-a]').dataset.a;
    if (act === 'del') { if (!(await confirmBox(t('delete') + ': ' + p))) return; await api('/ws/file?path=' + encodeURIComponent(p), { method: 'DELETE' }); S.tabs = S.tabs.filter(x => !(x.path === p || x.path.startsWith(p + '/'))); if (S.activeTab && !S.tabs.find(x => x.path === S.activeTab)) S.activeTab = (S.tabs[0] || {}).path || null; await loadWs(); drawTree(); drawTabs(); mountEditor(); return; }
    if (act === 'ren') { const n = await promptBox(t('rename'), p, true); if (n && n !== p) { await api('/ws/rename', { method: 'POST', body: { from: p, to: n } }); S.tabs.forEach(x => { if (x.path === p) x.path = n; }); if (S.activeTab === p) S.activeTab = n; await loadWs(); drawTree(); drawTabs(); } return; }
    if (act === 'newin') { newEntry('file', p); return; }
    if (node.dataset.t === 'dir') { S.expanded.has(p) ? S.expanded.delete(p) : S.expanded.add(p); drawTree(); }
    else openFile(p);
  };
}
async function newEntry(kind, base = '') {
  const def = (base ? base + '/' : '') + (kind === 'file' ? 'untitled.js' : 'new-folder');
  const p = await promptBox(kind === 'file' ? t('newFile') : t('newFolder'), def, true); if (!p) return;
  try {
    if (kind === 'file') { await api('/ws/file', { method: 'PUT', body: { path: p, content: '' } }); }
    else await api('/ws/mkdir', { method: 'POST', body: { path: p } });
    p.split('/').slice(0, kind === 'file' ? -1 : undefined).reduce((acc, seg) => { const x = acc ? acc + '/' + seg : seg; S.expanded.add(x); return x; }, '');
    await loadWs(); drawTree(); if (kind === 'file') openFile(p);
  } catch (e) { toast(e.message, 'bad'); }
}
async function openFile(p) {
  if (!p) return;
  let tab = S.tabs.find(x => x.path === p);
  if (!tab) {
    let f;
    try { f = await api('/ws/file?path=' + encodeURIComponent(p)); } catch (e) { return toast(e.message, 'bad'); }
    if (f.binary) return toast(t('binaryFile'), 'bad');
    const ext = extOf(p);
    const doc = CodeMirror.Doc(f.content, LANG_BY_EXT[ext] || 'text/plain');
    tab = { path: p, doc, gen: doc.changeGeneration() };
    S.tabs.push(tab);
  }
  S.activeTab = p;
  if (S.route !== 'code') { go('code'); return; }
  if (window.innerWidth < 860) { S.idePane = 'editor'; $('.ide').dataset.pane = 'editor'; }
  drawTabs(); drawTree(); mountEditor();
}
window.openFile = openFile;
function drawTabs() {
  const el = $('#tabs'); if (!el) return;
  el.innerHTML = S.tabs.map(tb => { const dirty = !tb.doc.isClean(tb.gen); const name = tb.path.split('/').pop(); return `<div class="itab ${tb.path === S.activeTab ? 'active' : ''}" data-p="${esc(tb.path)}" title="${esc(tb.path)}"><i class="fdot" style="background:${EXT_COLOR[extOf(name)] || '#8b93b5'}"></i><span dir="ltr">${esc(name)}</span><button data-x="1">${dirty ? '<b class="dirty">●</b>' : icon('x')}</button></div>`; }).join('');
  el.onclick = async e => {
    const tb = e.target.closest('.itab'); if (!tb) return; const p = tb.dataset.p;
    if (e.target.closest('[data-x]')) {
      const tab = S.tabs.find(x => x.path === p);
      if (!tab.doc.isClean(tab.gen) && !confirm(t('unsavedQ'))) return;
      S.tabs = S.tabs.filter(x => x.path !== p); if (S.activeTab === p) S.activeTab = (S.tabs[S.tabs.length - 1] || {}).path || null;
      drawTabs(); drawTree(); mountEditor(); return;
    }
    S.activeTab = p; drawTabs(); drawTree(); mountEditor();
  };
}
function mountEditor() {
  const host = $('#editorHost'); if (!host) return;
  const tab = S.tabs.find(x => x.path === S.activeTab);
  if (!tab) {
    CM = null;
    host.innerHTML = `<div class="ide-welcome"><div class="orb">${icon('code')}</div><h2>Nova Code</h2><p class="muted">${S.ws.root ? t('codeHintOpen') : t('codeHintNoFolder')}</p>
      <div class="row" style="justify-content:center;flex-wrap:wrap">${S.ws.root ? `<button class="btn" id="wNew">${icon('file')}${t('newFile')}</button>` : `<button class="btn primary" id="wOpen">${icon('folder')}${t('chooseFolder')}</button>`}<button class="btn" id="wTerm">${icon('code')}${t('terminal')}</button></div>
      <div class="kbd-hints"><span><kbd>Ctrl</kbd>+<kbd>S</kbd> ${t('save')}</span><span><kbd>Ctrl</kbd>+<kbd>\`</kbd> ${t('terminal')}</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> ${t('selectModel')}</span></div></div>`;
    if ($('#wOpen')) $('#wOpen').onclick = openFolderDialog;
    if ($('#wNew')) $('#wNew').onclick = () => newEntry('file');
    $('#wTerm').onclick = toggleTerm;
    $('#stPos') && ($('#stPos').textContent = ''); $('#stLang') && ($('#stLang').textContent = '');
    return;
  }
  host.innerHTML = '';
  CM = CodeMirror(host, { value: '', lineNumbers: true, indentUnit: 2, tabSize: 2, matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, lineWrapping: false, direction: 'ltr', extraKeys: { 'Ctrl-S': saveActive, 'Cmd-S': saveActive, 'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment', Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('  ') } });
  CM.swapDoc(tab.doc);
  CM.on('change', () => drawTabsLight());
  CM.on('cursorActivity', () => { const c = CM.getCursor(); if ($('#stPos')) $('#stPos').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`; });
  if ($('#stLang')) $('#stLang').textContent = (LANG_BY_EXT[extOf(tab.path)] || 'plain text').replace('text/', '');
  setTimeout(() => { CM.refresh(); CM.focus(); }, 20);
}
let tabsTimer = null;
function drawTabsLight() { clearTimeout(tabsTimer); tabsTimer = setTimeout(drawTabs, 120); }
async function saveActive() {
  const tab = S.tabs.find(x => x.path === S.activeTab); if (!tab) return;
  try { await api('/ws/file', { method: 'PUT', body: { path: tab.path, content: tab.doc.getValue() } }); tab.gen = tab.doc.changeGeneration(); drawTabs(); toast(t('fileSaved', { f: tab.path }), 'ok'); } catch (e) { toast(e.message, 'bad'); }
}
document.addEventListener('keydown', e => {
  if (S.route !== 'code') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveActive(); }
  if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleTerm(); }
});
window.addEventListener('beforeunload', e => { if (S.tabs.some(tb => !tb.doc.isClean(tb.gen))) { e.preventDefault(); e.returnValue = ''; } });
