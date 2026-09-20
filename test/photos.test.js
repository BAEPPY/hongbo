'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { tempHome, makePhotos, mockAnthropic } = require('./helpers');
const photos = require('../lib/photos');
const folders = require('../lib/folders');

const root = tempHome();
const dir = path.join(root, '사진', '2026-09-17 2학년 안전체험관');

test('사진 준비: 크기 줄이고 위치 정보 지우고 앞에서 N장 추천', async () => {
  await makePhotos(dir, 3);
  const r = await photos.prepare(dir, { photos: { max: 2, maxSide: 1600 } }, {});
  assert.equal(r.photos.length, 3);
  assert.equal(r.picked.length, 2);
  assert.ok(r.photos.every(p => Math.max(p.width, p.height) <= 1600));
  assert.equal(r.ranked, false);
  const meta = await sharp(r.picked[0]).metadata();
  assert.equal(meta.exif, undefined);                                   // EXIF(위치·기기) 제거
  assert.ok(fs.existsSync(path.join(dir, 'upload', '01.jpg')) && fs.existsSync(path.join(dir, 'upload', '03.jpg')));
  assert.deepEqual(folders.state(dir, 'photos').picked, r.picked);
  assert.ok(folders.listPhotoFiles(dir).every(f => !f.includes('upload')));  // 원본만 셈
});

test('AI 판정이 있으면 얼굴 크게 나온 사진은 뒤로 보낸다', async () => {
  const mock = await mockAnthropic((json, n) => n === 1
    ? '{"facesCloseup": true, "people": 2, "blurry": false, "showsActivity": true, "caption": "얼굴 클로즈업"}'
    : '{"facesCloseup": false, "people": 20, "blurry": false, "showsActivity": true, "caption": "단체 활동"}');
  try {
    const r = await photos.prepare(dir, { photos: { max: 2, maxSide: 1600 } }, { rank: true, provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-sonnet-5', baseURL: mock.baseURL });
    assert.equal(r.ranked, true);
    assert.equal(mock.requests.length, 3);
    assert.equal(mock.requests[0].json.messages[0].content[0].type, 'image');
    assert.equal(r.photos[0].analysis.facesCloseup, true);
    assert.equal(r.photos[0].recommended, false);
    assert.deepEqual(r.picked.map(p => path.basename(p)), ['02.jpg', '03.jpg']);
    assert.ok(r.photos[1].score > r.photos[0].score);
  } finally { await mock.close(); }
});

test('사진이 없으면 안내 오류', async () => {
  const empty = path.join(root, '사진', '2026-09-19 빈 폴더'); fs.mkdirSync(empty, { recursive: true });
  await assert.rejects(photos.prepare(empty, {}, {}), /사진이 없습니다/);
});
