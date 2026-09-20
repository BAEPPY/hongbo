'use strict';
/**
 * 제주 초등학교 학교소식 보관함: 교육청 게시판에서 가져온 글을 학교·날짜별로 모아 둡니다.
 *
 *   <홈>/archive/index.json                  글 목록 (dataSid → 제목·학교·날짜·주제·파일)
 *   <홈>/archive/jje/YYYY-MM/<dataSid>.json  글 하나 (요약, 본문, 첨부 이름, 주소)
 *
 * 다른 학교 글은 주제·문체 참고용입니다. 우리 글의 사실은 언제나 메모에서만 옵니다.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const TOPICS = [
  ['진로', /진로|직업|꿈/], ['안전', /안전|재난|대피|소방|교통/], ['독서·인문', /독서|책|도서|인문|글쓰기|토론/], ['예술', /미술|음악|합창|공연|예술|국악|연극|오케스트라/],
  ['체육·스포츠', /체육|스포츠|운동|육상|축구|씨름|수영|달리기|런|줄넘기/], ['환경·생태', /환경|생태|바다|텃밭|숲|기후|자연|농장/], ['다문화·세계', /다문화|세계|글로벌|외국|국제/],
  ['학부모', /학부모|가족|보호자/], ['교원 연수', /교원|교사|연수|장학|컨설팅/], ['캠페인', /캠페인|주간/], ['대회·수상', /대회|수상|우승|메달|입상|표창/],
  ['건강·급식', /건강|급식|흡연|금연|영양|성교육|비만/], ['인성·인권', /인성|인권|폭력|예방|존중|배려|평화/], ['디지털·AI', /디지털|AI|인공지능|코딩|SW|소프트웨어|스마트폰|미디어|로봇/],
  ['과학·수학', /과학|수학|실험|메이커|발명/], ['전통·명절', /추석|송편|명절|전통|한복|세배|제주어|제주문화/], ['학생자치', /학생회|자치|선거|임원|다모임/], ['현장체험', /현장|체험학습|나들이|탐방|수학여행/],
  ['유·초 이음', /유치원|이음|유아/], ['특수교육', /특수|통합교육/]
];

function topicsOf(text) {
  const out = [];
  for (const [name, re] of TOPICS) if (re.test(text || '')) out.push(name);
  return out;
}

function root() { return path.join(config.home(), 'archive'); }
function indexFile() { return path.join(root(), 'index.json'); }

function readIndex() {
  try { const i = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); if (i && i.posts) return i; } catch (e) { /* 없음 */ }
  return { posts: {}, lastScanAt: null };
}
function writeIndex(idx) {
  fs.mkdirSync(root(), { recursive: true });
  fs.writeFileSync(indexFile(), JSON.stringify(idx, null, 1), 'utf8');
}

function fileFor(post) {
  const ym = (post.date || '0000-00').slice(0, 7);
  return path.join(root(), 'jje', ym, post.dataSid + '.json');
}

/** 글 하나 저장(있으면 덧씌움). 목록도 갱신. */
function save(post) {
  const idx = readIndex();
  const file = fileFor(post);
  const prev = get(post.dataSid) || {};
  const rec = Object.assign({}, prev, post, { savedAt: new Date(Date.now()).toISOString() });
  if (!rec.topics || !rec.topics.length) rec.topics = topicsOf(rec.title + ' ' + (rec.summary || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 1), 'utf8');
  idx.posts[rec.dataSid] = { dataSid: rec.dataSid, title: rec.title, school: rec.school, date: rec.date, topics: rec.topics, hasBody: !!rec.body, file: path.relative(root(), file) };
  writeIndex(idx);
  return rec;
}

function has(dataSid) { return !!readIndex().posts[dataSid]; }
function get(dataSid) {
  const e = readIndex().posts[dataSid];
  if (!e) return null;
  try { return JSON.parse(fs.readFileSync(path.join(root(), e.file), 'utf8')); } catch (err) { return null; }
}

const norm = s => String(s || '').replace(/\s+/g, '');
function schoolMatches(entry, q) {
  if (!q) return true;
  const a = norm(entry.school), b = norm(q);
  return a === b || a.startsWith(b) || a.replace(/등학교$/, '').replace(/학교$/, '') === b.replace(/등학교$/, '').replace(/학교$/, '');
}

const isKinder = e => /유치원|어린이집/.test((e && e.school) || '');

/** 목록 조회 (최신순). 유치원 글은 excludeKindergarten: false 를 주지 않으면 뺍니다. */
function list(q = {}) {
  const idx = readIndex();
  const excludeK = q.excludeKindergarten !== false;
  return Object.values(idx.posts)
    .filter(e => schoolMatches(e, q.school))
    .filter(e => !q.since || (e.date || '') >= q.since)
    .filter(e => !q.until || (e.date || '') <= q.until)
    .filter(e => !q.topic || (e.topics || []).includes(q.topic))
    .filter(e => !excludeK || !isKinder(e))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.dataSid) - Number(a.dataSid))
    .slice(0, q.limit || 50);
}

function schools(q = {}) {
  const counts = {};
  for (const e of Object.values(readIndex().posts)) if (q.excludeKindergarten === false || !isKinder(e)) counts[e.school] = (counts[e.school] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([school, count]) => ({ school, count }));
}

function stats(q = {}) {
  const items = list(Object.assign({ limit: 100000 }, q));
  const bySchool = {}, byTopic = {}, byDate = {};
  for (const e of items) {
    bySchool[e.school] = (bySchool[e.school] || 0) + 1;
    for (const t of e.topics || []) byTopic[t] = (byTopic[t] || 0) + 1;
    byDate[e.date] = (byDate[e.date] || 0) + 1;
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, count: v }));
  return { total: items.length, schools: Object.keys(bySchool).length, bySchool: top(bySchool), byTopic: top(byTopic), byDate: top(byDate).sort((a, b) => b.name.localeCompare(a.name)), from: items.length ? items[items.length - 1].date : null, to: items.length ? items[0].date : null };
}

/**
 * 글 엔진 예시 형식으로 내보내기.
 *   ─── 학교명 · 날짜 · 주제 ───
 *   제목: …
 *   □ 본문 문단 …
 * 본문이 있는 글만, 최신순으로 max 개.
 */
function exportExamples(q = {}) {
  const items = list(Object.assign({ limit: 100000 }, q)).filter(e => e.hasBody);
  const out = [];
  for (const e of items) {
    if (out.length >= (q.max || 20)) break;
    const p = get(e.dataSid);
    if (!p || !p.body) continue;
    const body = p.body.replace(/\n?○\s*관련\s*사진.*$/s, '').trim();     // "○ 관련사진 4매. 끝." 은 예시에서 뺀다
    const paras = body.split(/\n\s*\n/).filter(Boolean);
    if (paras.length < (q.minParagraphs || 2)) continue;
    out.push(`─── ${p.school} · ${p.date}${p.topics && p.topics.length ? ' · ' + p.topics.slice(0, 3).join('·') : ''} ───\n제목: ${p.title}\n${paras.join('\n\n')}`);
  }
  return out.join('\n\n');
}

module.exports = { root, readIndex, writeIndex, save, has, get, list, schools, stats, exportExamples, topicsOf, TOPICS };
