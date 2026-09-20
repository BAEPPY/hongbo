'use strict';
/**
 * 아침 훑기: 교육청 학교소식(유치원/초등학교) 게시판의 새 글을 제주 모든 초등학교 대상으로 모아 보관하고,
 * 우리 학교 게시 현황과 사진 폴더의 새 활동을 더해 요약 JSON 과 한국어 요약문을 만듭니다.
 * 다른 학교 글은 "주제·문체 참고"용입니다. 그 내용을 우리 글에 옮겨 쓰지 않습니다.
 */
const jje = require('./jje');
const school = require('./school');
const folders = require('./folders');
const archive = require('./archive');

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

function daysAgo(ymd) {
  if (!ymd) return null;
  return Math.round((Date.now() - new Date(ymd + 'T00:00:00').getTime()) / 86400000);
}

function topicsOf(titles) {
  const counts = {};
  for (const t of titles) for (const name of archive.topicsOf(t)) counts[name] = (counts[name] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}

/** 본문 문단 수 ("○ 관련사진 N매. 끝." 꼬리표는 빼고) */
function paragraphCount(body) {
  return body ? body.split(/\n\s*\n/).map(s => s.trim()).filter(s => s && !/^○\s*관련\s*사진/.test(s)).length : null;
}

/** 참고할 만한 글: 문단이 여럿이고 사진이 여러 장인 글 위주로 3건 */
function pickNotable(records) {
  const score = r => {
    const paras = r.body ? paragraphCount(r.body) : ((r.summary || '').match(/[□○]/g) || []).length;
    return paras * 10 + Math.min(r.imageCount || 0, 5) + Math.min((r.summary || '').length, 400) / 400;
  };
  return records.slice().sort((a, b) => score(b) - score(a)).slice(0, 3)
    .map(r => ({ dataSid: r.dataSid, title: r.title, school: r.school, date: r.date, url: r.url,
      paragraphs: paragraphCount(r.body), imageCount: r.imageCount == null ? null : r.imageCount }));
}

/**
 * @param {object} cfg
 * @param {{maxPages?:number, fetchBodies?:boolean, skipSchool?:boolean, skipSearch?:boolean, fetchers?:object}} opts  fetchers 는 시험용 대체 함수
 */
async function runScan(cfg, opts = {}) {
  const f = Object.assign({ fetchNew: jje.fetchNew, fetchView: jje.fetchView, search: jje.searchSchool, schoolNews: school.fetchSchoolNews }, opts.fetchers || {});
  const before = archive.readIndex();
  const errors = [];

  // 1) 새 글 모으기 (이미 보관한 글만 있는 페이지를 만나면 멈춤)
  const harvest = await f.fetchNew(cfg, id => !!before.posts[id], { maxPages: opts.maxPages });
  const includeK = !!cfg.scan.includeKindergarten;
  const fresh = harvest.items.filter(it => includeK || !jje.isKindergarten(it.school));
  const kinder = harvest.items.filter(it => !includeK && jje.isKindergarten(it.school));
  const maxBodies = opts.fetchBodies === false || cfg.scan.fetchBodies === false ? 0 : (cfg.scan.maxBodies || 40);
  let bodies = 0;
  const saved = [];
  for (const it of fresh) {
    let rec = it;
    if (bodies < maxBodies) {
      try {
        const v = await f.fetchView(cfg, it.url);
        rec = Object.assign({}, it, { body: v.body, files: v.files, imageCount: v.imageCount, phone: it.phone || v.phone });
        bodies++;
      } catch (e) { errors.push(`본문 읽기 실패(${it.school}): ${e.message}`); }
    }
    saved.push(archive.save(rec));
  }
  for (const it of kinder) archive.save(Object.assign({}, it, { kindergarten: true }));   // 다음에 다시 새 글로 잡히지 않게 기록만

  // 2) 우리 학교 현황 (교육청 게시판 검색, 학교 홈페이지 학교소식)
  let ours = { items: [] };
  if (!opts.skipSearch && cfg.school && (cfg.school.short || cfg.school.name)) {
    try { ours = await f.search(cfg, cfg.school.short || cfg.school.name); } catch (e) { errors.push('교육청 검색 실패: ' + e.message); }
  }
  let schoolNews = [];
  if (!opts.skipSchool && cfg.schoolSite && cfg.schoolSite.newsUrl) {
    try { schoolNews = await f.schoolNews(cfg); } catch (e) { errors.push('학교 홈페이지 읽기 실패: ' + e.message); }
  }
  const recentSchool = schoolNews.filter(n => daysAgo(n.date) != null && daysAgo(n.date) <= 21);
  const pendingOnJje = recentSchool.filter(n => !ours.items.some(o => similar(o.title, n.title) >= 0.6));

  // 3) 정리
  const scannedAt = new Date(Date.now()).toISOString();
  const bySchool = {};
  for (const r of saved) bySchool[r.school] = (bySchool[r.school] || 0) + 1;
  const stats = archive.stats({ excludeKindergarten: !includeK });
  const activities = folders.listActivities(cfg);
  const result = {
    scannedAt,
    lastScanAt: before.lastScanAt,
    board: {
      total: harvest.total, pages: harvest.pages, truncated: !!harvest.truncated,
      newPosts: saved.map(r => ({ dataSid: r.dataSid, title: r.title, school: r.school, date: r.date, url: r.url, topics: r.topics, hasBody: !!r.body })),
      kindergartens: kinder.length, bodies,
      bySchool: Object.entries(bySchool).sort((a, b) => b[1] - a[1]).map(([s, count]) => ({ school: s, count })),
      topics: topicsOf(saved.map(r => r.title + ' ' + (r.summary || ''))),
      notable: pickNotable(saved)
    },
    archive: { total: stats.total, schools: stats.schools, from: stats.from, to: stats.to },
    ours: { latest: ours.items[0] || null, last14d: ours.items.filter(o => daysAgo(o.date) != null && daysAgo(o.date) <= 14).length, items: ours.items.slice(0, 10) },
    schoolSite: { latest: schoolNews[0] || null, recent: recentSchool.slice(0, 10), pendingOnJje },
    activities: activities.map(a => ({ name: a.name, date: a.date, state: a.state, photoCount: a.photoCount, hasMemo: a.hasMemo })),
    errors
  };
  const idx = archive.readIndex();
  idx.lastScanAt = scannedAt;
  archive.writeIndex(idx);
  return result;
}

const KD = ['일', '월', '화', '수', '목', '금', '토'];
function kdate(ymd) { if (!ymd) return '?'; const [y, m, d] = ymd.split('-').map(Number); return `${m}/${d}(${KD[new Date(y, m - 1, d).getDay()]})`; }
/** 컴퓨터 시간대와 상관없이 한국 시간 기준의 월·일·요일 */
function kst(iso) { return new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); }
const shortName = s => String(s || '').replace(/등학교$/, '').replace(/초등$/, '초');

