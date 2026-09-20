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
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

const root = tempHome();
const photoRoot = path.join(root, '홍보사진');

const fetchers = {
  list: async () => jje.parseList(fx('jje-list.html')),
  search: async () => ({ total: 548, items: [
    { dataSid: '1', title: '한라초, 제20회 교육감배 전도학교스포츠클럽축전 키즈런 대회 참가', school: '한라초등학교', date: '2026-09-07' },
    { dataSid: '2', title: '한라초 2학년, 안전체험관 현장체험학습 실시', school: '한라초등학교', date: '2026-09-17' }
  ] }),
  schoolNews: async () => school.parseSchoolList(fx('school-list.html'))
};

test('훑기: 새 글·주제·우리 학교 현황·교육청에 없는 글·새 활동 폴더', async () => {
  await makePhotos(path.join(photoRoot, '2026-09-19 3학년 진로체험'), 2);
  const cfg = config.save({ photoRoot });
  const fixedNow = new Date('2026-09-20T08:00:00+09:00').getTime();
  const realNow = Date.now; Date.now = () => fixedNow;
  try {
    const r = await scan.runScan(cfg, { fetchers });
    assert.equal(r.board.newPosts.length, 3);                                // 첫 실행: 모두 새 글
    assert.equal(r.board.total, 22887);
    assert.ok(r.board.topics.some(t => t.topic === '환경·생태'));
    assert.equal(r.ours.latest.date, '2026-09-07');
    assert.equal(r.ours.last14d, 2);                                         // 9/7(13일 전)·9/17 둘 다 2주 안
    assert.equal(r.schoolSite.latest.title, '한라초 5학년, 981 제주파크 현장체험학습 실시');
    const pending = r.schoolSite.pendingOnJje.map(p => p.title);
    assert.ok(pending.includes('한라초 5학년, 981 제주파크 현장체험학습 실시'));
    assert.ok(!pending.includes('한라초 2학년, 안전체험관 현장체험학습 실시'));   // 교육청에 이미 있음
    assert.equal(r.activities[0].name, '2026-09-19 3학년 진로체험');
    assert.equal(r.activities[0].state, 'new');
    const text = scan.formatDigest(r, cfg);
    assert.ok(text.startsWith('[교육청 학교소식 훑기 · 9월 20일(일)]'));
    assert.ok(text.includes('최신 글 3건 확인 (첫 실행)'));
    assert.ok(text.includes('한라초: 교육청 최근 게시 9/7(월)'));
    assert.ok(text.includes('교육청에 아직 없는 홈페이지 글 3건'));
    assert.ok(text.includes('사진 폴더의 새 활동: 「2026-09-19 3학년 진로체험」(사진 2장, 메모 없음)'));

    const r2 = await scan.runScan(cfg, { fetchers });
    assert.equal(r2.board.newPosts.length, 0);                               // 두 번째: 새 글 없음
    assert.ok(scan.formatDigest(r2, cfg).includes('지난 확인 뒤 새 글 0건'));
    assert.ok(fs.existsSync(path.join(config.home(), 'cache', 'jje-seen.json')));
  } finally { Date.now = realNow; }
});

test('일부가 실패해도 나머지는 요약하고 실패를 알린다', async () => {
  const r = await scan.runScan(config.load(), { fetchers: Object.assign({}, fetchers, { schoolNews: async () => { throw new Error('연결 끊김'); } }) });
  assert.equal(r.errors.length, 1);
  assert.ok(scan.formatDigest(r, config.load()).includes('확인 못 한 것: 학교 홈페이지 읽기 실패: 연결 끊김'));
});

test('제목 비교는 띄어쓰기·문장부호 차이를 무시한다', () => {
  assert.equal(scan.similar('한라초 2학년, 안전체험관 현장체험학습 실시', '한라초 2학년 안전체험관 현장체험학습 실시.'), 1);
  assert.ok(scan.similar('한라초 5학년, 981 제주파크 현장체험학습 실시', '한라초, 텃밭 가꾸기로 같이의 가치를 나눠요!') < 0.3);
});
