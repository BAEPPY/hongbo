'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempHome, makePhotos } = require('./helpers');
const config = require('../lib/config');
const folders = require('../lib/folders');
const photos = require('../lib/photos');
const post = require('../lib/post');

const root = tempHome();
const dir = path.join(root, '홍보사진', '2026-09-17 2학년 안전체험관');

test('승인 → 게시 계획 → 게시 기록', async () => {
  const cfg = config.load();
  await makePhotos(dir, 3);
  assert.throws(() => post.approve(dir, cfg, {}), /초안이 없습니다/);
  folders.setState(dir, 'draft', { title: '제목', body: '□ 첫 문단\n\n□ 둘째 문단' });
  assert.throws(() => post.approve(dir, cfg, {}), /사진 준비가 안 됐습니다/);
  await photos.prepare(dir, { photos: { max: 2, maxSide: 1600 } }, {});
  assert.throws(() => post.postPlan(dir, cfg), /아직 승인되지 않았습니다/);

  const a = post.approve(dir, cfg, { photos: ['1', '03'], body: '□ 첫 문단(고침)\n\n□ 둘째 문단' });
  assert.deepEqual(a.photos.map(p => path.basename(p)), ['01.jpg', '03.jpg']);
  assert.equal(folders.state(dir, 'draft').body, '□ 첫 문단(고침)\n\n□ 둘째 문단');   // 고친 본문이 초안에도 반영
  assert.equal(folders.describe(dir).state, 'approved');

  const plan = post.postPlan(dir, cfg);
  assert.equal(plan.title, '제목');
  assert.deepEqual(plan.paragraphs, ['□ 첫 문단(고침)', '□ 둘째 문단', '○ 관련사진 2매. 끝.']);
  assert.equal(plan.files.length, 2);
  assert.equal(plan.board.category, '유치원/초등학교');
  assert.equal(plan.school.name, '한라초등학교');
  assert.equal(plan.formNotes, '');
  post.saveFormNotes('글쓰기 버튼은 오른쪽 아래');
  assert.equal(post.postPlan(dir, cfg).formNotes, '글쓰기 버튼은 오른쪽 아래');
  assert.equal(post.postPlan(dir, Object.assign({}, cfg, { board: Object.assign({}, cfg.board, { trailer: false }) })).paragraphs.length, 2);

  const rec = post.markPosted(dir, { url: 'https://www.jje.go.kr/board/view.jje?dataSid=1' });
  assert.equal(folders.describe(dir).state, 'posted');
  assert.throws(() => post.postPlan(dir, cfg), /이미 게시된 활동입니다/);
  assert.equal(post.postPlan(dir, cfg, { again: true }).alreadyPosted.url, rec.url);
  assert.throws(() => post.approve(dir, cfg, { photos: ['9'] }), /사진 번호를 찾을 수 없습니다/);
  post.unapprove(dir);
  assert.equal(folders.state(dir, 'approved'), null);
});

test('WSL 경로를 Windows 크롬 경로로 바꾼다', () => {
  assert.equal(post.toBrowserPath('/mnt/c/Users/kim/홍보사진/upload/01.jpg', true), 'C:\\Users\\kim\\홍보사진\\upload\\01.jpg');
  assert.equal(post.toBrowserPath('/home/kim/a.jpg', true), '/home/kim/a.jpg');
  assert.equal(post.toBrowserPath('/mnt/c/a.jpg', false), '/mnt/c/a.jpg');
  assert.equal(post.trailerFor(4, config.DEFAULTS), '○ 관련사진 4매. 끝.');
});
