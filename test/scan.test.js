'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempHome, makePhotos } = require('./helpers');
const config = require('../lib/config');
const scan = require('../lib/scan');
const jje = require('../lib/jje');
const school = require('../lib/school');
const archive = require('../lib/archive');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

const root = tempHome();
const photoRoot = path.join(root, '홍보사진');
const listPage = jje.parseList(fx('jje-list.html'));
const viewPage = jje.parseView(fx('jje-view.html'));
let fetchNewCalls = 0;

const fetchers = {
  fetchNew: async (cfg, seen) => { fetchNewCalls++; return { total: 22887, pages: 1, items: listPage.items.filter(it => !seen(it.dataSid)), truncated: false }; },
  fetchView: async (cfg, url) => Object.assign({ url }, viewPage),
  search: async () => ({ total: 548, items: [
    { dataSid: '1', title: '한라초, 제20회 교육감배 전도학교스포츠클럽축전 키즈런 대회 참가', school: '한라초등학교', date: '2026-09-07' },
    { dataSid: '2', title: '한라초 2학년, 안전체험관 현장체험학습 실시', school: '한라초등학교', date: '2026-09-17' }
  ] }),
  schoolNews: async () => school.parseSchoolList(fx('school-list.html'))
};

test('훑기: 모든 학교 새 글 보관·요약, 우리 학교 현황, 교육청에 없는 글, 새 활동 폴더', async () => {
  await makePhotos(path.join(photoRoot, '2026-09-19 3학년 진로체험'), 2);
  const cfg = config.save({ photoRoot });
  const fixedNow = new Date('2026-09-20T08:00:00+09:00').getTime();
  const realNow = Date.now; Date.now = () => fixedNow;
  try {
    const r = await scan.runScan(cfg, { fetchers });
    assert.equal(r.board.newPosts.length, 2);                                // 초등 2건 (유치원 1건 제외)
    assert.equal(r.board.kindergartens, 1);
    assert.equal(r.board.bodies, 2);
    assert.equal(r.board.total, 22887);
    assert.equal(r.board.bySchool[0].school, '재릉초등학교');
    assert.ok(r.board.topics.some(t => t.topic === '환경·생태'));
    assert.equal(r.board.notable[0].paragraphs, 4);                           // 본문 4문단
    assert.equal(r.archive.total, 2);
    assert.equal(archive.get('1481727').body, viewPage.body);
    assert.equal(archive.has(listPage.items[2].dataSid), true);              // 유치원 글도 기록은 됨
    assert.equal(r.ours.latest.date, '2026-09-07');
    assert.equal(r.ours.last14d, 2);
    const pending = r.schoolSite.pendingOnJje.map(p => p.title);
    assert.ok(pending.includes('한라초 5학년, 981 제주파크 현장체험학습 실시'));
    assert.ok(!pending.includes('한라초 2학년, 안전체험관 현장체험학습 실시'));   // 교육청에 이미 있음
    assert.equal(r.activities[0].state, 'new');

    const text = scan.formatDigest(r, cfg);
    assert.ok(text.startsWith('[제주 초등학교 학교소식 훑기 · 9월 20일(일)]'));
    assert.ok(text.includes('새 글 2건 · 학교 1곳 (유치원 글 1건은 제외) · 보관함 누적 2건/1개교'));
    assert.ok(text.includes('학교별: 재릉초 2'));
    assert.ok(text.includes('· 4문단 · 사진 4장'));
    assert.ok(text.includes('한라초: 교육청 최근 게시 9/7(월)'));
    assert.ok(text.includes('교육청에 아직 없는 홈페이지 글 3건'));
    assert.ok(text.includes('사진 폴더의 새 활동: 「2026-09-19 3학년 진로체험」(사진 2장, 메모 없음)'));

    const r2 = await scan.runScan(cfg, { fetchers });
    assert.equal(r2.board.newPosts.length, 0);                               // 두 번째: 새 글 없음
    assert.ok(scan.formatDigest(r2, cfg).includes('지난 확인 뒤 새 글 0건'));
    assert.equal(fetchNewCalls, 2);
  } finally { Date.now = realNow; }
});

test('일부가 실패해도 나머지는 요약하고 실패를 알린다', async () => {
  const r = await scan.runScan(config.load(), { fetchers: Object.assign({}, fetchers, { schoolNews: async () => { throw new Error('연결 끊김'); } }) });
  assert.equal(r.errors.length, 1);
  assert.ok(scan.formatDigest(r, config.load()).includes('확인 못 한 것: 학교 홈페이지 읽기 실패: 연결 끊김'));
});

test('fetchNew: 본 글만 있는 페이지를 만나면 멈춘다', async () => {
  const pages = { 1: fx('jje-list.html'), 2: fx('jje-list.html').replace(/dataSid=14817(\d\d)/g, 'dataSid=99917$1'), 3: fx('jje-list.html').replace(/dataSid=14817(\d\d)/g, 'dataSid=88817$1') };
  const asked = [];
  const get = async url => { const p = Number(new URL(url).searchParams.get('startPage')); asked.push(p); return pages[p] || '<html></html>'; };
  const cfg = config.load();
  const all = await jje.fetchNew(cfg, () => false, { maxPages: 2, fetchText: get });
  assert.equal(all.items.length, 6); assert.deepEqual(asked, [1, 2]);
  asked.length = 0;
  const seen = new Set(listPage.items.map(i => i.dataSid));                   // 1쪽 글을 모두 본 상태
  const some = await jje.fetchNew(cfg, id => seen.has(id), { maxPages: 5, fetchText: get });
  assert.equal(some.items.length, 0); assert.deepEqual(asked, [1]);           // 1쪽이 전부 본 글 → 멈춤
});

test('제목 비교는 띄어쓰기·문장부호 차이를 무시한다', () => {
  assert.equal(scan.similar('한라초 2학년, 안전체험관 현장체험학습 실시', '한라초 2학년 안전체험관 현장체험학습 실시.'), 1);
  assert.ok(scan.similar('한라초 5학년, 981 제주파크 현장체험학습 실시', '한라초, 텃밭 가꾸기로 같이의 가치를 나눠요!') < 0.3);
});
