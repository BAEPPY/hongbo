'use strict';
/**
 * 확인 창: 내 컴퓨터 안에서만 열리는 작은 웹 페이지 (127.0.0.1).
 * 초안 제목·본문을 고치고, 올릴 사진을 고르고, [승인]을 누르면 .hongbo/approved.json 이 만들어집니다.
 * 승인 뒤 실제 게시는 오픈클로에게 "올려 줘"라고 하거나 hongbo plan 으로 이어집니다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const folders = require('./folders');
const draftMod = require('./draft');
const post = require('./post');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(dir, cfg) {
  const d = folders.describe(dir);
  const draft = d.draft || { title: '', body: '' };
  const photos = d.photos ? d.photos.photos : [];
  const approvedSet = new Set(d.approved ? d.approved.photos : (d.photos ? d.photos.picked : []));
  const status = d.posted ? `게시 완료 (${d.posted.postedAt.slice(0, 10)})` : d.approved ? '승인됨 · 올리기 대기' : d.draft ? '초안 · 승인 대기' : '초안 없음';
  const photoCards = photos.map(p => {
    const a = p.analysis;
    const warn = a && a.facesCloseup ? '<span class="warn">얼굴 크게 나옴</span>' : '';
    const blur = a && a.blurry ? '<span class="warn">흐림</span>' : '';
    return `<label class="card"><input type="checkbox" name="photo" value="${p.index}" ${approvedSet.has(p.out) ? 'checked' : ''}>
      <img src="/photo/${String(p.index).padStart(2, '0')}" alt=""><div class="cap"><b>${String(p.index).padStart(2, '0')}</b> ${esc(p.srcName)} · ${p.width}×${p.height}${warn}${blur}${a && a.caption ? '<br><span class="muted">' + esc(a.caption) + '</span>' : ''}</div></label>`;
  }).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>확인 · ${esc(d.name)}</title>
<style>
body{font-family:"Malgun Gothic","Apple SD Gothic Neo","NanumGothic",sans-serif;margin:0;background:#f4f6f5;color:#1d2b2e}
.wrap{max-width:980px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:18px;margin:0 0 4px} .status{color:#476b6f;margin-bottom:18px}
.row{display:grid;grid-template-columns:1fr;gap:16px} @media(min-width:900px){.row{grid-template-columns:1.1fr .9fr}}
.box{background:#fff;border:1px solid #d9e2e1;border-radius:10px;padding:16px}
label.f{display:block;font-weight:600;margin:10px 0 6px;font-size:13px;color:#476b6f}
input[type=text],textarea{width:100%;box-sizing:border-box;border:1px solid #c9d6d4;border-radius:8px;padding:10px;font:inherit;font-size:15px;line-height:1.6}
textarea{min-height:420px;font-family:"Noto Serif KR","Batang",serif}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.card{display:block;border:1px solid #d9e2e1;border-radius:8px;overflow:hidden;background:#fafcfb;cursor:pointer}
.card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block} .card input{position:absolute;margin:8px} .card{position:relative}
.card:has(input:checked){outline:3px solid #2f7d6f} .cap{font-size:12px;padding:8px;line-height:1.5} .muted{color:#6b8285}
.warn{display:inline-block;background:#fde8e6;color:#a33a2f;border-radius:4px;padding:0 6px;margin-left:6px;font-size:11px}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid #c9d6d4;background:#fff;cursor:pointer} button.primary{background:#2f7d6f;color:#fff;border-color:#2f7d6f} button.danger{color:#a33a2f}
#msg{margin-top:12px;color:#2f7d6f;min-height:1.4em} .note{font-size:13px;color:#476b6f;line-height:1.6}
</style></head><body><div class="wrap">
<h1>${esc(d.name)}</h1><div class="status">${status}${d.draft && d.draft.usage ? ` · ${esc(d.draft.usage.providerLabel)} ${esc(d.draft.usage.modelLabel)}` : ''}</div>
<div class="row">
<div class="box">
  <label class="f">제목</label><input type="text" id="title" value="${esc(draft.title)}">
  <label class="f">본문</label><textarea id="body">${esc(draft.body)}</textarea>
  <p class="note">게시 전에 날짜·인원·기관명·이름이 사실과 맞는지 확인하세요. 교육청 게시판에는 끝에 "○ 관련사진 N매. 끝." 이 자동으로 붙습니다.</p>
</div>
<div class="box">
  <label class="f">올릴 사진 (체크한 것만 올라갑니다 · 얼굴이 크게 나온 사진은 빼 주세요)</label>
  <div class="cards">${photoCards || '<p class="note">사진 준비가 안 됐습니다. 터미널에서 <code>hongbo photos "폴더"</code> 를 먼저 실행하세요.</p>'}</div>
</div>
</div>
<div class="bar">
  <button id="save">고친 내용 저장</button>
  <button id="approve" class="primary">승인 — 올릴 준비 완료</button>
  <button id="unapprove" class="danger">승인 취소</button>
</div>
<div id="msg"></div>
<p class="note">승인하면 오픈클로에게 "「${esc(d.name)}」 올려 줘"라고 말하거나, 터미널에서 <code>hongbo plan "${esc(d.name)}"</code> 을 실행해 게시 절차로 넘어갑니다. 인증서 로그인은 크롬에서 직접 해 두세요.</p>
</div>
<script>
const $ = id => document.getElementById(id);
async function send(url, data) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); const j = await r.json(); $('msg').textContent = j.ok ? j.message : ('오류: ' + j.error); if (j.ok && j.reload) setTimeout(() => location.reload(), 600); return j; }
const picked = () => [...document.querySelectorAll('input[name=photo]:checked')].map(i => Number(i.value));
$('save').onclick = () => send('/save', { title: $('title').value, body: $('body').value });
$('approve').onclick = () => { if (!picked().length) { $('msg').textContent = '사진을 한 장 이상 골라 주세요.'; return; } send('/approve', { title: $('title').value, body: $('body').value, photos: picked() }); };
$('unapprove').onclick = () => send('/unapprove', {});
</script></body></html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); req.on('error', reject);
  });
}

function openUrl(url) {
  try {
    if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (post.isWsl()) spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* 브라우저를 못 열면 주소만 안내 */ }
}

