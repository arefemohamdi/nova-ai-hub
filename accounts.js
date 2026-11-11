// Nova AI Hub — accounts, sessions, quotas, usage stats and live events (shared by web, desktop, Android and the Telegram bot)
'use strict';
const crypto = require('crypto');

const PLATFORMS = ['web', 'windows', 'android', 'telegram'];
const today = () => new Date().toISOString().slice(0, 10);

module.exports = function createAccounts({ getDb, saveDb, uid }) {
  const db = () => {
    const d = getDb();
    d.users = d.users || []; d.sessions = d.sessions || {}; d.usage = d.usage || {}; d.activity = d.activity || [];
    d.config = Object.assign({ registration: 'closed', defaultQuota: { msgs: 0, images: 0, videos: 0 }, announcement: '', maintenance: false, allowUserCode: false }, d.config || {});
    d.config.defaultQuota = Object.assign({ msgs: 0, images: 0, videos: 0 }, d.config.defaultQuota || {});
    return d;
  };

  // ---------- passwords
  const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
  function setPassword(u, pw) { u.salt = crypto.randomBytes(12).toString('hex'); u.passHash = hash(pw, u.salt); }
  function checkPassword(u, pw) {
    if (!u || !u.passHash) return false;
    const a = Buffer.from(hash(pw, u.salt), 'hex'), b = Buffer.from(u.passHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const validUsername = s => /^[a-zA-Z0-9_.\-]{3,32}$/.test(String(s || ''));

  // ---------- users
  const users = () => db().users;
  const byId = id => users().find(u => u.id === id);
  const byName = n => users().find(u => u.username.toLowerCase() === String(n || '').toLowerCase());
  const byTg = tgId => users().find(u => u.tgId && String(u.tgId) === String(tgId));
  const setupNeeded = () => !users().some(u => u.role === 'admin');

  function createUser({ username, password, name, role = 'user', status = 'active', tgId, tgUsername }) {
    if (!validUsername(username)) throw new Error('Username: 3-32 letters, digits, _ . -');
    if (byName(username)) throw new Error('This username is taken');
    if (password !== undefined && String(password).length < 6) throw new Error('Password must be at least 6 characters');
    const u = { id: uid('u_'), username: String(username), name: name || username, role, status, quota: null, allowedModels: null, createdAt: Date.now(), lastSeen: null, platforms: {}, prefs: {}, totals: { msgs: 0, images: 0, videos: 0 } };
    if (password) setPassword(u, password);
    if (tgId) { u.tgId = String(tgId); u.tgUsername = tgUsername || ''; }
    users().push(u); saveDb();
    log('user.create', null, { target: u.username, role, status });
    return u;
  }
  function publicUser(u, full) {
    if (!u) return null;
    const o = { id: u.id, username: u.username, name: u.name, role: u.role, status: u.status, createdAt: u.createdAt, lastSeen: u.lastSeen, platforms: u.platforms || {}, tgLinked: !!u.tgId, tgUsername: u.tgUsername || '', prefs: u.prefs || {} };
    if (full) Object.assign(o, { quota: u.quota, allowedModels: u.allowedModels, totals: u.totals || {}, today: usageToday(u), tgId: u.tgId || '', hasPassword: !!u.passHash });
    return o;
  }
  function deleteUser(id) {
    const d = db(); d.users = d.users.filter(u => u.id !== id);
    for (const [k, s] of Object.entries(d.sessions)) if (s.uid === id) delete d.sessions[k];
    saveDb(); emit('logout', x => x.uid === id);
  }

  // ---------- sessions (token is returned once; only its hash is stored)
  const th = t => crypto.createHash('sha256').update(String(t)).digest('hex');
  function createSession(u, platform, ua) {
    const token = crypto.randomBytes(24).toString('hex');
    db().sessions[th(token)] = { id: uid('s_'), uid: u.id, platform: PLATFORMS.includes(platform) ? platform : 'web', ua: String(ua || '').slice(0, 160), createdAt: Date.now(), lastSeen: Date.now() };
    saveDb(); return token;
  }
  function sessionFromReq(req) {
    const h = req.headers['authorization'] || '';
    const m = h.startsWith('Bearer ') ? h.slice(7) : ((req.headers.cookie || '').match(/nova_sid=([a-f0-9]+)/) || [])[1];
    if (!m) return null;
    const s = db().sessions[th(m)]; if (!s) return null;
    const u = byId(s.uid); if (!u) return null;
    return { s, u, key: th(m) };
  }
  function touch(ctx, platform) {
    const now = Date.now(); const p = PLATFORMS.includes(platform) ? platform : ctx.s.platform;
    if (now - (ctx.s.lastSeen || 0) > 60000 || ctx.s.platform !== p) { ctx.s.lastSeen = now; ctx.s.platform = p; ctx.u.lastSeen = now; ctx.u.platforms = ctx.u.platforms || {}; ctx.u.platforms[p] = now; saveDb(); }
  }
  function seen(u, platform) { const now = Date.now(); u.lastSeen = now; u.platforms = u.platforms || {}; u.platforms[platform] = now; }
  function endSession(key) { delete db().sessions[key]; saveDb(); }
  function listSessions() {
    return Object.entries(db().sessions).map(([k, s]) => { const u = byId(s.uid); return { key: k.slice(0, 16), id: s.id, user: u ? u.username : '?', name: u ? u.name : '', platform: s.platform, ua: s.ua, createdAt: s.createdAt, lastSeen: s.lastSeen }; }).sort((a, b) => b.lastSeen - a.lastSeen);
  }
  function revokeSession(id) { const d = db(); for (const [k, s] of Object.entries(d.sessions)) if (s.id === id) { delete d.sessions[k]; emit('logout', x => x.sid === id); } saveDb(); }

  // ---------- quotas & usage
  function quotaOf(u) { return Object.assign({}, db().config.defaultQuota, u.quota || {}); }
  function usageToday(u) { const d = db().usage[today()]; return (d && d.users && d.users[u.id]) || { msgs: 0, images: 0, videos: 0 }; }
  const KIND = { msg: 'msgs', image: 'images', video: 'videos' };
  // throws when the user may not do this; records it otherwise
  function consume(u, kind, platform, model) {
    if (!u) throw new Error('auth');
    if (u.status !== 'active') throw new Error(u.status === 'pending' ? 'Your account is waiting for approval' : 'Your account is disabled');
    if (db().config.maintenance && u.role !== 'admin') throw new Error('The service is under maintenance. Please try again later.');
    if (model && u.role !== 'admin' && Array.isArray(u.allowedModels) && u.allowedModels.length && !u.allowedModels.includes(model)) throw new Error('This model is not available for your account');
    const k = KIND[kind]; const lim = u.role === 'admin' ? 0 : Number(quotaOf(u)[k]) || 0;
    const day = today(); const d = db().usage[day] = db().usage[day] || { msgs: 0, images: 0, videos: 0, platforms: {}, models: {}, users: {} };
    const uu = d.users[u.id] = d.users[u.id] || { msgs: 0, images: 0, videos: 0 };
    if (lim && uu[k] >= lim) throw new Error(`Daily limit reached (${lim})`);
    uu[k]++; d[k]++;
    const pl = d.platforms[platform] = d.platforms[platform] || { msgs: 0, images: 0, videos: 0 }; pl[k]++;
    if (model) d.models[model] = (d.models[model] || 0) + 1;
    u.totals = u.totals || { msgs: 0, images: 0, videos: 0 }; u.totals[k] = (u.totals[k] || 0) + 1;
    seen(u, platform);
    const keys = Object.keys(db().usage).sort(); while (keys.length > 90) delete db().usage[keys.shift()];
    saveDb();
  }
  function modelAllowed(u, key) { return u.role === 'admin' || !Array.isArray(u.allowedModels) || !u.allowedModels.length || u.allowedModels.includes(key); }

  // ---------- activity log
  function log(type, u, data) {
    const a = db().activity; a.unshift({ t: Date.now(), type, user: u ? u.username : null, data: data || null });
    if (a.length > 300) a.length = 300; saveDb();
  }

  // ---------- overview for the dashboard
  function overview() {
    const d = db(); const day = today(); const t = d.usage[day] || { msgs: 0, images: 0, videos: 0, platforms: {}, models: {}, users: {} };
    const days = []; for (let i = 13; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const x = d.usage[k] || {}; days.push({ day: k, msgs: x.msgs || 0, images: x.images || 0, videos: x.videos || 0 }); }
    const models = {}; Object.values(d.usage).forEach(x => Object.entries(x.models || {}).forEach(([m, n]) => models[m] = (models[m] || 0) + n));
    const since = Date.now() - 864e5;
    const platformsActive = {}; PLATFORMS.forEach(p => platformsActive[p] = d.users.filter(u => (u.platforms || {})[p] > since).length);
    return {
      users: { total: d.users.length, admins: d.users.filter(u => u.role === 'admin').length, active24h: d.users.filter(u => u.lastSeen > since).length, pending: d.users.filter(u => u.status === 'pending').length, banned: d.users.filter(u => u.status === 'banned').length, telegram: d.users.filter(u => u.tgId).length },
      today: { msgs: t.msgs, images: t.images, videos: t.videos, platforms: t.platforms },
      platformsActive, days,
      topModels: Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => ({ key, n })),
      online: onlineCount(), sessions: Object.keys(d.sessions).length
    };
  }

  // ---------- live events (Server-Sent Events): every client updates instantly when something changes
  const clients = new Set();
  function subscribe(req, res, ctx, platform) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const c = { res, uid: ctx.u.id, sid: ctx.s.id, role: ctx.u.role, platform };
    clients.add(c); res.write('event: hello\ndata: {}\n\n');
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { } }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(c); });
  }
  function emit(type, filter, data) {
    for (const c of clients) { if (filter && !filter(c)) continue; try { c.res.write(`event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`); } catch { } }
  }
  function onlineCount() { const o = {}; for (const c of clients) o[c.platform] = (o[c.platform] || 0) + 1; return o; }

  return { db, users, byId, byName, byTg, setupNeeded, createUser, publicUser, deleteUser, setPassword, checkPassword, validUsername, createSession, sessionFromReq, touch, seen, endSession, listSessions, revokeSession, quotaOf, usageToday, consume, modelAllowed, log, overview, subscribe, emit, PLATFORMS };
};
