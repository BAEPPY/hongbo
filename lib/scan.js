'use strict';
/**
 * 아침 훑기: 교육청 학교소식 최신 글 + 우리 학교 게시 현황 + 사진 폴더의 새 활동 → 요약 JSON 과 한국어 요약문.
 * 다른 학교 글은 "주제·문체 참고"용입니다. 그 내용을 우리 글에 옮겨 쓰지 않습니다.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const jje = require('./jje');
const school = require('./school');
const folders = require('./folders');

const TOPICS = [
  ['진로', /진로|직업|꿈/], ['안전', /안전|재난|대피|소방|교통/], ['독서·인문', /독서|책|도서|인문|글쓰기/], ['예술', /미술|음악|합창|공연|예술|국악|연극/],
  ['체육·스포츠', /체육|스포츠|운동|육상|축구|씨름|수영|달리기|런/], ['환경·생태', /환경|생태|바다|텃밭|숲|기후|자연/], ['다문화·세계', /다문화|세계|글로벌|외국/],
  ['학부모', /학부모|가족/], ['교원 연수', /교원|교사|연수|장학/], ['캠페인', /캠페인|주간/], ['대회·수상', /대회|수상|우승|메달|입상/],
  ['건강·급식', /건강|급식|흡연|금연|영양|성교육/], ['인성·인권', /인성|인권|폭력|예방|존중|배려/], ['디지털·AI', /디지털|AI|인공지능|코딩|SW|소프트웨어|스마트폰|미디어/],
  ['과학·수학', /과학|수학|실험|메이커/], ['전통·명절', /추석|송편|명절|전통|한복|세배/], ['학생자치', /학생회|자치|선거|임원/], ['현장체험', /현장|체험학습|나들이|탐방/]
];

function topicsOf(titles) {
  const counts = {};
  for (const t of titles) for (const [name, re] of TOPICS) if (re.test(t)) counts[name] = (counts[name] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}

const norm = s => String(s || '').replace(/\s+|[.,·'"“”‘’!?~…\-–—()\[\]<>:]/g, '').toLowerCase();
function bigrams(s) { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out; }
function similar(a, b) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A.includes(B) || B.includes(A)) return 1;
  const x = bigrams(A), y = bigrams(B);
  let both = 0; for (const g of x) if (y.has(g)) both++;
  return (2 * both) / (x.size + y.size);
}

function seenFile() { return path.join(config.home(), 'cache', 'jje-seen.json'); }
function readSeen() { try { return JSON.parse(fs.readFileSync(seenFile(), 'utf8')); } catch (e) { return { posts: {}, lastScanAt: null }; } }
function writeSeen(s) { fs.mkdirSync(path.dirname(seenFile()), { recursive: true }); fs.writeFileSync(seenFile(), JSON.stringify(s, null, 2), 'utf8'); }

function daysAgo(ymd) {
  if (!ymd) return null;
  return Math.round((Date.now() - new Date(ymd + 'T00:00:00').getTime()) / 86400000);
}

/**
 * @param {object} cfg
 * @param {{pages?:number, skipSchool?:boolean, skipSearch?:boolean, fetchers?:object}} opts  fetchers 는 시험용 대체 함수
 */
async function runScan(cfg, opts = {}) {
  const f = Object.assign({ list: jje.fetchList, search: jje.searchSchool, schoolNews: school.fetchSchoolNews }, opts.fetchers || {});
  const seen = readSeen();
  const errors = [];
  const list = await f.list(cfg, { pages: opts.pages });
  const newPosts = list.items.filter(it => !seen.posts[it.dataSid]);
  for (const it of list.items) seen.posts[it.dataSid] = seen.posts[it.dataSid] || { title: it.title, school: it.school, date: it.date, firstSeen: new Date(Date.now()).toISOString() };
  // 캐시가 너무 커지지 않게 최근 600건만
  const keep = Object.entries(seen.posts).sort((a, b) => (b[1].date || '').localeCompare(a[1].date || '')).slice(0, 600);
  seen.posts = Object.fromEntries(keep);

  let ours = { items: [] };
  if (!opts.skipSearch) {
    try { ours = await f.search(cfg, cfg.school.short || cfg.school.name); } catch (e) { errors.push('교육청 검색 실패: ' + e.message); }
  }
  let schoolNews = [];
  if (!opts.skipSchool) {
    try { schoolNews = await f.schoolNews(cfg); } catch (e) { errors.push('학교 홈페이지 읽기 실패: ' + e.message); }
  }
  const recentSchool = schoolNews.filter(n => daysAgo(n.date) != null && daysAgo(n.date) <= 21);
  const pendingOnJje = recentSchool.filter(n => !ours.items.some(o => similar(o.title, n.title) >= 0.6));

  const activities = folders.listActivities(cfg);
  const result = {
    scannedAt: new Date(Date.now()).toISOString(),   // Date.now 를 바꿔 끼우는 시험을 위해
    lastScanAt: seen.lastScanAt,
    board: { total: list.total, fetched: list.items.length, newPosts, topics: topicsOf(newPosts.length ? newPosts.map(p => p.title) : list.items.map(p => p.title)),
      notable: pickNotable(newPosts.length ? newPosts : list.items) },
    ours: { latest: ours.items[0] || null, last14d: ours.items.filter(o => daysAgo(o.date) != null && daysAgo(o.date) <= 14).length, items: ours.items.slice(0, 10) },
    schoolSite: { latest: schoolNews[0] || null, recent: recentSchool.slice(0, 10), pendingOnJje },
    activities: activities.map(a => ({ name: a.name, date: a.date, state: a.state, photoCount: a.photoCount, hasMemo: a.hasMemo })),
    errors
  };
  seen.lastScanAt = result.scannedAt;
  writeSeen(seen);
  return result;
}

