// Nova AI Hub — Telegram bot. Runs inside the same server process and uses the same data:
// providers, models, chats and gallery are shared with the web app (chats from Telegram show up in the web app too).
'use strict';
const fs = require('fs');
const path = require('path');

const TXT = {
  fa: {
    welcome: name => `سلام ${name} 👋\nبه <b>نوا AI هاب</b> خوش اومدی.\nهر سؤالی داری بنویس، عکس یا فایل بفرست، یا از منوی پایین مدل رو عوض کن و عکس بساز.`,
    menu: { chat: '💬 گفتگوی جدید', model: '🤖 انتخاب مدل', image: '🎨 ساخت تصویر', imodel: '🖼 مدل تصویر', lang: '🌐 English', help: '❓ راهنما' },
    newChat: '✨ گفتگوی جدید شروع شد. پیامت رو بنویس.',
    pickProvider: 'یک سرویس انتخاب کن:', pickModel: p => `مدل‌های <b>${p}</b>:`, picked: m => `✅ مدل انتخاب شد: <b>${m}</b>`,
    pickedImg: m => `✅ مدل تصویر: <b>${m}</b>`, noModels: 'هنوز هیچ مدلی در وب‌اپ اضافه نشده.', noImageModel: 'هیچ مدل ساخت تصویری پیدا نشد.',
    askImage: '🎨 توضیح تصویری که می‌خوای رو بنویس:', making: '⏳ در حال ساخت تصویر…', thinking: '⏳ …',
    current: (m, im) => `مدل گفتگو: <b>${m || '—'}</b>\nمدل تصویر: <b>${im || '—'}</b>`,
    help: '📘 <b>راهنما</b>\n/new گفتگوی جدید\n/model انتخاب مدل گفتگو\n/imodel انتخاب مدل تصویر\n/image متن  ساخت تصویر\n/lang تغییر زبان\n/id شناسه تلگرام شما\n\nعکس بفرستی، مدل‌های دارای «دید» آن را تحلیل می‌کنند. فایل متنی یا کد بفرستی، داخل گفتگو قرار می‌گیرد. همه گفتگوها در وب‌اپ هم دیده می‌شوند.',
    needPass: '🔒 این ربات رمز دارد. رمز را بفرست:', wrongPass: '❌ رمز اشتباه است.', passOk: '✅ وارد شدی.', denied: id => `⛔️ شما اجازه استفاده از این ربات را ندارید.\nشناسه شما: <code>${id}</code>`,
    limit: n => `⏳ سقف ${n} پیام امروز شما پر شد. فردا دوباره امتحان کن.`, err: e => `⚠️ خطا: ${e}`, back: '« بازگشت', more: 'بیشتر »', prev: '« قبلی',
    fileTooBig: 'فایل خیلی بزرگ است (حداکثر ۱ مگابایت برای فایل متنی).', unsupported: 'این نوع فایل پشتیبانی نمی‌شود؛ عکس یا فایل متنی بفرست.',
    langSet: '✅ زبان: فارسی'
  },
  en: {
    welcome: name => `Hi ${name} 👋\nWelcome to <b>Nova AI Hub</b>.\nAsk anything, send a photo or a file, or use the menu to switch models and generate images.`,
    menu: { chat: '💬 New chat', model: '🤖 Choose model', image: '🎨 Generate image', imodel: '🖼 Image model', lang: '🌐 فارسی', help: '❓ Help' },
    newChat: '✨ New chat started. Send your message.',
    pickProvider: 'Pick a provider:', pickModel: p => `<b>${p}</b> models:`, picked: m => `✅ Model selected: <b>${m}</b>`,
    pickedImg: m => `✅ Image model: <b>${m}</b>`, noModels: 'No models have been added in the web app yet.', noImageModel: 'No image generation model found.',
    askImage: '🎨 Describe the image you want:', making: '⏳ Generating image…', thinking: '⏳ …',
    current: (m, im) => `Chat model: <b>${m || '—'}</b>\nImage model: <b>${im || '—'}</b>`,
    help: '📘 <b>Help</b>\n/new new chat\n/model choose chat model\n/imodel choose image model\n/image text  generate an image\n/lang switch language\n/id your Telegram id\n\nSend a photo and vision models will analyse it. Send a text or code file and it is added to the chat. All chats also appear in the web app.',
    needPass: '🔒 This bot is password protected. Send the password:', wrongPass: '❌ Wrong password.', passOk: '✅ You are in.', denied: id => `⛔️ You are not allowed to use this bot.\nYour id: <code>${id}</code>`,
    limit: n => `⏳ You reached today's limit of ${n} messages. Try again tomorrow.`, err: e => `⚠️ Error: ${e}`, back: '« Back', more: 'More »', prev: '« Prev',
    fileTooBig: 'File is too large (max 1 MB for text files).', unsupported: 'Unsupported file; send a photo or a text file.',
    langSet: '✅ Language: English'
  }
};
const PAGE = 8;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Markdown (subset) → Telegram HTML
function mdToHtml(md) {
  const blocks = [];
  let s = String(md || '').replace(/```[^\n`]*\n?([\s\S]*?)```/g, (_, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  s = esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1<i>$2</i>')
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
}
function splitText(text, max = 3900) {
  const out = []; let s = String(text || '');
  while (s.length > max) { let cut = s.lastIndexOf('\n', max); if (cut < max * 0.5) cut = max; out.push(s.slice(0, cut)); s = s.slice(cut); }
  if (s.trim() || !out.length) out.push(s);
  return out;
}

module.exports = function createBot(ctx) {
  const { getDb, saveDb, providerById, streamChat, generateImage, uid, MEDIA_DIR } = ctx;
  const st = { running: false, username: null, error: null, startedAt: null, ctrl: null, offset: 0, loopId: 0 };
  const waiting = new Map(); // tgId -> 'image' | 'password'
  const cbStore = new Map(); let cbSeq = 0; // short callback tokens

  const cfg = () => { const db = getDb(); db.settings.telegram = Object.assign({ enabled: false, token: '', access: 'password', password: '', allowed: [], dailyLimit: 0, apiBase: '' }, db.settings.telegram || {}); return db.settings.telegram; };
  const users = () => { const db = getDb(); db.telegramUsers = db.telegramUsers || {}; return db.telegramUsers; };
  const apiBase = () => (cfg().apiBase || 'https://api.telegram.org').replace(/\/+$/, '');

  async function tg(method, body, isForm) {
    const url = `${apiBase()}/bot${cfg().token}/${method}`;
    const r = await fetch(url, isForm ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({ ok: false, description: 'HTTP ' + r.status }));
    if (!j.ok) throw new Error(j.description || 'Telegram error');
    return j.result;
  }
  const sendHtml = (chat_id, html, extra = {}) => tg('sendMessage', Object.assign({ chat_id, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, extra))
    .catch(() => tg('sendMessage', Object.assign({ chat_id, text: html.replace(/<[^>]+>/g, '') }, extra, { parse_mode: undefined })));

  // ---------- models
  function allModels(filter) {
    const out = [];
    for (const p of getDb().providers) {
      if (p.enabled === false) continue;
      for (const m of p.models || []) { if (m.hidden) continue; if (filter && !(m.caps || {})[filter]) continue; out.push({ key: p.id + '::' + m.id, p, m }); }
    }
    return out;
  }
  const findModel = key => { if (!key) return null; const i = key.indexOf('::'); const p = providerById(key.slice(0, i)); const m = p && (p.models || []).find(x => x.id === key.slice(i + 2)); return m ? { key, p, m } : null; };
  const label = x => x ? (x.m.name || x.m.id) : '';
  function userOf(from) {
    const u = users(); const id = String(from.id);
    if (!u[id]) u[id] = { id, name: [from.first_name, from.last_name].filter(Boolean).join(' '), username: from.username || '', lang: (from.language_code || 'fa').startsWith('fa') ? 'fa' : (from.language_code ? 'en' : 'fa'), authed: false, count: 0, day: '' , createdAt: Date.now() };
    u[id].lastSeen = Date.now();
    return u[id];
  }
  function chatModel(u) {
    const db = getDb();
    return findModel(u.model) || findModel(db.settings.defaultModel) || allModels('chat')[0] || null;
  }
  function imageModel(u) { return findModel(u.imageModel) || allModels('image').find(x => !x.m.caps.chat) || allModels('image')[0] || null; }
  function keyboard(u) {
    const T = TXT[u.lang].menu;
    return { keyboard: [[{ text: T.chat }, { text: T.model }], [{ text: T.image }, { text: T.imodel }], [{ text: T.lang }, { text: T.help }]], resize_keyboard: true, is_persistent: true };
  }
  function tok(v) { const k = (++cbSeq).toString(36); cbStore.set(k, v); if (cbStore.size > 3000) cbStore.delete(cbStore.keys().next().value); return k; }

  function providerMenu(u, filter) {
    const T = TXT[u.lang];
    const provs = getDb().providers.filter(p => p.enabled !== false && (p.models || []).some(m => !m.hidden && (m.caps || {})[filter]));
    if (!provs.length) return { text: filter === 'image' ? T.noImageModel : T.noModels };
    const rows = []; for (let i = 0; i < provs.length; i += 2) rows.push(provs.slice(i, i + 2).map(p => ({ text: p.name, callback_data: 'x' + tok({ a: 'prov', pid: p.id, filter, page: 0 }) })));
    return { text: T.pickProvider, reply_markup: { inline_keyboard: rows } };
  }
  function modelMenu(u, pid, filter, page) {
    const T = TXT[u.lang]; const p = providerById(pid);
    const models = (p.models || []).filter(m => !m.hidden && (m.caps || {})[filter]);
    const cur = filter === 'image' ? u.imageModel : u.model;
    const slice = models.slice(page * PAGE, page * PAGE + PAGE);
    const rows = slice.map(m => [{ text: (cur === p.id + '::' + m.id ? '✅ ' : '') + (m.name || m.id).slice(0, 60), callback_data: 'x' + tok({ a: 'set', key: p.id + '::' + m.id, filter }) }]);
    const nav = [];
    if (page > 0) nav.push({ text: T.prev, callback_data: 'x' + tok({ a: 'prov', pid, filter, page: page - 1 }) });
    nav.push({ text: T.back, callback_data: 'x' + tok({ a: 'provs', filter }) });
    if ((page + 1) * PAGE < models.length) nav.push({ text: T.more, callback_data: 'x' + tok({ a: 'prov', pid, filter, page: page + 1 }) });
    rows.push(nav);
    return { text: T.pickModel(esc(p.name)) + ` (${models.length})`, reply_markup: { inline_keyboard: rows } };
  }

  // ---------- access
  function allowed(u, chatId, text) {
    const c = cfg(); const T = TXT[u.lang];
    if (c.access === 'all') return true;
    if (c.access === 'list') {
      const list = (c.allowed || []).map(x => String(x).trim().replace(/^@/, '').toLowerCase());
      if (list.includes(u.id) || (u.username && list.includes(u.username.toLowerCase()))) return true;
      sendHtml(chatId, T.denied(u.id)); return false;
    }
    // password
    if (u.authed || !c.password) return true;
    if (waiting.get(u.id) === 'password' && text) {
      if (text.trim() === c.password) { u.authed = true; waiting.delete(u.id); saveDb(); sendHtml(chatId, T.passOk + '\n\n' + T.welcome(esc(u.name)), { reply_markup: keyboard(u) }); }
      else sendHtml(chatId, T.wrongPass);
      return false;
    }
    waiting.set(u.id, 'password'); sendHtml(chatId, T.needPass); return false;
  }
  function underLimit(u) {
    const lim = Number(cfg().dailyLimit) || 0; if (!lim) return true;
    const day = new Date().toISOString().slice(0, 10);
    if (u.day !== day) { u.day = day; u.count = 0; }
    if (u.count >= lim) return false;
    u.count++; return true;
  }

  // ---------- chat storage shared with the web app
  function novaChat(u, firstText) {
    const db = getDb();
    let c = u.chatId && db.chats.find(x => x.id === u.chatId);
    if (!c) {
      c = { id: uid('c_'), title: '✈️ ' + (String(firstText || 'Telegram').slice(0, 40)), messages: [], source: 'telegram', tgUser: u.id, createdAt: Date.now(), updatedAt: Date.now() };
      db.chats.unshift(c); u.chatId = c.id;
    }
    return c;
  }
  function historyFor(c) {
    return c.messages.slice(-24).map(m => ({ role: m.role, content: m.content || (m.images && m.images.length ? '[image]' : ''), attachments: m.role === 'user' ? (m.attachments || []) : [] })).filter(m => m.content || (m.attachments || []).length);
  }

  async function sendMediaFile(chatId, url, caption) {
    const file = path.join(MEDIA_DIR, path.basename(url));
    const buf = fs.readFileSync(file);
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) fd.append('caption', caption.slice(0, 1000));
    const isVideo = /\.(mp4|webm|mov)$/i.test(file);
    fd.append(isVideo ? 'video' : 'photo', new Blob([buf]), path.basename(file));
    return tg(isVideo ? 'sendVideo' : 'sendPhoto', fd, true).catch(() => { const f2 = new FormData(); f2.append('chat_id', String(chatId)); f2.append('document', new Blob([buf]), path.basename(file)); return tg('sendDocument', f2, true); });
  }

  async function doChat(u, chatId, text, attachments) {
    const T = TXT[u.lang];
    const mm = chatModel(u); if (!mm) return sendHtml(chatId, T.noModels);
    const c = novaChat(u, text);
    c.messages.push({ id: uid(), role: 'user', content: text || '', attachments, ts: Date.now(), via: 'telegram' });
    const out = { id: uid(), role: 'assistant', content: '', reasoning: '', model: mm.key, images: [], ts: Date.now(), via: 'telegram' };
    tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => { });
    const ph = await tg('sendMessage', { chat_id: chatId, text: T.thinking });
    let lastEdit = 0, lastSent = '', editing = Promise.resolve();
    const flush = (final) => {
      const now = Date.now(); if (!final && now - lastEdit < 1300) return;
      lastEdit = now;
      const body = out.content.slice(0, 3900) + (final ? '' : ' ▍');
      if (!out.content || body === lastSent) return;
      lastSent = body;
      editing = editing.then(() => tg('editMessageText', final ? { chat_id: chatId, message_id: ph.message_id, text: mdToHtml(body), parse_mode: 'HTML', disable_web_page_preview: true } : { chat_id: chatId, message_id: ph.message_id, text: body }).catch(() => final ? tg('editMessageText', { chat_id: chatId, message_id: ph.message_id, text: body }).catch(() => { }) : null));
    };
    const t0 = Date.now();
    const system = [getDb().settings.systemPrompt, 'You are chatting through Telegram. Reply in the user\'s language. Keep formatting simple (bold, lists, code blocks).'].filter(Boolean).join('\n\n');
    try {
      await streamChat(mm.p, mm.m.id, historyFor(c), { system, temperature: getDb().settings.temperature }, o => {
        if (o.delta) { out.content += o.delta; flush(false); }
        if (o.reasoning) out.reasoning += o.reasoning;
        if (o.image) out.images.push(o.image);
      }, new AbortController().signal);
    } catch (e) { out.error = e.message; }
    out.ms = Date.now() - t0;
    c.messages.push(out); c.updatedAt = Date.now(); c.model = mm.key; saveDb();
    await editing;
    if (out.error && !out.content) { await tg('editMessageText', { chat_id: chatId, message_id: ph.message_id, text: T.err(out.error).slice(0, 4000) }).catch(() => { }); return; }
    const parts = splitText(out.content);
    if (out.content) {
      lastSent = ''; lastEdit = 0; out.content = parts[0]; flush(true); await editing; out.content = parts.join('');
      for (const extra of parts.slice(1)) await sendHtml(chatId, mdToHtml(extra));
    } else if (!out.images.length) await tg('editMessageText', { chat_id: chatId, message_id: ph.message_id, text: '…' }).catch(() => { });
    else await tg('deleteMessage', { chat_id: chatId, message_id: ph.message_id }).catch(() => { });
    for (const im of out.images) await sendMediaFile(chatId, im).catch(() => { });
  }

  async function doImage(u, chatId, prompt) {
    const T = TXT[u.lang];
    const im = imageModel(u); if (!im) return sendHtml(chatId, T.noImageModel);
    const ph = await tg('sendMessage', { chat_id: chatId, text: T.making });
    tg('sendChatAction', { chat_id: chatId, action: 'upload_photo' }).catch(() => { });
    try {
      const items = await generateImage(im.p, im.m.id, prompt, { n: 1, size: '1024x1024' });
      await tg('deleteMessage', { chat_id: chatId, message_id: ph.message_id }).catch(() => { });
      for (const it of items) await sendMediaFile(chatId, it.url, `🎨 ${prompt}\n— ${label(im)}`);
      const c = novaChat(u, prompt);
      c.messages.push({ id: uid(), role: 'user', content: prompt, ts: Date.now(), via: 'telegram' });
      c.messages.push({ id: uid(), role: 'assistant', content: '', kind: 'image', images: items.map(i => i.url), model: im.key, ts: Date.now(), via: 'telegram' });
      c.updatedAt = Date.now(); saveDb();
    } catch (e) { await tg('editMessageText', { chat_id: chatId, message_id: ph.message_id, text: T.err(e.message).slice(0, 4000) }).catch(() => { }); }
  }

  async function downloadFile(fileId) {
    const f = await tg('getFile', { file_id: fileId });
    const r = await fetch(`${apiBase()}/file/bot${cfg().token}/${f.file_path}`);
    if (!r.ok) throw new Error('download failed');
    return { buf: Buffer.from(await r.arrayBuffer()), path: f.file_path };
  }

  // ---------- update router
  async function onMessage(msg) {
    const chatId = msg.chat.id; const u = userOf(msg.from); const T = () => TXT[u.lang];
    const text = (msg.text || msg.caption || '').trim();
    if (text === '/id') return sendHtml(chatId, `<code>${u.id}</code>`);
    if (!allowed(u, chatId, text)) return;
    const M = T().menu; const any = k => [TXT.fa.menu[k], TXT.en.menu[k]].includes(text);
    if (text.startsWith('/start')) { waiting.delete(u.id); return sendHtml(chatId, T().welcome(esc(u.name || msg.from.first_name || '')) + '\n\n' + T().current(esc(label(chatModel(u))), esc(label(imageModel(u)))), { reply_markup: keyboard(u) }); }
    if (text === '/new' || any('chat')) { u.chatId = null; waiting.delete(u.id); saveDb(); return sendHtml(chatId, T().newChat, { reply_markup: keyboard(u) }); }
    if (text === '/model' || any('model')) { const m = providerMenu(u, 'chat'); return sendHtml(chatId, m.text, m.reply_markup ? { reply_markup: m.reply_markup } : {}); }
    if (text === '/imodel' || any('imodel')) { const m = providerMenu(u, 'image'); return sendHtml(chatId, m.text, m.reply_markup ? { reply_markup: m.reply_markup } : {}); }
    if (text === '/lang' || any('lang')) { u.lang = u.lang === 'fa' ? 'en' : 'fa'; saveDb(); return sendHtml(chatId, T().langSet, { reply_markup: keyboard(u) }); }
    if (text === '/help' || any('help')) return sendHtml(chatId, T().help + '\n\n' + T().current(esc(label(chatModel(u))), esc(label(imageModel(u)))), { reply_markup: keyboard(u) });
    if (any('image')) { waiting.set(u.id, 'image'); return sendHtml(chatId, T().askImage); }
    if (text.startsWith('/image')) { const p = text.replace(/^\/image(@\w+)?/, '').trim(); if (!p) { waiting.set(u.id, 'image'); return sendHtml(chatId, T().askImage); } if (!underLimit(u)) return sendHtml(chatId, T().limit(cfg().dailyLimit)); return doImage(u, chatId, p); }
    if (waiting.get(u.id) === 'image' && text && !msg.photo) { waiting.delete(u.id); if (!underLimit(u)) return sendHtml(chatId, T().limit(cfg().dailyLimit)); return doImage(u, chatId, text); }

    const attachments = [];
    try {
      if (msg.photo && msg.photo.length) {
        const ph = msg.photo[msg.photo.length - 1]; const f = await downloadFile(ph.file_id);
        attachments.push({ type: 'image', name: path.basename(f.path), dataUrl: 'data:image/jpeg;base64,' + f.buf.toString('base64') });
      } else if (msg.document) {
        const d = msg.document;
        if (/^image\//.test(d.mime_type || '')) { const f = await downloadFile(d.file_id); attachments.push({ type: 'image', name: d.file_name, dataUrl: `data:${d.mime_type};base64,` + f.buf.toString('base64') }); }
        else {
          if (d.file_size > 1024 * 1024) return sendHtml(chatId, T().fileTooBig);
          const f = await downloadFile(d.file_id);
          if (f.buf.subarray(0, 4000).includes(0)) return sendHtml(chatId, T().unsupported);
          attachments.push({ type: 'text', name: d.file_name || 'file.txt', text: f.buf.toString('utf8') });
        }
      } else if (msg.voice || msg.video || msg.sticker || msg.audio) return sendHtml(chatId, T().unsupported);
    } catch (e) { return sendHtml(chatId, T().err(esc(e.message))); }
    if (!text && !attachments.length) return;
    if (text.startsWith('/')) return sendHtml(chatId, T().help);
    if (!underLimit(u)) return sendHtml(chatId, T().limit(cfg().dailyLimit));
    return doChat(u, chatId, text, attachments);
  }

  async function onCallback(q) {
    const u = userOf(q.from); const chatId = q.message.chat.id; const T = TXT[u.lang];
    tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => { });
    if (cfg().access === 'password' && cfg().password && !u.authed) return;
    const v = cbStore.get(String(q.data || '').slice(1)); if (!v) return;
    const edit = m => tg('editMessageText', { chat_id: chatId, message_id: q.message.message_id, text: m.text, parse_mode: 'HTML', reply_markup: m.reply_markup }).catch(() => { });
    if (v.a === 'provs') return edit(providerMenu(u, v.filter));
    if (v.a === 'prov') return edit(modelMenu(u, v.pid, v.filter, v.page));
    if (v.a === 'set') {
      const mm = findModel(v.key); if (!mm) return;
      if (v.filter === 'image') u.imageModel = v.key; else { u.model = v.key; u.chatId = null; }
      saveDb();
      return edit({ text: v.filter === 'image' ? T.pickedImg(esc(label(mm))) : T.picked(esc(label(mm))) + '\n' + T.newChat });
    }
  }

  // ---------- polling loop
  async function loop(id) {
    while (st.running && st.loopId === id) {
      try {
        st.ctrl = new AbortController();
        const url = `${apiBase()}/bot${cfg().token}/getUpdates`;
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offset: st.offset, timeout: 45, allowed_updates: ['message', 'callback_query'] }), signal: st.ctrl.signal });
        const j = await r.json();
        if (!j.ok) throw new Error(j.description || 'getUpdates failed');
        st.error = null;
        for (const upd of j.result) {
          st.offset = upd.update_id + 1;
          const h = upd.message ? onMessage(upd.message) : upd.callback_query ? onCallback(upd.callback_query) : null;
          if (h) h.catch(e => console.error('[telegram]', e.message));
        }
      } catch (e) {
        if (!st.running || st.loopId !== id) break;
        st.error = e.message; await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  async function start() {
    stop();
    const c = cfg(); if (!c.enabled || !c.token) return status();
    try {
      const me = await tg('getMe');
      st.username = me.username; st.error = null; st.running = true; st.startedAt = Date.now(); st.loopId++;
      await tg('setMyCommands', { commands: [{ command: 'new', description: 'گفتگوی جدید · New chat' }, { command: 'model', description: 'انتخاب مدل · Choose model' }, { command: 'image', description: 'ساخت تصویر · Generate image' }, { command: 'imodel', description: 'مدل تصویر · Image model' }, { command: 'lang', description: 'زبان · Language' }, { command: 'help', description: 'راهنما · Help' }] }).catch(() => { });
      loop(st.loopId);
      console.log(`  ✈️  Telegram bot @${me.username} is running`);
    } catch (e) { st.running = false; st.error = e.message; }
    return status();
  }
  function stop() { st.running = false; st.loopId++; try { st.ctrl && st.ctrl.abort(); } catch { } }
  function status() {
    const c = cfg(); const u = users();
    return { enabled: !!c.enabled, hasToken: !!c.token, token: c.token ? c.token.slice(0, 6) + '••••' + c.token.slice(-4) : '', access: c.access, password: c.password ? '••••' : '', hasPassword: !!c.password, allowed: c.allowed || [], dailyLimit: c.dailyLimit || 0, apiBase: c.apiBase || '', running: st.running, username: st.username, error: st.error, startedAt: st.startedAt, users: Object.values(u).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 50).map(x => ({ id: x.id, name: x.name, username: x.username, lastSeen: x.lastSeen, count: x.count })) };
  }
  async function configure(b) {
    const c = cfg();
    if (typeof b.token === 'string' && !b.token.includes('••')) c.token = b.token.trim();
    if (typeof b.password === 'string' && b.password !== '••••') { if (b.password !== c.password) Object.values(users()).forEach(x => x.authed = false); c.password = b.password; }
    if (b.access) c.access = b.access;
    if (Array.isArray(b.allowed)) c.allowed = b.allowed.map(String).filter(Boolean);
    if (b.dailyLimit !== undefined) c.dailyLimit = Math.max(0, Number(b.dailyLimit) || 0);
    if (typeof b.apiBase === 'string') c.apiBase = b.apiBase.trim();
    if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
    saveDb();
    return start();
  }
  return { start, stop, status, configure };
};
