// Small, safe Markdown renderer (escapes HTML first)
(function () {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function inline(s) {
    return s
      .replace(/`([^`\n]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/media\/)[^)\s]+)\)/g, '<img src="$2" alt="$1" class="md-img">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }
  window.renderMarkdown = function (src) {
    const blocks = [];
    let text = String(src || '').replace(/\r/g, '');
    // fenced code
    text = text.replace(/```([^\n`]*)\n([\s\S]*?)(```|$)/g, (_, info, code) => {
      const i = blocks.length;
      const m = /path=([^\s]+)/.exec(info) || /^\s*\S+\s+([\w./-]+\.\w+)\s*$/.exec(info);
      const lang = (info.trim().split(/\s+/)[0] || '').replace(/^path=.*/, '');
      blocks.push({ lang, path: m ? m[1] : '', code: code.replace(/\n$/, '') });
      return `\u0000CODE${i}\u0000`;
    });
    const lines = esc(text).split('\n');
    let html = '', list = null, para = [];
    const flushPara = () => { if (para.length) { html += `<p dir="auto">${inline(para.join('<br>'))}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const code = /^\u0000CODE(\d+)\u0000$/.exec(l.trim());
      if (code) { flushPara(); flushList(); html += codeBlock(blocks[+code[1]], +code[1]); continue; }
      // table
      if (/^\|.*\|\s*$/.test(l) && k + 1 < lines.length && /^\|\s*:?-{2,}/.test(lines[k + 1])) {
        flushPara(); flushList();
        const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        let t = '<div class="md-table"><table><thead><tr>' + row(l).map(c => `<th dir="auto">${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
        k += 2;
        while (k < lines.length && /^\|.*\|\s*$/.test(lines[k])) { t += '<tr>' + row(lines[k]).map(c => `<td dir="auto">${inline(c)}</td>`).join('') + '</tr>'; k++; }
        k--; html += t + '</tbody></table></div>'; continue;
      }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flushPara(); flushList(); html += `<h${m[1].length} dir="auto">${inline(m[2])}</h${m[1].length}>`; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { flushPara(); flushList(); html += '<hr>'; continue; }
      if ((m = /^&gt;\s?(.*)$/.exec(l))) { flushPara(); flushList(); html += `<blockquote dir="auto">${inline(m[1])}</blockquote>`; continue; }
      if ((m = /^\s*[-*+]\s+(.*)$/.exec(l))) { flushPara(); if (list !== 'ul') { flushList(); html += '<ul dir="auto">'; list = 'ul'; } html += `<li>${inline(m[1].replace(/^\[ \]\s/, '☐ ').replace(/^\[x\]\s/i, '☑ '))}</li>`; continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { flushPara(); if (list !== 'ol') { flushList(); html += '<ol dir="auto">'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (!l.trim()) { flushPara(); flushList(); continue; }
      flushList(); para.push(l);
    }
    flushPara(); flushList();
    return html;
  };
  function codeBlock(b, i) {
    return `<div class="codeblock" data-i="${i}" data-path="${esc(b.path)}" data-lang="${esc(b.lang)}">
      <div class="cb-head"><span class="cb-lang">${esc(b.path || b.lang || 'code')}</span>
        <span class="cb-actions"><button class="cb-btn" data-act="copy-code">${icon('copy')}<span>${t('copy')}</span></button>
        ${/^(bash|sh|shell|zsh|cmd|powershell|ps1|console)$/i.test(b.lang) ? `<button class="cb-btn" data-act="run-code">${icon('zap')}<span>${t('run')}</span></button>` : ''}
        <button class="cb-btn" data-act="save-code">${icon('download')}<span>${t('saveToFolder')}</span></button></span></div>
      <pre dir="ltr"><code>${esc(b.code)}</code></pre></div>`;
  }
  window.extractCodeBlocks = function (src) {
    const out = [];
    String(src || '').replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, info, code) => {
      const m = /path=([^\s]+)/.exec(info) || /^\s*\S+\s+([\w./-]+\.\w+)\s*$/.exec(info);
      out.push({ lang: (info.trim().split(/\s+/)[0] || ''), path: m ? m[1] : '', code: code.replace(/\n$/, '') });
    });
    return out;
  };
})();
