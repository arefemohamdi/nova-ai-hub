// Nova AI Hub — multi-provider AI web app (zero dependencies, Node 18+)
// Run: node server.js   then open http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT !== undefined && process.env.PORT !== '' ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '127.0.0.1';
const os = require('os');
const { spawn } = require('child_process');
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const PRESETS = require('./presets.js');

// ---------------------------------------------------------------- DB
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
function defaultDb() {
  return {
    version: 1,
    settings: { lang: 'fa', theme: 'dark', defaultModel: null, systemPrompt: '', temperature: 0.7 },
    providers: [{
      id: 'pollinations', preset: 'pollinations', name: 'Pollinations (Free)', type: 'pollinations',
      baseUrl: 'https://text.pollinations.ai/openai', apiKey: '', headers: {}, enabled: true, builtin: true,
      models: [], createdAt: Date.now()
    }],
    chats: [],
    media: [],
    prompts: [
      { id: uid('p_'), title: 'مترجم حرفه‌ای', text: 'You are a professional translator between Persian and English. Translate accurately and naturally.' },
      { id: uid('p_'), title: 'برنامه‌نویس ارشد', text: 'You are a senior software engineer. Write clean, complete, production-ready code. When you create files, start each code block with ```lang path=relative/file/path' },
      { id: uid('p_'), title: 'Prompt Engineer (Image)', text: 'Turn the user idea into a vivid, detailed English prompt for an image generation model. Output only the prompt.' }
    ]
  };
}
let db;
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { db = defaultDb(); saveDb(); }
  db.settings = Object.assign(defaultDb().settings, db.settings || {});
  db.chats = db.chats || []; db.media = db.media || []; db.prompts = db.prompts || [];
}
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}
loadDb();
const acc = require('./accounts')({ getDb: () => db, saveDb, uid });
const VERSION = (() => { try { return require('./package.json').version; } catch { return '1.2.0'; } })();

// ---------------------------------------------------------------- capabilities
const RX = {
  video: /(sora|veo|kling|wan-?2|wan2\.|wanx-?v|hailuo|minimax.*video|seedance|runway|gen-?3|gen-?4|luma|dream-?machine|ray-?2|cogvideo|hunyuan-?video|ltx-?video|mochi|pika|text-to-video|t2v|i2v|video)/i,
  image: /(dall-?e|gpt-image|imagen|flux|stable-?diffusion|sdxl|sd-?3|sd3|midjourney|seedream|cogview|wanx(?!-?v)|kolors|playground-v|ideogram|recraft|hidream|qwen-image|image-gen|-image(-|$|:)|image-preview|grok-2-image|aurora|kontext|nano-?banana|turbo$|^zimage|gptimage|text-to-image|t2i)/i,
  vision: /(vision|gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o3|o4|claude-3|claude-(sonnet|opus|haiku)|claude-.*-4|gemini|gemma-3|pixtral|llava|qwen.*vl|-vl|vl-|grok-4|grok.*vision|kimi.*(vl|vision|k2\.5)|llama-4|llama-3\.2-.*vision|mistral-(medium|small)-3|internvl|minicpm-v|glm-4\.?\dv|glm-4v)/i,
  other: /(embed|embedding|whisper|tts|transcribe|moderation|rerank|audio|speech|search-preview|realtime|similarity|davinci-002|babbage)/i
};
function detectCaps(id, meta = {}) {
  const caps = { chat: true, vision: false, image: false, video: false };
  const s = String(id);
  if (meta.output && meta.output.length) {
    caps.image = meta.output.includes('image');
    caps.video = meta.output.includes('video');
    caps.chat = meta.output.includes('text');
  } else {
    if (RX.video.test(s)) { caps.video = true; caps.chat = false; }
    else if (RX.image.test(s)) { caps.image = true; caps.chat = /gemini|image-preview|nano-?banana|gpt-5/i.test(s); }
  }
  if (meta.input && meta.input.length) caps.vision = meta.input.includes('image');
  else caps.vision = RX.vision.test(s) && !caps.video && !(caps.image && !caps.chat);
  if (meta.methods) {
    if (meta.methods.includes('predictLongRunning')) { caps.video = true; caps.chat = false; }
    if (meta.methods.includes('predict') && /imagen/i.test(s)) { caps.image = true; caps.chat = false; }
  }
  if (meta.kind) {
    if (meta.kind === 'image') { caps.image = true; caps.chat = false; }
    if (meta.kind === 'video') { caps.video = true; caps.chat = false; }
  }
  if (RX.other.test(s) && !caps.image && !caps.video) { caps.chat = false; caps.other = true; }
  return caps;
}