/** 참고할 만한 글: 요약이 길고(문단이 여럿) 제목이 서술형인 것 위주로 3건 */
function pickNotable(items) {
  return items.slice().sort((a, b) => (b.summary || '').length - (a.summary || '').length).slice(0, 3)
    .map(it => ({ title: it.title, school: it.school, date: it.date, url: it.url, paragraphs: ((it.summary || '').match(/[□○]/g) || []).length || null }));
}

const KD = ['일', '월', '화', '수', '목', '금', '토'];
function kdate(ymd) { if (!ymd) return '?'; const [y, m, d] = ymd.split('-').map(Number); return `${m}/${d}(${KD[new Date(y, m - 1, d).getDay()]})`; }
/** 컴퓨터 시간대와 상관없이 한국 시간 기준의 월·일·요일 */
function kst(iso) { return new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); }

/** 사람이 읽는 요약문 (채팅으로 그대로 보낼 수 있는 길이) */
function formatDigest(r, cfg) {
  const short = (cfg && cfg.school && cfg.school.short) || '우리 학교';
  const L = [];
  const now = kst(r.scannedAt);
  L.push(`[교육청 학교소식 훑기 · ${now.getMonth() + 1}월 ${now.getDate()}일(${KD[now.getDay()]})]`);
  L.push(r.lastScanAt ? `지난 확인 뒤 새 글 ${r.board.newPosts.length}건 (게시판 전체 ${r.board.total ? r.board.total.toLocaleString('ko-KR') : '?'}건)` : `최신 글 ${r.board.fetched}건 확인 (첫 실행)`);
  if (r.board.topics.length) L.push('자주 나온 주제: ' + r.board.topics.slice(0, 5).map(t => `${t.topic}(${t.count})`).join(', '));
  if (r.board.notable.length) {
    L.push('참고할 만한 글:');
    for (const n of r.board.notable) L.push(`  - ${n.school} 「${n.title}」 ${kdate(n.date)}`);
  }
  L.push(`${short}: 교육청 최근 게시 ${r.ours.latest ? kdate(r.ours.latest.date) + ' 「' + r.ours.latest.title + '」' : '없음'} · 최근 2주 ${r.ours.last14d}건`);
  if (r.schoolSite.latest) L.push(`${short} 홈페이지 학교소식 최근 글: ${kdate(r.schoolSite.latest.date)} 「${r.schoolSite.latest.title}」`);
  if (r.schoolSite.pendingOnJje.length) {
    L.push(`교육청에 아직 없는 홈페이지 글 ${r.schoolSite.pendingOnJje.length}건:`);
    for (const p of r.schoolSite.pendingOnJje.slice(0, 6)) L.push(`  - ${kdate(p.date)} ${p.title}`);
  }
  const fresh = r.activities.filter(a => a.state === 'new');
  const drafted = r.activities.filter(a => a.state === 'drafted' || a.state === 'approved');
  if (fresh.length) L.push('사진 폴더의 새 활동: ' + fresh.map(a => `「${a.name}」(사진 ${a.photoCount}장${a.hasMemo ? ', 메모 있음' : ', 메모 없음'})`).join(', ') + ' → "초안 만들어 줘"');
  if (drafted.length) L.push('초안이 있는 활동: ' + drafted.map(a => `「${a.name}」(${a.state === 'approved' ? '승인됨, 올리기 대기' : '승인 대기'})`).join(', '));
  if (r.errors.length) L.push('확인 못 한 것: ' + r.errors.join(' / '));
  return L.join('\n');
}

module.exports = { runScan, formatDigest, topicsOf, similar, pickNotable };
