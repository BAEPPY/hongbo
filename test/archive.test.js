'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempHome } = require('./helpers');
tempHome();
const archive = require('../lib/archive');
const jje = require('../lib/jje');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('보관함: 저장·조회·통계·예시 내보내기', () => {
  const list = jje.parseList(fx('jje-list.html'));
  const view = jje.parseView(fx('jje-view.html'));
  for (const it of list.items) archive.save(it);
  archive.save(Object.assign({}, list.items[0], { body: view.body, files: view.files, imageCount: view.imageCount }));   // 본문 덧붙이기
  archive.save({ dataSid: '9', title: '한림초, 디지털 진로 체험의 날 운영', school: '한림초등학교', date: '2026-09-18', summary: '□ 진로', body: '□ 하나\n\n□ 둘\n\n□ 셋\n\n○ 관련사진 4매. 끝.' });

  assert.equal(archive.has('1481727'), true);
  assert.equal(archive.get('1481727').body, view.body);
  assert.equal(archive.list({ school: '재릉초' }).length, 2);
  assert.equal(archive.list({ school: '재릉초등학교' }).length, 2);
  assert.equal(archive.list({}).length, 3);                                        // 유치원 글은 기본으로 뺌
  assert.equal(archive.list({ excludeKindergarten: false }).length, 4);
  assert.equal(archive.list({ since: '2026-09-18' })[0].dataSid, '9');
  assert.deepEqual(archive.list({ topic: '진로' }).map(e => e.dataSid), ['9']);
  const st = archive.stats({});
  assert.equal(st.total, 3); assert.equal(st.schools, 2);
  assert.equal(st.bySchool[0].name, '재릉초등학교');
  assert.equal(archive.schools()[0].school, '재릉초등학교');

  const ex = archive.exportExamples({ max: 5, minParagraphs: 3 });
  assert.ok(ex.startsWith('─── 한림초등학교 · 2026-09-18 · 진로'));
  assert.ok(ex.includes('제목: 한림초, 디지털 진로 체험의 날 운영\n□ 하나\n\n□ 둘\n\n□ 셋'));
  assert.ok(!ex.includes('관련사진'));                                                // 꼬리표는 예시에서 제외
  assert.ok(ex.includes('─── 재릉초등학교 · 2026-09-17'));                          // 본문 있는 재릉초 글도 포함
  assert.ok(fs.existsSync(path.join(archive.root(), 'jje', '2026-09', '1481727.json')));
  assert.deepEqual(archive.topicsOf('한라초 4학년, 생존수영교육 실시'), ['체육·스포츠']);
});