// ---------------------------------------------------------------- helpers
function providerById(id) { return db.providers.find(p => p.id === id); }
function maskKey(k) { if (!k) return ''; return k.length <= 8 ? '••••' : k.slice(0, 4) + '••••' + k.slice(-4); }
function publicProvider(p) { return Object.assign({}, p, { apiKey: maskKey(p.apiKey), hasKey: !!p.apiKey }); }
function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }
function authHeaders(p, extra = {}) {
  const h = Object.assign({}, extra);
  if (p.type === 'anthropic') {
    if (p.apiKey) h['x-api-key'] = p.apiKey;
    h['anthropic-version'] = '2023-06-01';
  } else if (p.type === 'gemini') {
    if (p.apiKey) h['x-goog-api-key'] = p.apiKey;
  } else if (p.apiKey) h['Authorization'] = 'Bearer ' + p.apiKey;
  if (p.preset === 'openrouter') { h['HTTP-Referer'] = 'https://nova-ai-hub.local'; h['X-Title'] = 'Nova AI Hub'; }
  return Object.assign(h, p.headers || {});
}
async function jfetch(url, opts = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || (typeof data === 'string' ? data.slice(0, 400) : JSON.stringify(data).slice(0, 400));
      const e = new Error(`HTTP ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`); e.status = r.status; throw e;
    }
    return data;
  } finally { clearTimeout(t); }
}
function splitDataUrl(d) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(d || '');
  return m ? { mime: m[1], data: m[2] } : null;
}
function saveMedia(buf, ext, meta) {
  const id = uid('m_');
  const file = id + '.' + ext;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  const item = Object.assign({ id, file, url: '/media/' + file, createdAt: Date.now() }, meta);
  db.media.unshift(item); saveDb();
  return item;
}
async function saveFromUrlOrB64(src, meta, headers) {
  if (src.startsWith('data:')) {
    const s = splitDataUrl(src);
    return saveMedia(Buffer.from(s.data, 'base64'), (s.mime.split('/')[1] || 'png').replace('jpeg', 'jpg'), meta);
  }
  const r = await fetch(src, { headers: headers || {} });
  if (!r.ok) throw new Error('Download failed: HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = ct.includes('mp4') || meta.type === 'video' ? 'mp4' : ct.includes('webp') ? 'webp' : ct.includes('jpeg') ? 'jpg' : 'png';
  return saveMedia(buf, ext, meta);
}

// ---------------------------------------------------------------- model listing
async function listModels(p) {
  const base = trimSlash(p.baseUrl);
  if (p.type === 'pollinations') {
    const [txt, img] = await Promise.all([
      jfetch('https://text.pollinations.ai/models').catch(() => []),
      jfetch('https://image.pollinations.ai/models').catch(() => ['flux', 'turbo'])
    ]);
    const out = [];
    (Array.isArray(txt) ? txt : []).forEach(m => out.push({ id: m.name, name: m.description || m.name, caps: detectCaps(m.name, { input: m.input_modalities, output: m.output_modalities }), free: true }));
    [...new Set(['flux', 'turbo', 'kontext', ...(Array.isArray(img) ? img : []).map(m => typeof m === 'string' ? m : m.name)])].forEach(n => { out.push({ id: n, name: n + ' (image)', caps: { chat: false, vision: false, image: true, video: false }, free: true }); });
    return out;
  }
  if (p.type === 'anthropic') {
    const d = await jfetch(base + '/models?limit=1000', { headers: authHeaders(p) });
    return (d.data || []).map(m => ({ id: m.id, name: m.display_name || m.id, caps: { chat: true, vision: true, image: false, video: false } }));
  }
  if (p.type === 'gemini') {
    const d = await jfetch(base + '/models?pageSize=1000', { headers: authHeaders(p) });
    return (d.models || []).map(m => {
      const id = m.name.replace(/^models\//, '');
      return { id, name: m.displayName || id, caps: detectCaps(id, { methods: m.supportedGenerationMethods }) };
    }).filter(m => !/embedding|aqa|answer/.test(m.id));
  }
  // openai-compatible
  const d = await jfetch(base + '/models', { headers: authHeaders(p) });
  const arr = Array.isArray(d) ? d : (d.data || d.models || []);
  return arr.map(m => {
    const id = m.id || m.name || m.model;
    const arch = m.architecture || {};
    const meta = { input: arch.input_modalities, output: arch.output_modalities, kind: m.type === 'image' ? 'image' : m.type === 'video' ? 'video' : null };
    const free = isFreeModel(m, id);
    return { id, name: m.name || m.display_name || id, caps: detectCaps(id, meta), free, context: m.context_length || m.context_window };
  }).filter(m => m.id);
}

// a model is free when the provider says so: zero pricing, a free flag, or "free" in its id/name (OpenRouter style ":free")
function isFreeModel(m, id) {
  if (m.free === true || m.is_free === true || /^free$/i.test(m.tier || m.pricing_tier || '')) return true;
  const pr = m.pricing;
  if (pr && typeof pr === 'object') {
    const vals = ['prompt', 'completion', 'input', 'output', 'request', 'image'].map(k => pr[k]).filter(v => v !== undefined && v !== null && v !== '');
    if (vals.length && vals.every(v => Number(v) === 0)) return true;
  }
  return /(:|[-_ /(])free\b/i.test(String(id || '') + ' ' + String(m.name || ''));
}

// ---------------------------------------------------------------- chat streaming
function toOpenAIMessages(messages, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    const atts = m.attachments || [];
    let text = m.content || '';
    atts.filter(a => a.type === 'text').forEach(a => { text += `\n\n--- File: ${a.name} ---\n${a.text}`; });
    const imgs = atts.filter(a => a.type === 'image');
    if (imgs.length && m.role === 'user') {
      out.push({ role: 'user', content: [{ type: 'text', text }, ...imgs.map(a => ({ type: 'image_url', image_url: { url: a.dataUrl } }))] });
    } else out.push({ role: m.role, content: text });
  }
  return out;
}
async function* sseLines(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  if (buf.startsWith('data:')) yield buf.slice(5).trim();
}
async function errorFrom(resp) {
  const t = await resp.text();
  let msg = t;
  try { const j = JSON.parse(t); msg = (j.error && (j.error.message || JSON.stringify(j.error))) || j.message || t; } catch { }
  return new Error(`HTTP ${resp.status}: ${String(msg).slice(0, 500)}`);
}
async function streamChat(p, model, messages, opts, emit, signal) {
  const base = trimSlash(p.baseUrl);
  const temperature = opts.temperature;
  if (p.type === 'anthropic') {
    const sys = opts.system || undefined;
    const msgs = messages.map(m => {
      const atts = m.attachments || [];
      let text = m.content || '';
      atts.filter(a => a.type === 'text').forEach(a => { text += `\n\n--- File: ${a.name} ---\n${a.text}`; });
      const content = [];
      atts.filter(a => a.type === 'image' && m.role === 'user').forEach(a => { const s = splitDataUrl(a.dataUrl); if (s) content.push({ type: 'image', source: { type: 'base64', media_type: s.mime, data: s.data } }); });
      content.push({ type: 'text', text: text || ' ' });
      return { role: m.role, content };
    });
    const resp = await fetch(base + '/messages', { method: 'POST', signal, headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify({ model, max_tokens: opts.maxTokens || 8192, system: sys, messages: msgs, stream: true, temperature }) });
    if (!resp.ok) throw await errorFrom(resp);
    for await (const d of sseLines(resp)) {
      try {
        const j = JSON.parse(d);
        if (j.type === 'content_block_delta') {
          if (j.delta.text) emit({ delta: j.delta.text });
          if (j.delta.thinking) emit({ reasoning: j.delta.thinking });
        }
        if (j.type === 'message_delta' && j.usage) emit({ usage: j.usage });
        if (j.type === 'error') throw new Error(j.error && j.error.message);
      } catch (e) { if (e.message && !e.message.startsWith('Unexpected')) throw e; }
    }
    return;
  }
  if (p.type === 'gemini') {
    const contents = messages.map(m => {
      const parts = [];
      const atts = m.attachments || [];
      let text = m.content || '';
      atts.filter(a => a.type === 'text').forEach(a => { text += `\n\n--- File: ${a.name} ---\n${a.text}`; });
      parts.push({ text: text || ' ' });
      atts.filter(a => a.type === 'image').forEach(a => { const s = splitDataUrl(a.dataUrl); if (s) parts.push({ inline_data: { mime_type: s.mime, data: s.data } }); });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const body = { contents, generationConfig: { temperature } };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (/image/i.test(model)) body.generationConfig.responseModalities = ['TEXT', 'IMAGE'];
    const resp = await fetch(`${base}/models/${model}:streamGenerateContent?alt=sse`, { method: 'POST', signal, headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify(body) });
    if (!resp.ok) throw await errorFrom(resp);
    for await (const d of sseLines(resp)) {
      try {
        const j = JSON.parse(d);
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        for (const part of parts) {
          if (part.text) emit(part.thought ? { reasoning: part.text } : { delta: part.text });
          const inl = part.inlineData || part.inline_data;
          if (inl) { const item = saveMedia(Buffer.from(inl.data, 'base64'), (inl.mimeType || inl.mime_type || 'image/png').split('/')[1], { type: 'image', prompt: messages[messages.length - 1].content, model, provider: p.id, owner: opts.owner }); emit({ image: item.url }); }
        }
        if (j.usageMetadata) emit({ usage: j.usageMetadata });
      } catch { }
    }
    return;
  }
  // openai compatible + pollinations
  const body = { model, messages: toOpenAIMessages(messages, opts.system), stream: true };
  if (temperature != null && !/^(o\d|gpt-5)/.test(model)) body.temperature = temperature;
  if (p.preset === 'openrouter' && opts.wantsImage) body.modalities = ['image', 'text'];
  const url = (p.type === 'pollinations' ? 'https://text.pollinations.ai/openai' : base + '/chat/completions');
  const resp = await fetch(url, { method: 'POST', signal, headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify(body) });
  if (!resp.ok) throw await errorFrom(resp);
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) { // provider ignored stream
    const j = await resp.json();
    const msg = ((j.choices || [])[0] || {}).message || {};
    if (msg.reasoning_content || msg.reasoning) emit({ reasoning: msg.reasoning_content || msg.reasoning });
    if (msg.content) emit({ delta: msg.content });
    return;
  }
  for await (const d of sseLines(resp)) {
    if (d === '[DONE]') break;
    try {
      const j = JSON.parse(d);
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      const delta = ((j.choices || [])[0] || {}).delta || {};
      if (delta.reasoning_content || delta.reasoning) emit({ reasoning: delta.reasoning_content || delta.reasoning });
      if (delta.content) emit({ delta: delta.content });
      if (Array.isArray(delta.images)) for (const im of delta.images) {
        const u = im.image_url && im.image_url.url;
        if (u) { const item = await saveFromUrlOrB64(u, { type: 'image', prompt: messages[messages.length - 1].content, model, provider: p.id, owner: opts.owner }); emit({ image: item.url }); }
      }
      if (j.usage) emit({ usage: j.usage });
    } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  }
}

// ---------------------------------------------------------------- image generation
async function generateImage(p, model, prompt, o = {}) {
  const base = trimSlash(p.baseUrl);
  const n = Math.max(1, Math.min(4, Number(o.n) || 1));
  const size = o.size || '1024x1024';
  const [w, h] = size.split('x').map(Number);
  const meta = { type: 'image', prompt, model, provider: p.id, providerName: p.name, owner: o.owner };
  const results = [];
  if (p.type === 'pollinations') {
    for (let i = 0; i < n; i++) {
      const seed = Math.floor(Math.random() * 1e9);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${w}&height=${h}&nologo=true&seed=${seed}`;
      results.push(await saveFromUrlOrB64(url, meta));
    }
    return results;
  }
  if (p.type === 'gemini') {
    if (/imagen/i.test(model)) {
      const ar = w === h ? '1:1' : w > h ? '16:9' : '9:16';
      const d = await jfetch(`${base}/models/${model}:predict`, { method: 'POST', headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: n, aspectRatio: ar } }) }, 180000);
      for (const pr of d.predictions || []) results.push(saveMedia(Buffer.from(pr.bytesBase64Encoded, 'base64'), 'png', meta));
    } else {
      const d = await jfetch(`${base}/models/${model}:generateContent`, { method: 'POST', headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }, 180000);
      for (const part of (((d.candidates || [])[0] || {}).content || {}).parts || []) {
        const inl = part.inlineData || part.inline_data;
        if (inl) results.push(saveMedia(Buffer.from(inl.data, 'base64'), 'png', meta));
      }
    }
    if (!results.length) throw new Error('No image returned');
    return results;
  }
  if (p.type === 'anthropic') throw new Error('Claude models cannot generate images');
  // OpenRouter: image models go through chat/completions with modalities
  if (p.preset === 'openrouter') {
    const d = await jfetch(base + '/chat/completions', { method: 'POST', headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }) }, 180000);
    const imgs = ((((d.choices || [])[0] || {}).message || {}).images) || [];
    for (const im of imgs) results.push(await saveFromUrlOrB64(im.image_url.url, meta));
    if (!results.length) throw new Error('Model returned no image');
    return results;
  }
  const body = { model, prompt, n, size };
  if (/dall-e/.test(model)) body.response_format = 'b64_json';
  const d = await jfetch(base + '/images/generations', { method: 'POST', headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify(body) }, 240000);
  for (const it of d.data || d.images || []) {
    if (it.b64_json) results.push(saveMedia(Buffer.from(it.b64_json, 'base64'), 'png', meta));
    else if (it.url) results.push(await saveFromUrlOrB64(it.url, meta));
  }
  if (!results.length) throw new Error('No image returned');
  return results;
}

// ---------------------------------------------------------------- video generation (async jobs)
const jobs = new Map();
async function startVideo(p, model, prompt, o = {}) {
  const base = trimSlash(p.baseUrl);
  const job = { id: uid('v_'), status: 'queued', progress: 0, prompt, model, provider: p.id, createdAt: Date.now(), owner: o.owner };
  jobs.set(job.id, job);
  const meta = { type: 'video', prompt, model, provider: p.id, providerName: p.name, owner: o.owner };
  const run = async () => {
    try {
      if (p.type === 'gemini') {
        const d = await jfetch(`${base}/models/${model}:predictLongRunning`, { method: 'POST', headers: authHeaders(p, { 'content-type': 'application/json' }), body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: o.aspect || '16:9' } }) });
        job.status = 'processing';
        let op = d;
        while (!op.done) {
          await new Promise(r => setTimeout(r, 8000));
          op = await jfetch(`${base}/${d.name}`, { headers: authHeaders(p) });
          job.progress = Math.min(95, job.progress + 5);
        }
        if (op.error) throw new Error(op.error.message);
        const sample = (((op.response || {}).generateVideoResponse || {}).generatedSamples || [])[0];
        const uri = sample && sample.video && sample.video.uri;
        if (!uri) throw new Error('No video returned');
        job.result = await saveFromUrlOrB64(uri, meta, authHeaders(p));
      } else if (p.type === 'openai' || p.type === 'custom') {
        const fd = new FormData();
        fd.append('model', model); fd.append('prompt', prompt);
        if (o.seconds) fd.append('seconds', String(o.seconds));
        if (o.size) fd.append('size', o.size);
        const d = await jfetch(base + '/videos', { method: 'POST', headers: authHeaders(p), body: fd });
        job.status = 'processing';
        let v = d;
        while (!['completed', 'failed', 'succeeded', 'error'].includes(v.status)) {
          await new Promise(r => setTimeout(r, 6000));
          v = await jfetch(`${base}/videos/${d.id}`, { headers: authHeaders(p) });
          if (v.progress != null) job.progress = v.progress;
        }
        if (v.status === 'failed' || v.status === 'error') throw new Error((v.error && v.error.message) || 'Video generation failed');
        const url = (v.output && (v.output.url || v.output[0])) || v.url || `${base}/videos/${d.id}/content`;
        job.result = await saveFromUrlOrB64(url, meta, authHeaders(p));
      } else throw new Error('This provider has no video API wired yet. Use a Gemini (Veo) or OpenAI (Sora) compatible provider.');
      job.status = 'completed'; job.progress = 100;
    } catch (e) { job.status = 'failed'; job.error = e.message; }
  };
  run();
  return job;
}

// ---------------------------------------------------------------- free models catalog
let freeCache = { t: 0, data: null };
async function freeCatalog() {
  if (freeCache.data && Date.now() - freeCache.t < 10 * 60 * 1000) return freeCache.data;
  const [or, pt, pi] = await Promise.all([
    jfetch('https://openrouter.ai/api/v1/models').catch(() => ({ data: [] })),
    jfetch('https://text.pollinations.ai/models').catch(() => []),
    jfetch('https://image.pollinations.ai/models').catch(() => ['flux', 'turbo'])
  ]);
  const openrouter = (or.data || []).filter(m => m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
    .map(m => ({ id: m.id, name: m.name, context: m.context_length, description: (m.description || '').slice(0, 220), caps: detectCaps(m.id, { input: (m.architecture || {}).input_modalities, output: (m.architecture || {}).output_modalities }) }));
  const pollinations = [
    ...(Array.isArray(pt) ? pt : []).map(m => ({ id: m.name, name: m.description || m.name, caps: detectCaps(m.name, { input: m.input_modalities, output: m.output_modalities }), noKey: true })),
    ...[...new Set(['flux', 'turbo', 'kontext', ...(Array.isArray(pi) ? pi : []).map(m => typeof m === 'string' ? m : m.name)])].map(n => { return { id: n, name: n + ' — image', caps: { chat: false, vision: false, image: true, video: false }, noKey: true }; })
  ];
  freeCache = { t: Date.now(), data: { openrouter, pollinations, freeTier: PRESETS.filter(x => x.freeTier).map(x => ({ preset: x.id, name: x.name, note: x.freeTier, keyUrl: x.keyUrl })) } };
  return freeCache.data;
}


// ---------------------------------------------------------------- workspace (VS Code-like folder access)
const LOCAL_ONLY = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const FS_ENABLED = process.env.DISABLE_FS !== '1'; // folder + terminal access is for the admin account only (checked per request)
const WS_IGNORE = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'venv', '__pycache__', '.idea', '.gradle', '.DS_Store', 'Thumbs.db', '.cache', 'target', 'out']);
function wsRoot() { return db.settings.workspaceRoot || null; }
function wsResolve(rel) {
  const root = wsRoot(); if (!root) throw new Error('No folder is open');
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const p = path.resolve(root, clean || '.');
  if (p !== root && !p.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) throw new Error('Path is outside the workspace');
  return p;
}
function wsTree(dir, rel = '', depth = 0, counter = { n: 0 }) {
  if (depth > 8 || counter.n > 5000) return [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  ents = ents.filter(e => !WS_IGNORE.has(e.name)).sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  return ents.map(e => {
    counter.n++;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) return { name: e.name, path: r, type: 'dir', children: wsTree(path.join(dir, e.name), r, depth + 1, counter) };
    let size = 0; try { size = fs.statSync(path.join(dir, e.name)).size; } catch { }
    return { name: e.name, path: r, type: 'file', size };
  });
}
function wsState() {
  const root = wsRoot();
  if (!root || !fs.existsSync(root)) return { enabled: FS_ENABLED, root: null, recent: db.settings.recentFolders || [] };
  return { enabled: FS_ENABLED, root, name: path.basename(root) || root, sep: path.sep, tree: wsTree(root), recent: db.settings.recentFolders || [] };
}
function listDrives() {
  if (process.platform !== 'win32') return ['/'];
  const out = []; for (const c of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { try { fs.accessSync(c + ':\\'); out.push(c + ':\\'); } catch { } }
  return out;
}
function wsWrite(rel, content) {
  const p = wsResolve(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existed = fs.existsSync(p);
  fs.writeFileSync(p, content == null ? '' : content);
  return { path: rel, created: !existed };
}
async function handleWs(parts, M, req, res, u) {
  if (!FS_ENABLED) return send(res, 403, { error: 'Folder access is disabled on this server (DISABLE_FS=1).' });
  const a = parts[1] || '';
  if (!a && M === 'GET') return send(res, 200, wsState());
  if (a === 'open' && M === 'POST') {
    const b = await readBody(req);
    let p = String(b.path || '').trim(); if (!p) return send(res, 400, { error: 'Path required' });
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    p = path.resolve(p);
    if (b.create) fs.mkdirSync(p, { recursive: true });
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return send(res, 400, { error: 'Folder not found: ' + p });
    db.settings.workspaceRoot = p;
    db.settings.recentFolders = [p, ...(db.settings.recentFolders || []).filter(x => x !== p)].slice(0, 8);
    saveDb(); return send(res, 200, wsState());
  }
  if (a === 'close' && M === 'POST') { db.settings.workspaceRoot = null; saveDb(); return send(res, 200, wsState()); }
  if (a === 'browse' && M === 'GET') {
    let p = u.searchParams.get('path') || os.homedir();
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    p = path.resolve(p);
    let dirs = [];
    try { dirs = fs.readdirSync(p, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((x, y) => x.localeCompare(y)); }
    catch (e) { return send(res, 400, { error: e.message }); }
    return send(res, 200, { path: p, parent: path.dirname(p) !== p ? path.dirname(p) : null, dirs, home: os.homedir(), drives: listDrives(), sep: path.sep });
  }
  if (a === 'file') {
    if (M === 'GET') {
      const p = wsResolve(u.searchParams.get('path'));
      const st = fs.statSync(p);
      if (st.size > 3 * 1024 * 1024) return send(res, 413, { error: 'File is too large to open (>3MB)' });
      const buf = fs.readFileSync(p);
      const binary = buf.subarray(0, 8000).includes(0);
      return send(res, 200, { path: u.searchParams.get('path'), content: binary ? '' : buf.toString('utf8'), binary, size: st.size });
    }
    if (M === 'PUT') { const b = await readBody(req); return send(res, 200, wsWrite(b.path, b.content)); }
    if (M === 'DELETE') { const p = wsResolve(u.searchParams.get('path')); if (p === wsRoot()) throw new Error('Refusing to delete the workspace root'); fs.rmSync(p, { recursive: true, force: true }); return send(res, 200, { ok: true }); }
  }
  if (a === 'mkdir' && M === 'POST') { const b = await readBody(req); fs.mkdirSync(wsResolve(b.path), { recursive: true }); return send(res, 200, { ok: true }); }
  if (a === 'rename' && M === 'POST') { const b = await readBody(req); const to = wsResolve(b.to); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(wsResolve(b.from), to); return send(res, 200, { ok: true }); }
  if (a === 'apply' && M === 'POST') {
    const b = await readBody(req); const results = [];
    for (const f of b.files || []) { try { results.push(Object.assign({ ok: true }, wsWrite(f.path, f.content))); } catch (e) { results.push({ path: f.path, ok: false, error: e.message }); } }
    for (const d of b.deletes || []) { try { const p = wsResolve(d); if (p !== wsRoot()) fs.rmSync(p, { recursive: true, force: true }); results.push({ path: d, ok: true, deleted: true }); } catch (e) { results.push({ path: d, ok: false, error: e.message }); } }
    return send(res, 200, { results, tree: wsTree(wsRoot()) });
  }
  if (a === 'exec' && M === 'POST') {
    const b = await readBody(req); const cwd = wsResolve(b.cwd || '');
    return new Promise(resolve => {
      const isWin = process.platform === 'win32';
      const ch = spawn(isWin ? 'cmd.exe' : '/bin/sh', isWin ? ['/d', '/s', '/c', b.cmd] : ['-c', b.cmd], { cwd, env: process.env });
      let out = ''; const add = d => { out += d.toString(); if (out.length > 400000) out = out.slice(-400000); };
      ch.stdout.on('data', add); ch.stderr.on('data', add);
      const timer = setTimeout(() => { ch.kill(); out += '\n[timeout after 120s]'; }, 120000);
      ch.on('close', code => { clearTimeout(timer); send(res, 200, { code, output: out, tree: wsTree(wsRoot()) }); resolve(); });
      ch.on('error', e => { clearTimeout(timer); send(res, 200, { code: -1, output: e.message }); resolve(); });
    });
  }
  return send(res, 404, { error: 'Unknown workspace endpoint' });
}

// ---------------------------------------------------------------- HTTP plumbing
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function serveStatic(res, dir, rel) {
  const fp = path.normalize(path.join(dir, rel));
  if (!fp.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      if (dir === PUBLIC_DIR) return serveStatic(res, dir, 'index.html');
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control': dir === MEDIA_DIR ? 'public, max-age=31536000' : 'no-cache' });
    fs.createReadStream(fp).pipe(res);
  });
}
// ---------------------------------------------------------------- accounts / auth
const SETUP_CODE = APP_PASSWORD || (LOCAL_ONLY ? '' : crypto.randomBytes(4).toString('hex'));
const platformOf = req => { const h = String(req.headers['x-nova-client'] || (String(req.url).match(/[?&]client=([a-z]+)/) || [])[1] || '').toLowerCase(); return ['web', 'windows', 'android'].includes(h) ? h : 'web'; };
function setSessionCookie(res, token) { res.setHeader('Set-Cookie', `nova_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`); }
// When an older single-user install upgrades, everything that existed becomes the admin's
function adoptLegacyData(u) {
  db.chats.forEach(c => { if (!c.owner) c.owner = u.id; });
  db.media.forEach(m => { if (!m.owner) m.owner = u.id; });
  db.prompts.forEach(p => { if (!p.owner) p.owner = u.id; });
  const tg = db.telegramUsers || {}; Object.values(tg).forEach(x => { if (x.authed && !x.uid && Object.keys(tg).length === 1) { x.uid = u.id; u.tgId = x.id; u.tgUsername = x.username; } });
  saveDb();
}
const isAdmin = u => u && u.role === 'admin';
const visibleModels = (u, p) => (p.models || []).filter(m => isAdmin(u) || (m.enabled !== false && acc.modelAllowed(u, p.id + '::' + m.id)));
function providersFor(u) {
  return db.providers.filter(p => isAdmin(u) || p.enabled !== false).map(p => {
    const o = publicProvider(p);
    if (!isAdmin(u)) { o.apiKey = ''; o.baseUrl = ''; o.headers = {}; o.models = visibleModels(u, p); }
    return o;
  }).filter(p => isAdmin(u) || p.models.length);
}
function userSettings(u) { return Object.assign({}, db.settings, { telegram: undefined, workspaceRoot: isAdmin(u) ? db.settings.workspaceRoot : undefined }, u.prefs || {}); }
const changed = {
  providers: () => acc.emit('providers'),
  chats: uidd => acc.emit('chats', c => c.uid === uidd),
  config: () => acc.emit('config', null, publicConfig()),
};
function publicConfig() { const c = acc.db().config; return { announcement: c.announcement, maintenance: c.maintenance, registration: c.registration }; }
async function addProvider(b) {
  const preset = PRESETS.find(x => x.id === b.preset) || PRESETS.find(x => x.id === 'custom');
  const prov = { id: uid('pv_'), preset: preset.id, name: b.name || preset.name, type: b.type || preset.type, baseUrl: trimSlash(b.baseUrl || preset.baseUrl), apiKey: (b.apiKey || '').trim(), headers: b.headers || {}, enabled: true, models: [], createdAt: Date.now() };
  db.providers.push(prov); saveDb();
  let fetched = null, error = null;
  if (b.autoFetch !== false && (prov.apiKey || preset.noKey)) { try { fetched = await mergeModels(prov); } catch (e) { error = e.message; } }
  changed.providers();
  return { prov, fetched, error };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (!p.startsWith('/api/')) {
      if (p.startsWith('/media/')) return serveStatic(res, MEDIA_DIR, decodeURIComponent(p.slice(7)));
      return serveStatic(res, PUBLIC_DIR, p === '/' ? 'index.html' : decodeURIComponent(p.slice(1)));
    }
    const M = req.method;
    // ---- public auth endpoints
    if (p === '/api/auth/info' && M === 'GET') {
      return send(res, 200, Object.assign({ setupNeeded: acc.setupNeeded(), setupCodeRequired: acc.setupNeeded() && !!SETUP_CODE, version: VERSION, lang: db.settings.lang }, publicConfig()));
    }
    if (p === '/api/auth/setup' && M === 'POST') {
      if (!acc.setupNeeded()) return send(res, 400, { error: 'Admin already exists' });
      const b = await readBody(req);
      if (SETUP_CODE && String(b.code || '').trim() !== SETUP_CODE) return send(res, 403, { error: 'Wrong setup code' });
      const usr = acc.createUser({ username: b.username, password: b.password, name: b.name, role: 'admin' });
      adoptLegacyData(usr);
      const token = acc.createSession(usr, platformOf(req), req.headers['user-agent']); setSessionCookie(res, token);
      return send(res, 200, { ok: true, token });
    }
    if (p === '/api/auth/login' && M === 'POST') {
      const b = await readBody(req);
      const usr = acc.byName(b.username);
      if (!acc.checkPassword(usr, b.password)) { await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: 'Wrong username or password' }); }
      if (usr.status === 'pending') return send(res, 403, { error: 'Your account is waiting for admin approval' });
      if (usr.status === 'banned') return send(res, 403, { error: 'Your account is disabled' });
      const token = acc.createSession(usr, platformOf(req), req.headers['user-agent']); setSessionCookie(res, token);
      acc.log('login', usr, { platform: platformOf(req) });
      return send(res, 200, { ok: true, token });
    }
    if (p === '/api/auth/register' && M === 'POST') {
      const mode = acc.db().config.registration;
      if (mode === 'closed' || acc.setupNeeded()) return send(res, 403, { error: 'Registration is closed' });
      const b = await readBody(req);
      const usr = acc.createUser({ username: b.username, password: b.password, name: b.name, status: mode === 'approval' ? 'pending' : 'active' });
      if (usr.status === 'pending') return send(res, 200, { ok: true, pending: true });
      const token = acc.createSession(usr, platformOf(req), req.headers['user-agent']); setSessionCookie(res, token);
      return send(res, 200, { ok: true, token });
    }
    const ctx = acc.sessionFromReq(req);
    if (!ctx) return send(res, 401, { error: 'auth', needsLogin: true, setupNeeded: acc.setupNeeded() });
    const me = ctx.u;
    if (me.status !== 'active') { acc.endSession(ctx.key); return send(res, 401, { error: me.status === 'pending' ? 'Your account is waiting for admin approval' : 'Your account is disabled', needsLogin: true }); }
    const platform = platformOf(req);
    acc.touch(ctx, platform);
    if (p === '/api/auth/logout' && M === 'POST') { acc.endSession(ctx.key); res.setHeader('Set-Cookie', 'nova_sid=; Path=/; Max-Age=0'); return send(res, 200, { ok: true }); }
    if (p === '/api/events' && M === 'GET') return acc.subscribe(req, res, ctx, platform);
    if (acc.db().config.maintenance && !isAdmin(me)) return send(res, 503, { error: 'maintenance', maintenance: true, announcement: acc.db().config.announcement });
    const parts = p.split('/').filter(Boolean).slice(1); // after 'api'
    const adminOnly = () => { if (!isAdmin(me)) { send(res, 403, { error: 'Admin only' }); return true; } return false; };

    // ---- my account
    if (parts[0] === 'me') {
      if (!parts[1] && M === 'GET') return send(res, 200, acc.publicUser(me, true));
      if (!parts[1] && M === 'PUT') {
        const b = await readBody(req);
        if (b.name) me.name = String(b.name).slice(0, 60);
        if (b.newPassword) { if (me.passHash && !acc.checkPassword(me, b.oldPassword)) return send(res, 400, { error: 'Current password is wrong' }); if (String(b.newPassword).length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' }); acc.setPassword(me, b.newPassword); }
        saveDb(); return send(res, 200, acc.publicUser(me, true));
      }
      if (parts[1] === 'telegram-code' && M === 'POST') {
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        me.tgLink = { code, exp: Date.now() + 15 * 60000 }; saveDb();
        return send(res, 200, { code, bot: bot.status().username, expiresIn: 15 });
      }
      if (parts[1] === 'telegram' && M === 'DELETE') { delete me.tgId; delete me.tgUsername; saveDb(); return send(res, 200, acc.publicUser(me, true)); }
    }

    // ---- admin dashboard
    if (parts[0] === 'admin') {
      if (adminOnly()) return;
      const a = parts[1];
      if (a === 'overview' && M === 'GET') {
        const mem = process.memoryUsage();
        return send(res, 200, Object.assign(acc.overview(), { server: { version: VERSION, uptime: process.uptime(), node: process.version, platform: process.platform, rss: mem.rss, providers: db.providers.length, models: db.providers.reduce((n, x) => n + (x.models || []).length, 0), chats: db.chats.length, media: db.media.length }, telegram: bot.status(), config: acc.db().config }));
      }
      if (a === 'users') {
        if (!parts[2] && M === 'GET') return send(res, 200, acc.users().map(x => acc.publicUser(x, true)));
        if (!parts[2] && M === 'POST') { const b = await readBody(req); const nu = acc.createUser({ username: b.username, password: b.password, name: b.name, role: b.role === 'admin' ? 'admin' : 'user' }); if (b.quota) nu.quota = b.quota; saveDb(); return send(res, 200, acc.publicUser(nu, true)); }
        const t = acc.byId(parts[2]); if (!t) return send(res, 404, { error: 'User not found' });
        if (M === 'PUT') {
          const b = await readBody(req);
          if (t.id === me.id && (b.role === 'user' || (b.status && b.status !== 'active'))) return send(res, 400, { error: 'You cannot demote or disable yourself' });
          if (b.name !== undefined) t.name = String(b.name).slice(0, 60);
          if (b.role) t.role = b.role === 'admin' ? 'admin' : 'user';
          if (b.status && ['active', 'banned', 'pending'].includes(b.status)) { t.status = b.status; if (b.status !== 'active') acc.emit('logout', c => c.uid === t.id); }
          if (b.quota !== undefined) t.quota = b.quota;
          if (b.allowedModels !== undefined) t.allowedModels = Array.isArray(b.allowedModels) && b.allowedModels.length ? b.allowedModels : null;
          if (b.password) { if (String(b.password).length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' }); acc.setPassword(t, b.password); }
          if (b.unlinkTelegram) { delete t.tgId; delete t.tgUsername; }
          saveDb(); acc.log('user.update', me, { target: t.username, changes: Object.keys(b).filter(k => k !== 'password') });
          acc.emit('me', c => c.uid === t.id);
          return send(res, 200, acc.publicUser(t, true));
        }
        if (M === 'DELETE') {
          if (t.id === me.id) return send(res, 400, { error: 'You cannot delete yourself' });
          if (u.searchParams.get('data') === '1') { db.chats = db.chats.filter(c => c.owner !== t.id); db.media.filter(m => m.owner === t.id).forEach(m => { try { fs.unlinkSync(path.join(MEDIA_DIR, m.file)); } catch { } }); db.media = db.media.filter(m => m.owner !== t.id); }
          Object.values(db.telegramUsers || {}).forEach(x => { if (x.uid === t.id) { delete x.uid; x.passed = false; } });
          acc.deleteUser(t.id); acc.log('user.delete', me, { target: t.username }); return send(res, 200, { ok: true });
        }
      }
      if (a === 'sessions') {
        if (M === 'GET') return send(res, 200, acc.listSessions());
        if (M === 'DELETE' && parts[2]) { acc.revokeSession(parts[2]); return send(res, 200, { ok: true }); }
      }
      if (a === 'config' && M === 'PUT') {
        const b = await readBody(req); const c = acc.db().config;
        if (['closed', 'open', 'approval'].includes(b.registration)) c.registration = b.registration;
        if (b.defaultQuota) c.defaultQuota = { msgs: Math.max(0, +b.defaultQuota.msgs || 0), images: Math.max(0, +b.defaultQuota.images || 0), videos: Math.max(0, +b.defaultQuota.videos || 0) };
        if (typeof b.announcement === 'string') c.announcement = b.announcement.slice(0, 500);
        if (typeof b.maintenance === 'boolean') c.maintenance = b.maintenance;
        if (typeof b.systemPrompt === 'string') db.settings.systemPrompt = b.systemPrompt;
        saveDb(); changed.config(); acc.log('config', me, { keys: Object.keys(b) });
        return send(res, 200, c);
      }
      if (a === 'activity' && M === 'GET') return send(res, 200, acc.db().activity.slice(0, 200));
      if (a === 'broadcast' && M === 'POST') {
        const b = await readBody(req); const text = String(b.text || '').trim(); if (!text) return send(res, 400, { error: 'Text required' });
        let tg = { sent: 0 };
        if (b.telegram !== false) tg = await bot.broadcast(text);
        if (b.app !== false) { acc.emit('notice', null, { text }); }
        acc.log('broadcast', me, { telegram: tg.sent });
        return send(res, 200, { ok: true, telegram: tg });
      }
    }

    // ---- state
    if (parts[0] === 'state' && M === 'GET') {
      return send(res, 200, { fsEnabled: FS_ENABLED && isAdmin(me), platform: process.platform, version: VERSION, me: acc.publicUser(me, true), config: publicConfig(), settings: userSettings(me), providers: providersFor(me), presets: isAdmin(me) ? PRESETS : [], prompts: db.prompts.filter(x => !x.owner || x.owner === me.id || isAdmin(acc.byId(x.owner))), chats: db.chats.filter(c => c.owner === me.id).map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: c.pinned, model: c.model, wsRoot: c.wsRoot, source: c.source })), mediaCount: db.media.filter(m => m.owner === me.id).length });
    }
    if (parts[0] === 'settings' && M === 'PUT') {
      const b = await readBody(req); delete b.telegram; delete b.workspaceRoot;
      me.prefs = Object.assign(me.prefs || {}, b);
      if (isAdmin(me) && b.systemPrompt !== undefined) db.settings.systemPrompt = b.systemPrompt;
      if (isAdmin(me) && b.lang) db.settings.lang = b.lang;
      saveDb(); return send(res, 200, userSettings(me));
    }

    // ---- providers
    if (parts[0] === 'providers') {
      if (M === 'GET' && !parts[1]) return send(res, 200, providersFor(me));
      if (adminOnly()) return;
      if (!parts[1] && M === 'POST') {
        const r = await addProvider(await readBody(req));
        acc.log('provider.add', me, { name: r.prov.name, platform });
        return send(res, 200, { provider: publicProvider(r.prov), fetched: r.fetched, error: r.error });
      }
      const prov = providerById(parts[1]);
      if (!prov) return send(res, 404, { error: 'Provider not found' });
      if (!parts[2]) {
        if (M === 'PUT') {
          const b = await readBody(req);
          ['name', 'baseUrl', 'type', 'enabled', 'headers', 'defaultModel'].forEach(k => { if (b[k] !== undefined) prov[k] = k === 'baseUrl' ? trimSlash(b[k]) : b[k]; });
          if (b.apiKey && !b.apiKey.includes('••••')) prov.apiKey = b.apiKey.trim();
          if (b.apiKey === '') prov.apiKey = '';
          saveDb(); changed.providers(); return send(res, 200, { provider: publicProvider(prov) });
        }
        if (M === 'DELETE') { db.providers = db.providers.filter(x => x.id !== prov.id); saveDb(); changed.providers(); acc.log('provider.delete', me, { name: prov.name }); return send(res, 200, { ok: true }); }
      }
      if (parts[2] === 'fetch-models' && M === 'POST') {
        const r = await mergeModels(prov); changed.providers();
        return send(res, 200, { provider: publicProvider(prov), fetched: r });
      }
      if (parts[2] === 'test' && M === 'POST') {
        const t0 = Date.now();
        try { const list = await listModels(prov); return send(res, 200, { ok: true, ms: Date.now() - t0, count: list.length }); }
        catch (e) { return send(res, 200, { ok: false, ms: Date.now() - t0, error: e.message }); }
      }
      if (parts[2] === 'models' && M === 'POST') {
        const b = await readBody(req);
        if (b.action === 'add') {
          const id = String(b.id || '').trim(); if (!id) return send(res, 400, { error: 'Model id required' });
          const caps = b.caps || detectCaps(id);
          const ex = prov.models.find(m => m.id === id);
          if (ex) Object.assign(ex, { caps, manual: true, enabled: true });
          else prov.models.unshift({ id, name: b.name || id, caps, manual: true, enabled: true, free: !!b.free });
        } else if (b.action === 'update') {
          const m = prov.models.find(x => x.id === b.id); if (!m) return send(res, 404, { error: 'Model not found' });
          if (b.caps) m.caps = Object.assign({}, m.caps, b.caps);
          if (b.enabled !== undefined) m.enabled = b.enabled;
          if (b.favorite !== undefined) m.favorite = b.favorite;
          if (b.name) m.name = b.name;
        } else if (b.action === 'delete') {
          prov.models = prov.models.filter(x => x.id !== b.id);
        } else if (b.action === 'bulk') {
          prov.models.forEach(m => { m.enabled = !!b.enabled; });
        } else if (b.action === 'redetect') {
          prov.models.forEach(m => { if (!m.manual) m.caps = detectCaps(m.id); });
        }
        saveDb(); changed.providers(); return send(res, 200, { provider: publicProvider(prov) });
      }
    }

    // ---- live capability probe
    if (parts[0] === 'probe' && M === 'POST') {
      if (adminOnly()) return;
      const b = await readBody(req);
      const prov = providerById(b.providerId); if (!prov) return send(res, 404, { error: 'Provider not found' });
      const m = prov.models.find(x => x.id === b.modelId);
      const result = { chat: null, image: null };
      try {
        let txt = '';
        await streamChat(prov, b.modelId, [{ role: 'user', content: 'Reply with: OK' }], { temperature: 0, maxTokens: 16 }, e => { if (e.delta) txt += e.delta; });
        result.chat = true;
      } catch (e) { result.chat = false; result.chatError = e.message; }
      if (b.image) {
        try { await generateImage(prov, b.modelId, 'a small red circle on white background', { n: 1, size: '512x512' }); result.image = true; }
        catch (e) { result.image = false; result.imageError = e.message; }
      }
      if (m) {
        if (result.chat !== null) m.caps.chat = result.chat;
        if (result.image !== null) m.caps.image = result.image;
        m.probedAt = Date.now(); saveDb();
      }
      return send(res, 200, result);
    }

    // ---- chat
    if (parts[0] === 'chat' && parts[1] === 'stream' && M === 'POST') {
      const b = await readBody(req);
      const prov = providerById(b.providerId); if (!prov) return send(res, 404, { error: 'Provider not found' });
      try { acc.consume(me, 'msg', platform, prov.id + '::' + b.modelId); } catch (e) { return send(res, 429, { error: e.message }); }
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const ctrl = new AbortController();
      res.on('close', () => ctrl.abort());
      const emit = o => { if (!res.writableEnded) res.write('data: ' + JSON.stringify(o) + '\n\n'); };
      const t0 = Date.now();
      try {
        await streamChat(prov, b.modelId, b.messages || [], { system: b.system, temperature: b.temperature, wantsImage: b.wantsImage, owner: me.id }, emit, ctrl.signal);
        emit({ done: true, ms: Date.now() - t0 });
      } catch (e) { if (e.name !== 'AbortError') emit({ error: e.message }); }
      return res.end();
    }
    if (parts[0] === 'chats') {
      if (!parts[1] && M === 'GET') return send(res, 200, db.chats.filter(c => c.owner === me.id).map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: c.pinned, source: c.source })));
      if (!parts[1] && M === 'POST') { const b = await readBody(req); const c = Object.assign({ id: uid('c_'), title: 'گفتگوی جدید', messages: [], createdAt: Date.now(), updatedAt: Date.now() }, b, { owner: me.id, source: platform }); db.chats.unshift(c); saveDb(); changed.chats(me.id); return send(res, 200, c); }
      const c = db.chats.find(x => x.id === parts[1] && x.owner === me.id); if (!c) return send(res, 404, { error: 'Chat not found' });
      if (M === 'GET') return send(res, 200, c);
      if (M === 'PUT') { const b = await readBody(req); Object.assign(c, b, { id: c.id, owner: me.id, updatedAt: Date.now() }); saveDb(); changed.chats(me.id); return send(res, 200, { ok: true }); }
      if (M === 'DELETE') { db.chats = db.chats.filter(x => x.id !== c.id); saveDb(); changed.chats(me.id); return send(res, 200, { ok: true }); }
    }

    // ---- media
    if (parts[0] === 'image' && M === 'POST') {
      const b = await readBody(req);
      const prov = providerById(b.providerId); if (!prov) return send(res, 404, { error: 'Provider not found' });
      try { acc.consume(me, 'image', platform, prov.id + '::' + b.modelId); } catch (e) { return send(res, 429, { error: e.message }); }
      const items = await generateImage(prov, b.modelId, b.prompt, Object.assign({}, b, { owner: me.id }));
      return send(res, 200, { items });
    }
    if (parts[0] === 'video') {
      if (M === 'POST') {
        const b = await readBody(req);
        const prov = providerById(b.providerId); if (!prov) return send(res, 404, { error: 'Provider not found' });
        try { acc.consume(me, 'video', platform, prov.id + '::' + b.modelId); } catch (e) { return send(res, 429, { error: e.message }); }
        return send(res, 200, await startVideo(prov, b.modelId, b.prompt, Object.assign({}, b, { owner: me.id })));
      }
      if (M === 'GET' && parts[1]) { const j = jobs.get(parts[1]); return j && j.owner === me.id ? send(res, 200, j) : send(res, 404, { error: 'Job not found' }); }
      if (M === 'GET') return send(res, 200, [...jobs.values()].filter(j => j.owner === me.id).reverse());
    }
    if (parts[0] === 'media') {
      if (M === 'GET') return send(res, 200, db.media.filter(m => m.owner === me.id));
      if (M === 'DELETE' && parts[1]) {
        const m = db.media.find(x => x.id === parts[1] && x.owner === me.id);
        if (m) { try { fs.unlinkSync(path.join(MEDIA_DIR, m.file)); } catch { } db.media = db.media.filter(x => x.id !== m.id); saveDb(); }
        return send(res, 200, { ok: true });
      }
    }
    if (parts[0] === 'free-models' && M === 'GET') return send(res, 200, await freeCatalog());

    // ---- prompts library
    if (parts[0] === 'prompts') {
      const b = M === 'GET' ? {} : await readBody(req);
      if (M === 'POST') { db.prompts.unshift({ id: uid('p_'), title: b.title, text: b.text, owner: me.id }); }
      if (M === 'DELETE' && parts[1]) db.prompts = db.prompts.filter(x => !(x.id === parts[1] && (x.owner === me.id || isAdmin(me))));
      saveDb(); return send(res, 200, db.prompts.filter(x => !x.owner || x.owner === me.id || isAdmin(acc.byId(x.owner))));
    }

    if (parts[0] === 'ws') { if (adminOnly()) return; return await handleWs(parts, M, req, res, u); }
    if (parts[0] === 'telegram') {
      if (adminOnly()) return;
      if (M === 'GET') return send(res, 200, bot.status());
      if (M === 'PUT' || M === 'POST') return send(res, 200, await bot.configure(await readBody(req)));
    }

    // ---- backup
    if (parts[0] === 'export' && M === 'GET') {
      if (!isAdmin(me)) { res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="nova-ai-hub-my-chats.json"' }); return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), chats: db.chats.filter(c => c.owner === me.id) }, null, 2)); }
      const full = u.searchParams.get('keys') === '1';
      const out = { exportedAt: new Date().toISOString(), settings: full ? db.settings : Object.assign({}, db.settings, { telegram: undefined }), prompts: db.prompts, providers: db.providers.map(p => full ? p : Object.assign({}, p, { apiKey: '' })), chats: db.chats };
      res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="nova-ai-hub-backup.json"' });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (parts[0] === 'import' && M === 'POST') {
      if (adminOnly()) return;
      const b = await readBody(req);
      if (b.settings) Object.assign(db.settings, b.settings);
      if (Array.isArray(b.prompts)) db.prompts = b.prompts;
      if (Array.isArray(b.providers)) b.providers.forEach(p => { const ex = providerById(p.id); if (ex) Object.assign(ex, p, { apiKey: p.apiKey || ex.apiKey }); else db.providers.push(p); });
      if (Array.isArray(b.chats)) b.chats.forEach(c => { if (!db.chats.find(x => x.id === c.id)) db.chats.push(Object.assign({}, c, { owner: c.owner || me.id })); });
      saveDb(); changed.providers(); return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'Unknown endpoint' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
    else res.end();
  }
});

async function mergeModels(prov) {
  const list = await listModels(prov);
  const prev = new Map(prov.models.map(m => [m.id, m]));
  let added = 0;
  const merged = list.map(m => {
    const old = prev.get(m.id);
    if (!old) added++;
    return old && old.manual ? old : Object.assign({ enabled: true }, m, old ? { enabled: old.enabled, favorite: old.favorite } : {});
  });
  prov.models.filter(m => m.manual && !list.find(x => x.id === m.id)).forEach(m => merged.unshift(m));
  prov.models = merged; prov.fetchedAt = Date.now(); prov.freeScanAt = Date.now(); saveDb();
  return { total: merged.length, added, free: merged.filter(m => m.free).length, image: merged.filter(m => m.caps.image).length, video: merged.filter(m => m.caps.video).length, vision: merged.filter(m => m.caps.vision).length };
}

// fill the built-in free provider on first start
(async () => {
  const pol = providerById('pollinations');
  if (pol && !pol.models.length) { try { await mergeModels(pol); } catch { } }
})();

// ---------------------------------------------------------------- Telegram bot (shares this server's data)
const bot = require('./bot')({ getDb: () => db, saveDb, providerById, streamChat, generateImage, uid, MEDIA_DIR, acc, PRESETS, addProvider, mergeModels, changed, publicProvider });
if (process.env.TELEGRAM_BOT_TOKEN && !(db.settings.telegram && db.settings.telegram.token)) {
  db.settings.telegram = Object.assign({ access: process.env.TELEGRAM_ACCESS || 'accounts' }, db.settings.telegram || {}, { token: process.env.TELEGRAM_BOT_TOKEN, enabled: true });
}
bot.start();

const ready = new Promise(resolve => {
  // PORT_FALLBACK=1 (desktop app): if the preferred port is busy, take any free port instead of crashing
  server.on('error', e => { if (e.code === 'EADDRINUSE' && process.env.PORT_FALLBACK) { console.log(`  port ${PORT} busy, using a free port`); server.listen(0, HOST); } else throw e; });
  server.once('listening', () => {
    const port = server.address().port;
    console.log(`\n  ✦ Nova AI Hub running →  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}\n`);
    if (acc.setupNeeded()) console.log(SETUP_CODE ? `  First run: open the app and create the admin account with setup code  ${SETUP_CODE}\n` : '  First run: open the app and create the admin account.\n');
    resolve(port);
  });
  server.listen(PORT, HOST);
});
module.exports = { detectCaps, server, ready };
