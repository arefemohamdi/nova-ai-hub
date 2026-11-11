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
    help: '📘 <b>راهنما</b>\n/admin پنل مدیریت (فقط ادمین)\n/new گفتگوی جدید\n/model انتخاب مدل گفتگو\n/imodel انتخاب مدل تصویر\n/image متن  ساخت تصویر\n/lang تغییر زبان\n/id شناسه تلگرام شما\n\nعکس بفرستی، مدل‌های دارای «دید» آن را تحلیل می‌کنند. فایل متنی یا کد بفرستی، داخل گفتگو قرار می‌گیرد. همه گفتگوها در وب‌اپ هم دیده می‌شوند.',
    needPass: '🔒 این ربات رمز دارد. رمز را بفرست:', wrongPass: '❌ رمز اشتباه است.', passOk: '✅ وارد شدی.', denied: id => `⛔️ شما اجازه استفاده از این ربات را ندارید.\nشناسه شما: <code>${id}</code>`,
    limit: n => `⏳ سقف ${n} پیام امروز شما پر شد. فردا دوباره امتحان کن.`, err: e => `⚠️ خطا: ${e}`, back: '« بازگشت', more: 'بیشتر »', prev: '« قبلی',
    fileTooBig: 'فایل خیلی بزرگ است (حداکثر ۱ مگابایت برای فایل متنی).', unsupported: 'این نوع فایل پشتیبانی نمی‌شود؛ عکس یا فایل متنی بفرست.',
    langSet: '✅ زبان: فارسی',
    needLink: id => `🔐 برای استفاده، ربات را به حسابت در نوا وصل کن:\n\n۱) در برنامه (وب، ویندوز یا اندروید) برو به <b>تنظیمات ← اتصال تلگرام</b> و کد بگیر، بعد اینجا بفرست:\n<code>/link کد</code>\n۲) یا مستقیم وارد شو:\n<code>/login نام‌کاربری رمز</code>\n\nشناسه تلگرام شما: <code>${id}</code>`,
    canRegister: '\n\nحساب نداری؟ با <code>/register</code> همین الان بساز.',
    linked: n => `✅ تلگرام به حساب <b>${n}</b> وصل شد.`, badCode: '❌ کد نامعتبر یا منقضی است.', badLogin: '❌ نام کاربری یا رمز اشتباه است.', registered: n => `✅ حساب <b>${n}</b> ساخته شد.`, pendingApproval: '⏳ حساب شما ساخته شد و منتظر تأیید ادمین است.', regClosed: 'ثبت‌نام بسته است. از ادمین بخواه برایت حساب بسازد.',
    disabled: '⛔️ حساب شما غیرفعال است.', pending: '⏳ حساب شما هنوز توسط ادمین تأیید نشده.', maint: '🛠 سرویس در حال به‌روزرسانی است. کمی بعد دوباره امتحان کن.',
    adminOnly: 'این بخش فقط برای ادمین است.',
    admin: { title: '🛡 <b>پنل مدیریت نوا</b>', stats: '📊 آمار', users: '👥 کاربران', providers: '🔌 پرووایدرها', add: '➕ افزودن پرووایدر', broadcast: '📣 پیام همگانی', maint: on => on ? '🟢 خاموش کردن حالت تعمیر' : '🛠 روشن کردن حالت تعمیر',
      pickPreset: 'کدام سرویس را اضافه کنم؟', askKey: n => `🔑 کلید API سرویس <b>${n}</b> را بفرست.\n(پیامت بعد از خواندن پاک می‌شود)`, askUrl: '🌐 آدرس Base URL سرویس را بفرست (مثلاً https://api.example.com/v1):', adding: '⏳ در حال افزودن و دریافت مدل‌ها…',
      added: (n, r) => `✅ <b>${n}</b> اضافه شد.` + (r ? `\nمدل‌ها: ${r.total} (تصویر ${r.image}، ویدیو ${r.video}، دید ${r.vision})` : ''), addErr: e => `⚠️ اضافه شد اما دریافت مدل‌ها خطا داد: ${e}`,
      askBroadcast: '📣 متن پیام همگانی را بفرست (برای همه کاربران تلگرام و برنامه‌ها ارسال می‌شود):', sent: n => `✅ برای ${n} نفر در تلگرام ارسال شد.`,
      provInfo: (p, n) => `🔌 <b>${p.name}</b>\nوضعیت: ${p.enabled !== false ? '🟢 فعال' : '⚪️ غیرفعال'}\nمدل‌ها: ${n}`, toggle: on => on ? '⏸ غیرفعال کن' : '▶️ فعال کن', refetch: '🔄 دریافت دوباره مدل‌ها', del: '🗑 حذف', delQ: n => `«${n}» حذف شود؟`, yes: '✅ بله، حذف کن', deleted: '🗑 حذف شد.', fetched: r => `🔄 ${r.total} مدل (${r.added} جدید)`,
      userInfo: u => `👤 <b>${u.name}</b> (@${u.username})\nنقش: ${u.role === 'admin' ? 'ادمین' : 'کاربر'} · وضعیت: ${u.status}\nامروز: ${u.today.msgs} پیام، ${u.today.images} تصویر`, ban: '⛔️ مسدود کن', unban: '✅ فعال کن', approve: '✅ تأیید', noUsers: 'کاربری نیست.',
      statsText: o => `📊 <b>آمار امروز</b>\nپیام: ${o.today.msgs} · تصویر: ${o.today.images} · ویدیو: ${o.today.videos}\n\n👥 کاربران: ${o.users.total} (فعال ۲۴ساعت: ${o.users.active24h}، منتظر تأیید: ${o.users.pending}، مسدود: ${o.users.banned})\n📱 فعال در ۲۴ ساعت: وب ${o.platformsActive.web} · ویندوز ${o.platformsActive.windows} · اندروید ${o.platformsActive.android} · تلگرام ${o.platformsActive.telegram}` }
  },
  en: {
    welcome: name => `Hi ${name} 👋\nWelcome to <b>Nova AI Hub</b>.\nAsk anything, send a photo or a file, or use the menu to switch models and generate images.`,
    menu: { chat: '💬 New chat', model: '🤖 Choose model', image: '🎨 Generate image', imodel: '🖼 Image model', lang: '🌐 فارسی', help: '❓ Help' },
    newChat: '✨ New chat started. Send your message.',
    pickProvider: 'Pick a provider:', pickModel: p => `<b>${p}</b> models:`, picked: m => `✅ Model selected: <b>${m}</b>`,
    pickedImg: m => `✅ Image model: <b>${m}</b>`, noModels: 'No models have been added in the web app yet.', noImageModel: 'No image generation model found.',
    askImage: '🎨 Describe the image you want:', making: '⏳ Generating image…', thinking: '⏳ …',
    current: (m, im) => `Chat model: <b>${m || '—'}</b>\nImage model: <b>${im || '—'}</b>`,
    help: '📘 <b>Help</b>\n/admin admin panel (admins)\n/new new chat\n/model choose chat model\n/imodel choose image model\n/image text  generate an image\n/lang switch language\n/id your Telegram id\n\nSend a photo and vision models will analyse it. Send a text or code file and it is added to the chat. All chats also appear in the web app.',
    needPass: '🔒 This bot is password protected. Send the password:', wrongPass: '❌ Wrong password.', passOk: '✅ You are in.', denied: id => `⛔️ You are not allowed to use this bot.\nYour id: <code>${id}</code>`,
    limit: n => `⏳ You reached today's limit of ${n} messages. Try again tomorrow.`, err: e => `⚠️ Error: ${e}`, back: '« Back', more: 'More »', prev: '« Prev',
    fileTooBig: 'File is too large (max 1 MB for text files).', unsupported: 'Unsupported file; send a photo or a text file.',
    langSet: '✅ Language: English',
    needLink: id => `🔐 To use this bot, link it to your Nova account:\n\n1) In the app (web, Windows or Android) open <b>Settings → Telegram link</b>, get a code and send it here:\n<code>/link CODE</code>\n2) Or sign in directly:\n<code>/login username password</code>\n\nYour Telegram id: <code>${id}</code>`,
    canRegister: '\n\nNo account? Create one now with <code>/register</code>.',
    linked: n => `✅ Telegram is now linked to <b>${n}</b>.`, badCode: '❌ Invalid or expired code.', badLogin: '❌ Wrong username or password.', registered: n => `✅ Account <b>${n}</b> created.`, pendingApproval: '⏳ Your account was created and is waiting for admin approval.', regClosed: 'Registration is closed. Ask the admin to create an account for you.',
    disabled: '⛔️ Your account is disabled.', pending: '⏳ Your account has not been approved yet.', maint: '🛠 The service is being updated. Please try again shortly.',
    adminOnly: 'Admins only.',
    admin: { title: '🛡 <b>Nova admin panel</b>', stats: '📊 Stats', users: '👥 Users', providers: '🔌 Providers', add: '➕ Add provider', broadcast: '📣 Broadcast', maint: on => on ? '🟢 Turn maintenance off' : '🛠 Turn maintenance on',
      pickPreset: 'Which provider should I add?', askKey: n => `🔑 Send the API key for <b>${n}</b>.\n(Your message is deleted after reading)`, askUrl: '🌐 Send the Base URL (e.g. https://api.example.com/v1):', adding: '⏳ Adding and fetching models…',
      added: (n, r) => `✅ <b>${n}</b> added.` + (r ? `\nModels: ${r.total} (image ${r.image}, video ${r.video}, vision ${r.vision})` : ''), addErr: e => `⚠️ Added, but fetching models failed: ${e}`,
      askBroadcast: '📣 Send the broadcast text (goes to every Telegram user and every open app):', sent: n => `✅ Sent to ${n} Telegram users.`,
      provInfo: (p, n) => `🔌 <b>${p.name}</b>\nStatus: ${p.enabled !== false ? '🟢 on' : '⚪️ off'}\nModels: ${n}`, toggle: on => on ? '⏸ Disable' : '▶️ Enable', refetch: '🔄 Fetch models again', del: '🗑 Delete', delQ: n => `Delete "${n}"?`, yes: '✅ Yes, delete', deleted: '🗑 Deleted.', fetched: r => `🔄 ${r.total} models (${r.added} new)`,
      userInfo: u => `👤 <b>${u.name}</b> (@${u.username})\nRole: ${u.role} · Status: ${u.status}\nToday: ${u.today.msgs} msgs, ${u.today.images} images`, ban: '⛔️ Disable', unban: '✅ Enable', approve: '✅ Approve', noUsers: 'No users.',
      statsText: o => `📊 <b>Today</b>\nMessages: ${o.today.msgs} · Images: ${o.today.images} · Videos: ${o.today.videos}\n\n👥 Users: ${o.users.total} (active 24h: ${o.users.active24h}, pending: ${o.users.pending}, disabled: ${o.users.banned})\n📱 Active 24h: web ${o.platformsActive.web} · Windows ${o.platformsActive.windows} · Android ${o.platformsActive.android} · Telegram ${o.platformsActive.telegram}` }
  }
};
const PAGE = 8;
const ADMIN_BTN = { fa: '🛡 پنل مدیریت', en: '🛡 Admin panel' };
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
  const { getDb, saveDb, providerById, streamChat, generateImage, uid, MEDIA_DIR, acc, PRESETS, addProvider, mergeModels, changed } = ctx;
  const st = { running: false, username: null, error: null, startedAt: null, ctrl: null, offset: 0, loopId: 0 };
  const waiting = new Map(); // tgId -> 'image' | 'password'
  const cbStore = new Map(); let cbSeq = 0; // short callback tokens

  const cfg = () => {
    const db = getDb(); const c = db.settings.telegram = Object.assign({ enabled: false, token: '', access: 'accounts', apiBase: '' }, db.settings.telegram || {});
    if (!['accounts', 'open'].includes(c.access)) c.access = c.access === 'all' ? 'open' : 'accounts'; // older versions used password/list/all
    return c;
  };
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
  let curUser = null; // the Nova account of the Telegram user being served (set per update)
  const okModel = (p, m) => m.enabled !== false && !m.hidden && (!curUser || acc.modelAllowed(curUser, p.id + '::' + m.id));
  function allModels(filter) {
    const out = [];
    for (const p of getDb().providers) {
      if (p.enabled === false) continue;
      for (const m of p.models || []) { if (!okModel(p, m)) continue; if (filter && !(m.caps || {})[filter]) continue; out.push({ key: p.id + '::' + m.id, p, m }); }
    }
    return out;
  }
  const findModel = key => { if (!key) return null; const i = key.indexOf('::'); const p = providerById(key.slice(0, i)); const m = p && p.enabled !== false && (p.models || []).find(x => x.id === key.slice(i + 2)); return m && okModel(p, m) ? { key, p, m } : null; };
  const label = x => x ? (x.m.name || x.m.id) : '';
  function userOf(from) {
    const u = users(); const id = String(from.id);
    if (!u[id]) u[id] = { id, name: [from.first_name, from.last_name].filter(Boolean).join(' '), username: from.username || '', lang: (from.language_code || 'fa').startsWith('fa') ? 'fa' : (from.language_code ? 'en' : 'fa'), createdAt: Date.now() };
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
    const rows = [[{ text: T.chat }, { text: T.model }], [{ text: T.image }, { text: T.imodel }], [{ text: T.lang }, { text: T.help }]];
    if (curUser && curUser.role === 'admin') rows.push([{ text: ADMIN_BTN[u.lang] }]);
    return { keyboard: rows, resize_keyboard: true, is_persistent: true };
  }
  function tok(v) { const k = (++cbSeq).toString(36); cbStore.set(k, v); if (cbStore.size > 3000) cbStore.delete(cbStore.keys().next().value); return k; }

  function providerMenu(u, filter) {
    const T = TXT[u.lang];
    const provs = getDb().providers.filter(p => p.enabled !== false && (p.models || []).some(m => okModel(p, m) && (m.caps || {})[filter]));
    if (!provs.length) return { text: filter === 'image' ? T.noImageModel : T.noModels };
    const rows = []; for (let i = 0; i < provs.length; i += 2) rows.push(provs.slice(i, i + 2).map(p => ({ text: p.name, callback_data: 'x' + tok({ a: 'prov', pid: p.id, filter, page: 0 }) })));
    return { text: T.pickProvider, reply_markup: { inline_keyboard: rows } };
  }
  function modelMenu(u, pid, filter, page) {
    const T = TXT[u.lang]; const p = providerById(pid);
    const models = (p.models || []).filter(m => okModel(p, m) && (m.caps || {})[filter]);
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

  // ---------- access: every Telegram user is a Nova account (linked by code, login, or auto-created in "open" mode)
  function accountFor(tu, from) {
    let u = tu.uid && acc.byId(tu.uid);
    if (!u) { u = acc.byTg(tu.id); if (u) tu.uid = u.id; }
    if (!u && cfg().access === 'open') {
      let name = (from.username || 'tg' + tu.id).replace(/[^a-zA-Z0-9_.\-]/g, '').slice(0, 28) || 'tg' + tu.id; if (name.length < 3) name = 'tg_' + name;
      while (acc.byName(name)) name = name.slice(0, 24) + Math.floor(Math.random() * 1000);
      const reg = acc.db().config.registration;
      u = acc.createUser({ username: name, name: tu.name || name, status: reg === 'approval' ? 'pending' : 'active', tgId: tu.id, tgUsername: from.username });
      tu.uid = u.id; saveDb();
    }
    return u || null;
  }
  function gate(tu, u, chatId) {
    const T = TXT[tu.lang];
    if (!u) { sendHtml(chatId, T.needLink(tu.id) + (acc.db().config.registration !== 'closed' ? T.canRegister : '')); return false; }
    if (u.status === 'banned') { sendHtml(chatId, T.disabled); return false; }
    if (u.status === 'pending') { sendHtml(chatId, T.pending); return false; }
    if (acc.db().config.maintenance && u.role !== 'admin') { sendHtml(chatId, T.maint); return false; }
    return true;
  }
  function spend(u, kind, model, chatId, tu) {
    try { acc.consume(u, kind, 'telegram', model); return true; }
    catch (e) { sendHtml(chatId, TXT[tu.lang].err(esc(e.message))); return false; }
  }
  async function linkCommands(tu, from, chatId, text) {
    const T = TXT[tu.lang];
    const link = u => { curUser = u; u.tgId = tu.id; u.tgUsername = from.username || ''; delete u.tgLink; tu.uid = u.id; saveDb(); acc.log('telegram.link', u); sendHtml(chatId, T.linked(esc(u.name || u.username)), { reply_markup: keyboard(tu) }); };
    let m;
    if ((m = text.match(/^\/link(?:@\w+)?\s+([A-Za-z0-9]{4,12})$/))) {
      const code = m[1].toUpperCase();
      const u = acc.users().find(x => x.tgLink && x.tgLink.code === code && x.tgLink.exp > Date.now());
      if (!u) return sendHtml(chatId, T.badCode), true;
      link(u); return true;
    }
    if ((m = text.match(/^\/login(?:@\w+)?\s+(\S+)\s+(.+)$/))) {
      tg('deleteMessage', { chat_id: chatId, message_id: currentMsgId }).catch(() => { });
      const u = acc.byName(m[1]);
      if (!acc.checkPassword(u, m[2].trim())) { await new Promise(r => setTimeout(r, 800)); return sendHtml(chatId, T.badLogin), true; }
      link(u); return true;
    }
    if (/^\/register(@\w+)?$/.test(text)) {
      const reg = acc.db().config.registration;
      if (reg === 'closed') return sendHtml(chatId, T.regClosed), true;
      if (acc.byTg(tu.id)) return true;
      let name = (from.username || 'tg' + tu.id).replace(/[^a-zA-Z0-9_.\-]/g, '').slice(0, 28) || 'tg' + tu.id; if (name.length < 3) name = 'tg_' + name;
      while (acc.byName(name)) name = name.slice(0, 24) + Math.floor(Math.random() * 1000);
      const u = acc.createUser({ username: name, name: tu.name || name, status: reg === 'approval' ? 'pending' : 'active', tgId: tu.id, tgUsername: from.username });
      tu.uid = u.id; saveDb();
      sendHtml(chatId, u.status === 'pending' ? T.pendingApproval : T.registered(esc(u.username)) + '\n\n' + T.welcome(esc(tu.name)), u.status === 'active' ? { reply_markup: keyboard(tu) } : {});
      return true;
    }
    return false;
  }

  // ---------- chat storage shared with the web app
  function novaChat(u, firstText) {
    const db = getDb();
    let c = u.chatId && db.chats.find(x => x.id === u.chatId && x.owner === u.uid);
    if (!c) {
      c = { id: uid('c_'), title: '✈️ ' + (String(firstText || 'Telegram').slice(0, 40)), messages: [], source: 'telegram', tgUser: u.id, owner: u.uid, createdAt: Date.now(), updatedAt: Date.now() };
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
    if (!spend(curUser, 'msg', mm.key, chatId, u)) return;
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
      await streamChat(mm.p, mm.m.id, historyFor(c), { system, temperature: getDb().settings.temperature, owner: u.uid }, o => {
        if (o.delta) { out.content += o.delta; flush(false); }
        if (o.reasoning) out.reasoning += o.reasoning;
        if (o.image) out.images.push(o.image);
      }, new AbortController().signal);
    } catch (e) { out.error = e.message; }
    out.ms = Date.now() - t0;
    c.messages.push(out); c.updatedAt = Date.now(); c.model = mm.key; saveDb(); changed.chats(u.uid);
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
    if (!spend(curUser, 'image', im.key, chatId, u)) return;
    const ph = await tg('sendMessage', { chat_id: chatId, text: T.making });
    tg('sendChatAction', { chat_id: chatId, action: 'upload_photo' }).catch(() => { });
    try {
      const items = await generateImage(im.p, im.m.id, prompt, { n: 1, size: '1024x1024', owner: u.uid });
      await tg('deleteMessage', { chat_id: chatId, message_id: ph.message_id }).catch(() => { });
      for (const it of items) await sendMediaFile(chatId, it.url, `🎨 ${prompt}\n— ${label(im)}`);
      const c = novaChat(u, prompt);
      c.messages.push({ id: uid(), role: 'user', content: prompt, ts: Date.now(), via: 'telegram' });
      c.messages.push({ id: uid(), role: 'assistant', content: '', kind: 'image', images: items.map(i => i.url), model: im.key, ts: Date.now(), via: 'telegram' });
      c.updatedAt = Date.now(); saveDb(); changed.chats(u.uid);
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
    currentMsgId = msg.message_id;
    if (text === '/id') return sendHtml(chatId, `<code>${u.id}</code>`);
    if (msg.chat.type !== 'private') return; // the bot answers in private chats only
    if (await linkCommands(u, msg.from, chatId, text)) return;
    const account = accountFor(u, msg.from); curUser = account;
    if (!gate(u, account, chatId)) return;
    acc.seen(account, 'telegram');
    if (await adminMessage(u, account, chatId, text, msg)) return;
    const M = T().menu; const any = k => [TXT.fa.menu[k], TXT.en.menu[k]].includes(text);
    if (text.startsWith('/start')) { waiting.delete(u.id); return sendHtml(chatId, T().welcome(esc(u.name || msg.from.first_name || '')) + '\n\n' + T().current(esc(label(chatModel(u))), esc(label(imageModel(u)))), { reply_markup: keyboard(u) }); }
    if (text === '/new' || any('chat')) { u.chatId = null; waiting.delete(u.id); saveDb(); return sendHtml(chatId, T().newChat, { reply_markup: keyboard(u) }); }
    if (text === '/model' || any('model')) { const m = providerMenu(u, 'chat'); return sendHtml(chatId, m.text, m.reply_markup ? { reply_markup: m.reply_markup } : {}); }
    if (text === '/imodel' || any('imodel')) { const m = providerMenu(u, 'image'); return sendHtml(chatId, m.text, m.reply_markup ? { reply_markup: m.reply_markup } : {}); }
    if (text === '/lang' || any('lang')) { u.lang = u.lang === 'fa' ? 'en' : 'fa'; saveDb(); return sendHtml(chatId, T().langSet, { reply_markup: keyboard(u) }); }
    if (text === '/help' || any('help')) return sendHtml(chatId, T().help + '\n\n' + T().current(esc(label(chatModel(u))), esc(label(imageModel(u)))), { reply_markup: keyboard(u) });
    if (any('image')) { waiting.set(u.id, 'image'); return sendHtml(chatId, T().askImage); }
    if (text.startsWith('/image')) { const p = text.replace(/^\/image(@\w+)?/, '').trim(); if (!p) { waiting.set(u.id, 'image'); return sendHtml(chatId, T().askImage); } return doImage(u, chatId, p); }
    if (waiting.get(u.id) === 'image' && text && !msg.photo) { waiting.delete(u.id); return doImage(u, chatId, text); }

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
    return doChat(u, chatId, text, attachments);
  }

  async function onCallback(q) {
    const u = userOf(q.from); const chatId = q.message.chat.id; const T = TXT[u.lang];
    tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => { });
    const account = accountFor(u, q.from); curUser = account;
    if (!account || account.status !== 'active') return;
    const v = cbStore.get(String(q.data || '').slice(1)); if (!v) return;
    const edit = m => tg('editMessageText', { chat_id: chatId, message_id: q.message.message_id, text: m.text, parse_mode: 'HTML', reply_markup: m.reply_markup }).catch(() => { });
    if (v.a && v.a.startsWith('adm')) return account.role === 'admin' ? adminCallback(u, account, chatId, v, edit) : null;
    if (v.a === 'provs') return edit(providerMenu(u, v.filter));
    if (v.a === 'prov') return edit(modelMenu(u, v.pid, v.filter, v.page));
    if (v.a === 'set') {
      const mm = findModel(v.key); if (!mm) return;
      if (v.filter === 'image') u.imageModel = v.key; else { u.model = v.key; u.chatId = null; }
      saveDb();
      return edit({ text: v.filter === 'image' ? T.pickedImg(esc(label(mm))) : T.picked(esc(label(mm))) + '\n' + T.newChat });
    }
  }

  // ---------- admin panel inside the bot (same data as the web dashboard)
  let currentMsgId = 0;
  const btn = (text, v) => ({ text, callback_data: 'x' + tok(v) });
  function adminHome(tu) {
    const A = TXT[tu.lang].admin; const c = acc.db().config;
    return { text: A.title, reply_markup: { inline_keyboard: [[btn(A.stats, { a: 'adm_stats' }), btn(A.users, { a: 'adm_users', page: 0 })], [btn(A.providers, { a: 'adm_provs' }), btn(A.add, { a: 'adm_add', page: 0 })], [btn(A.broadcast, { a: 'adm_bc' }), btn(A.maint(c.maintenance), { a: 'adm_maint' })]] } };
  }
  const back = (tu, a = 'adm_home') => [btn(TXT[tu.lang].back, { a })];
  async function adminMessage(tu, account, chatId, text, msg) {
    const A = TXT[tu.lang].admin; const w = waiting.get(tu.id);
    if (/^\/admin(@\w+)?$/.test(text) || text === ADMIN_BTN.fa || text === ADMIN_BTN.en) {
      if (account.role !== 'admin') { sendHtml(chatId, TXT[tu.lang].adminOnly); return true; }
      const h = adminHome(tu); sendHtml(chatId, h.text, { reply_markup: h.reply_markup }); return true;
    }
    if (!w || typeof w !== 'object' || account.role !== 'admin' || !text) return false;
    if (w.step === 'url') { w.baseUrl = text.trim(); w.step = 'key'; sendHtml(chatId, A.askKey(esc(w.name))); return true; }
    if (w.step === 'key') {
      waiting.delete(tu.id);
      tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => { });
      const ph = await tg('sendMessage', { chat_id: chatId, text: A.adding });
      const r = await addProvider({ preset: w.preset, baseUrl: w.baseUrl, apiKey: text.trim(), name: w.preset === 'custom' ? (w.baseUrl.replace(/^https?:\/\//, '').split('/')[0]) : undefined });
      acc.log('provider.add', account, { name: r.prov.name, platform: 'telegram' });
      await tg('editMessageText', { chat_id: chatId, message_id: ph.message_id, text: r.error ? A.addErr(esc(r.error)) : A.added(esc(r.prov.name), r.fetched), parse_mode: 'HTML' }).catch(() => { });
      return true;
    }
    if (w.step === 'broadcast') {
      waiting.delete(tu.id);
      const r = await broadcast(text); acc.emit('notice', null, { text });
      acc.log('broadcast', account, { telegram: r.sent });
      sendHtml(chatId, A.sent(r.sent)); return true;
    }
    return false;
  }
  async function adminCallback(tu, account, chatId, v, edit) {
    const A = TXT[tu.lang].admin;
    if (v.a === 'adm_home') return edit(adminHome(tu));
    if (v.a === 'adm_stats') return edit({ text: A.statsText(acc.overview()), reply_markup: { inline_keyboard: [[btn('🔄', { a: 'adm_stats' })], back(tu)] } });
    if (v.a === 'adm_maint') { const c = acc.db().config; c.maintenance = !c.maintenance; saveDb(); changed.config(); acc.log('config', account, { maintenance: c.maintenance }); return edit(adminHome(tu)); }
    if (v.a === 'adm_bc') { waiting.set(tu.id, { step: 'broadcast' }); return edit({ text: A.askBroadcast, reply_markup: { inline_keyboard: [back(tu)] } }); }
    if (v.a === 'adm_add') {
      const list = PRESETS; const page = v.page || 0; const per = 12;
      const rows = []; const sl = list.slice(page * per, page * per + per);
      for (let i = 0; i < sl.length; i += 2) rows.push(sl.slice(i, i + 2).map(p => btn(p.name, { a: 'adm_preset', id: p.id })));
      const nav = []; if (page > 0) nav.push(btn(TXT[tu.lang].prev, { a: 'adm_add', page: page - 1 })); nav.push(btn(TXT[tu.lang].back, { a: 'adm_home' })); if ((page + 1) * per < list.length) nav.push(btn(TXT[tu.lang].more, { a: 'adm_add', page: page + 1 }));
      rows.push(nav); return edit({ text: A.pickPreset, reply_markup: { inline_keyboard: rows } });
    }
    if (v.a === 'adm_preset') {
      const p = PRESETS.find(x => x.id === v.id); if (!p) return;
      if (p.noKey && p.id !== 'custom') { const r = await addProvider({ preset: p.id }); return edit({ text: r.error ? A.addErr(esc(r.error)) : A.added(esc(r.prov.name), r.fetched), reply_markup: { inline_keyboard: [back(tu)] } }); }
      waiting.set(tu.id, { step: p.id === 'custom' ? 'url' : 'key', preset: p.id, name: p.name, baseUrl: p.baseUrl });
      return edit({ text: p.id === 'custom' ? A.askUrl : A.askKey(esc(p.name)), reply_markup: { inline_keyboard: [back(tu)] } });
    }
    if (v.a === 'adm_provs') {
      const rows = getDb().providers.map(p => [btn(`${p.enabled !== false ? '🟢' : '⚪️'} ${p.name} (${(p.models || []).length})`, { a: 'adm_prov', id: p.id })]);
      rows.push([btn(A.add, { a: 'adm_add', page: 0 })], back(tu));
      return edit({ text: A.providers, reply_markup: { inline_keyboard: rows } });
    }
    const prov = v.id && providerById(v.id);
    const provView = p => ({ text: A.provInfo({ name: esc(p.name), enabled: p.enabled }, (p.models || []).length), reply_markup: { inline_keyboard: [[btn(A.toggle(p.enabled !== false), { a: 'adm_ptog', id: p.id }), btn(A.refetch, { a: 'adm_pfetch', id: p.id })], [btn(A.del, { a: 'adm_pdelq', id: p.id })], back(tu, 'adm_provs')] } });
    if (v.a === 'adm_prov' && prov) return edit(provView(prov));
    if (v.a === 'adm_ptog' && prov) { prov.enabled = prov.enabled === false; saveDb(); changed.providers(); return edit(provView(prov)); }
    if (v.a === 'adm_pfetch' && prov) { try { const r = await mergeModels(prov); changed.providers(); const view = provView(prov); view.text += '\n\n' + A.fetched(r); return edit(view); } catch (e) { const view = provView(prov); view.text += '\n\n⚠️ ' + esc(e.message); return edit(view); } }
    if (v.a === 'adm_pdelq' && prov) return edit({ text: A.delQ(esc(prov.name)), reply_markup: { inline_keyboard: [[btn(A.yes, { a: 'adm_pdel', id: prov.id })], back(tu, 'adm_provs')] } });
    if (v.a === 'adm_pdel' && prov) { getDb().providers = getDb().providers.filter(x => x.id !== prov.id); saveDb(); changed.providers(); acc.log('provider.delete', account, { name: prov.name, platform: 'telegram' }); return edit({ text: A.deleted, reply_markup: { inline_keyboard: [back(tu, 'adm_provs')] } }); }
    if (v.a === 'adm_users') {
      const list = acc.users().slice().sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || (b.lastSeen || 0) - (a.lastSeen || 0)); const page = v.page || 0; const per = 8;
      const rows = list.slice(page * per, page * per + per).map(x => [btn(`${x.status === 'active' ? '🟢' : x.status === 'pending' ? '⏳' : '⛔️'} ${x.name} (@${x.username})${x.role === 'admin' ? ' 🛡' : ''}`, { a: 'adm_user', id: x.id })]);
      const nav = []; if (page > 0) nav.push(btn(TXT[tu.lang].prev, { a: 'adm_users', page: page - 1 })); nav.push(btn(TXT[tu.lang].back, { a: 'adm_home' })); if ((page + 1) * per < list.length) nav.push(btn(TXT[tu.lang].more, { a: 'adm_users', page: page + 1 }));
      rows.push(nav); return edit({ text: list.length ? A.users + ` (${list.length})` : A.noUsers, reply_markup: { inline_keyboard: rows } });
    }
    const target = v.id && acc.byId(v.id);
    const userView = x => { const pu = acc.publicUser(x, true); const r = []; if (x.id !== account.id) r.push(x.status === 'active' ? btn(A.ban, { a: 'adm_ust', id: x.id, st: 'banned' }) : btn(x.status === 'pending' ? A.approve : A.unban, { a: 'adm_ust', id: x.id, st: 'active' })); return { text: A.userInfo({ name: esc(pu.name), username: esc(pu.username), role: pu.role, status: pu.status, today: pu.today }), reply_markup: { inline_keyboard: [r, back(tu, 'adm_users')].filter(x => x.length) } }; };
    if (v.a === 'adm_user' && target) return edit(userView(target));
    if (v.a === 'adm_ust' && target && target.id !== account.id) { target.status = v.st; saveDb(); if (v.st !== 'active') acc.emit('logout', c => c.uid === target.id); acc.log('user.update', account, { target: target.username, status: v.st, platform: 'telegram' }); return edit(userView(target)); }
  }
  async function broadcast(text) {
    let sent = 0;
    for (const x of acc.users()) {
      if (!x.tgId || x.status !== 'active') continue;
      try { await sendHtml(x.tgId, '📣 ' + esc(text)); sent++; } catch { }
      await new Promise(r => setTimeout(r, 50));
    }
    return { sent };
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
      await tg('setMyCommands', { commands: [{ command: 'new', description: 'گفتگوی جدید · New chat' }, { command: 'model', description: 'انتخاب مدل · Choose model' }, { command: 'image', description: 'ساخت تصویر · Generate image' }, { command: 'imodel', description: 'مدل تصویر · Image model' }, { command: 'lang', description: 'زبان · Language' }, { command: 'help', description: 'راهنما · Help' }, { command: 'admin', description: 'پنل مدیریت · Admin' }] }).catch(() => { });
      loop(st.loopId);
      console.log(`  ✈️  Telegram bot @${me.username} is running`);
    } catch (e) { st.running = false; st.error = e.message; }
    return status();
  }
  function stop() { st.running = false; st.loopId++; try { st.ctrl && st.ctrl.abort(); } catch { } }
  function status() {
    const c = cfg();
    return { enabled: !!c.enabled, hasToken: !!c.token, token: c.token ? c.token.slice(0, 6) + '••••' + c.token.slice(-4) : '', access: c.access, apiBase: c.apiBase || '', running: st.running, username: st.username, error: st.error, startedAt: st.startedAt, linked: acc.users().filter(x => x.tgId).length };
  }
  async function configure(b) {
    const c = cfg();
    if (typeof b.token === 'string' && !b.token.includes('••')) c.token = b.token.trim();
    if (['accounts', 'open'].includes(b.access)) c.access = b.access;
    if (typeof b.apiBase === 'string') c.apiBase = b.apiBase.trim();
    if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
    saveDb();
    return start();
  }
  return { start, stop, status, configure, broadcast };
};
