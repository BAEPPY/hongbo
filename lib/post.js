'use strict';
/**
 * 승인과 게시 준비.
 *   approve()   승인: 확인 창이나 채팅에서 "올려도 좋다"고 한 제목·본문·사진을 .hongbo/approved.json 에 고정
 *   postPlan()  게시 계획: 오픈클로가 브라우저에서 글쓰기 폼을 채울 때 쓰는 값(제목, 본문, 사진 경로, 게시판 정보)
 *   markPosted() 게시 완료 기록
 * 실제 "등록" 버튼은 사람이 확인한 뒤 오픈클로가 누릅니다. 이 모듈은 어떤 사이트에도 접속하지 않습니다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const folders = require('./folders');

function isWsl() {
  try { return process.platform === 'linux' && /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch (e) { return false; }
}
/** WSL 안에서 만든 /mnt/c/… 경로를 Windows 크롬이 읽을 수 있는 C:\… 로 바꿉니다. */
function toBrowserPath(p, wsl = isWsl()) {
  const m = /^\/mnt\/([a-z])\/(.*)$/i.exec(p);
  if (wsl && m) return m[1].toUpperCase() + ':\\' + m[2].replace(/\//g, '\\');
  return p;
}

function trailerFor(count, cfg) {
  return cfg.board && cfg.board.trailer === false ? '' : `○ 관련사진 ${count}매. 끝.`;
}

/** @param {{title?:string, body?:string, photos?:Array<number|string>}} sel */
function approve(dir, cfg, sel = {}) {
  const draft = folders.state(dir, 'draft');
  if (!draft) throw new Error('초안이 없습니다. 먼저 "hongbo draft" 로 초안을 만들어 주세요.');
  const photos = folders.state(dir, 'photos');
  if (!photos) throw new Error('사진 준비가 안 됐습니다. 먼저 "hongbo photos" 를 실행해 주세요.');
  let picked;
  if (sel.photos && sel.photos.length) {
    picked = sel.photos.map(p => {
      const byIndex = photos.photos.find(x => String(x.index) === String(p).replace(/^0+/, '') || path.basename(x.out) === String(p) || x.out === p || x.srcName === p);
      if (!byIndex) throw new Error('사진 번호를 찾을 수 없습니다: ' + p);
      return byIndex.out;
    });
  } else {
    picked = photos.picked.slice();
  }
  if (!picked.length) throw new Error('올릴 사진을 한 장 이상 골라 주세요.');
  for (const p of picked) if (!fs.existsSync(p)) throw new Error('사진 파일이 없습니다: ' + p);
  const title = (sel.title != null ? String(sel.title) : draft.title).trim();
  const body = (sel.body != null ? String(sel.body) : draft.body).replace(/\r\n?/g, '\n').trim();
  if (!title || !body) throw new Error('제목과 본문이 비어 있으면 승인할 수 없습니다.');
  const approved = { approvedAt: new Date().toISOString(), title, body, photos: picked, by: os.userInfo().username };
  folders.setState(dir, 'approved', approved);
  if (title !== draft.title || body !== draft.body) folders.setState(dir, 'draft', Object.assign({}, draft, { title, body, editedAt: approved.approvedAt }));
  return approved;
}

function unapprove(dir) { folders.clearState(dir, 'approved'); }

/** 게시 계획. 승인된 내용만 씁니다. */
function postPlan(dir, cfg, opts = {}) {
  const approved = folders.state(dir, 'approved');
  if (!approved) throw new Error('아직 승인되지 않았습니다. 확인 창(hongbo review)에서 승인하거나 "hongbo approve" 를 실행해 주세요.');
  const posted = folders.state(dir, 'posted');
  if (posted && !opts.again) throw new Error(`이미 게시된 활동입니다 (${posted.postedAt}${posted.url ? ', ' + posted.url : ''}). 다시 올리려면 --again 을 붙여 주세요.`);
  const trailer = trailerFor(approved.photos.length, cfg);
  const paragraphs = approved.body.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (trailer) paragraphs.push(trailer);
  const notesFile = path.join(config.home(), 'board-form-notes.md');
  let notes = '';
  try { notes = fs.readFileSync(notesFile, 'utf8').trim(); } catch (e) { /* 첫 게시 전 */ }
  return {
    ok: true,
    folder: path.basename(dir),
    dir,
    board: Object.assign({}, cfg.board, { writeHint: '목록 화면에서 로그인한 뒤 나타나는 [글쓰기] 버튼으로 들어갑니다.' }),
    school: cfg.school,
    title: approved.title,
    paragraphs,
    body: paragraphs.join('\n\n'),
    files: approved.photos.map(p => ({ path: p, browserPath: toBrowserPath(p), name: path.basename(p) })),
    formNotesFile: notesFile,
    formNotes: notes,
    approvedAt: approved.approvedAt,
    alreadyPosted: posted || null
  };
}

function markPosted(dir, info = {}) {
  const approved = folders.state(dir, 'approved');
  const rec = { postedAt: new Date().toISOString(), url: info.url || '', title: approved ? approved.title : '', photos: approved ? approved.photos.length : 0, note: info.note || '' };
  folders.setState(dir, 'posted', rec);
  return rec;
}

function saveFormNotes(text) {
  const f = path.join(config.home(), 'board-form-notes.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, String(text || '').trim() + '\n', 'utf8');
  return f;
}

module.exports = { approve, unapprove, postPlan, markPosted, saveFormNotes, toBrowserPath, trailerFor, isWsl };