/** 사람이 읽는 요약문 (채팅으로 그대로 보낼 수 있는 길이) */
function formatDigest(r, cfg) {
  const short = (cfg && cfg.school && cfg.school.short) || '우리 학교';
  const L = [];
  const now = kst(r.scannedAt);
  L.push(`[제주 초등학교 학교소식 훑기 · ${now.getMonth() + 1}월 ${now.getDate()}일(${KD[now.getDay()]})]`);
  const n = r.board.newPosts.length;
  L.push(`${r.lastScanAt ? '지난 확인 뒤 ' : ''}새 글 ${n}건 · 학교 ${r.board.bySchool.length}곳${r.board.kindergartens ? ` (유치원 글 ${r.board.kindergartens}건은 제외)` : ''}${r.board.truncated ? ' · 더 있을 수 있음(쪽수 상한)' : ''} · 보관함 누적 ${r.archive.total.toLocaleString('ko-KR')}건/${r.archive.schools}개교`);
  if (r.board.topics.length) L.push('자주 나온 주제: ' + r.board.topics.slice(0, 5).map(t => `${t.topic}(${t.count})`).join(', '));
  if (r.board.bySchool.length) L.push('학교별: ' + r.board.bySchool.slice(0, 6).map(s => `${shortName(s.school)} ${s.count}`).join(', ') + (r.board.bySchool.length > 6 ? ' 외' : ''));
  if (r.board.notable.length) {
    L.push('참고할 만한 글:');
    for (const x of r.board.notable) L.push(`  - ${shortName(x.school)} 「${x.title}」 ${kdate(x.date)}${x.paragraphs ? ` · ${x.paragraphs}문단` : ''}${x.imageCount ? ` · 사진 ${x.imageCount}장` : ''}`);
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

module.exports = { runScan, formatDigest, topicsOf, similar, pickNotable, paragraphCount };