/** @returns {Promise<{url:string, close:Function, server:http.Server}>} */
function serve(dir, cfg, opts = {}) {
  const server = http.createServer(async (req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(page(dir, cfg));
      }
      if (req.method === 'GET' && /^\/photo\/\d{2}$/.test(url.pathname)) {
        const f = path.join(dir, 'upload', url.pathname.slice(7) + '.jpg');
        if (!fs.existsSync(f)) return json(404, { ok: false, error: 'no photo' });
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'POST') {
        const data = await readBody(req);
        if (url.pathname === '/save') { draftMod.updateDraft(dir, data); return json(200, { ok: true, message: '저장했습니다. (승인은 취소된 상태입니다)' }); }
        if (url.pathname === '/approve') {
          const a = post.approve(dir, cfg, data);
          if (opts.onApprove) opts.onApprove(a);
          return json(200, { ok: true, reload: true, message: `승인했습니다. 사진 ${a.photos.length}장. 이제 오픈클로에게 "올려 줘"라고 하면 됩니다.` });
        }
        if (url.pathname === '/unapprove') { post.unapprove(dir); return json(200, { ok: true, reload: true, message: '승인을 취소했습니다.' }); }
      }
      json(404, { ok: false, error: 'not found' });
    } catch (e) {
      json(400, { ok: false, error: e.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port || 0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port + '/';
      if (opts.open) openUrl(url);
      resolve({ url, server, close: () => new Promise(r => server.close(r)) });
    });
  });
}

module.exports = { serve, page, openUrl };
