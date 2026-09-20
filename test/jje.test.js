'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jje = require('../lib/jje');
const school = require('../lib/school');
const config = require('../lib/config');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('교육청 학교소식 목록을 읽는다', () => {
  const r = jje.parseList(fx('jje-list.html'));
  assert.equal(r.total, 22887);
  assert.equal(r.items.length, 3);
  const it = r.items[0];
  assert.equal(it.dataSid, '1481727');
  assert.equal(it.school, '재릉초등학교');
  assert.equal(it.date, '2026-09-17');
  assert.match(it.title, /^재릉초, 금능·협재/);
  assert.ok(it.summary.startsWith('□ 재릉초등학교(교장 양정윤)는'));
  assert.ok(it.url.startsWith('https://www.jje.go.kr/board/view.jje?boardId=BBS_0000217') && it.url.includes('dataSid=1481727'));
  assert.ok(it.thumb.startsWith('https://www.jje.go.kr/upload_data/'));
});

test('교육청 글 보기 페이지에서 제목·학교·본문·첨부 이름을 읽는다 (첨부는 내려받지 않음)', () => {
  const v = jje.parseView(fx('jje-view.html'));
  assert.equal(v.title, '탐라중학교 특수학급 9월 현장진로체험학습 실시');
  assert.equal(v.school, '탐라중학교');
  assert.equal(v.phone, '064)754-5046');
  assert.equal(v.views, 4);
  assert.equal(v.date, '2026-09-17');
  assert.equal(v.files.length, 4);
  assert.equal(v.imageCount, 4);
  assert.equal(v.files[0].name, 'KakaoTalk_20260917_153027844.jpg');
  assert.ok(v.body.startsWith('□ 탐라중학교(교장 윤정택)는'));
  assert.ok(v.body.includes('\n\n□ 이번 현장진로체험학습은'));
});

test('주소 만들기와 금지 경로', async () => {
  const cfg = config.DEFAULTS;
  assert.ok(jje.listUrl(cfg, 2).includes('startPage=2'));
  const s = jje.searchUrl(cfg, '한라초');
  assert.ok(s.includes('searchType=DATA_TITLE') && s.includes('keyword=%ED%95%9C%EB%9D%BC%EC%B4%88'));
  await assert.rejects(jje.fetchText('https://www.jje.go.kr/board/download.jje?x=1'), /첨부파일은 내려받지 않습니다/);
  assert.match(jje.UA, /HallaHongbo/);
});

test('학교 홈페이지 학교소식 목록을 읽는다', () => {
  const items = school.parseSchoolList(fx('school-list.html'));
  assert.equal(items.length, 4);
  assert.deepEqual(items[1], { nttSn: '40756503', title: '한라초 2학년, 안전체험관 현장체험학습 실시', date: '2026-09-17' });
  assert.ok(school.infoUrl(config.DEFAULTS, '40756503').includes('selectNttInfo.do') && school.infoUrl(config.DEFAULTS, '40756503').includes('nttSn=40756503'));
});
