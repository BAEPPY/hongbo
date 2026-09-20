'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tempHome, makePhotos } = require('./helpers');
const config = require('../lib/config');
const folders = require('../lib/folders');
const photos = require('../lib/photos');
const review = require('../lib/review');

const root = tempHome();
const dir = path.join(root, '홍보사진', '2026-09-17 2학년 안전체험관');

test('확인 창: 보기·저장·승인·승인 취소', async () => {
  await makePhotos(dir, 2);
  folders.setState(dir, 'draft', { title: '한라초 2학년, 안전체험관 현장체험학습 실시', body: '□ 첫 문단\n\n□ 둘째 <문단>' });
  await photos.prepare(dir, { photos: { max: 4, maxSide: 1600 } }, {});
  const approvedSeen = [];
  const s = await review.serve(dir, config.load(), { open: false, onApprove: a => approvedSeen.push(a) });
  try {
    const html = await (await fetch(s.url)).text();
    assert.ok(html.includes('한라초 2학년, 안전체험관 현장체험학습 실시') && html.includes('□ 둘째 &lt;문단&gt;'));
    assert.equal((html.match(/name="photo"/g) || []).length, 2);
    assert.ok(html.includes('초안 · 승인 대기'));
    const img = await fetch(s.url + 'photo/01');
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(s.url + 'photo/09')).status, 404);

    const save = await (await fetch(s.url + 'save', { method: 'POST', body: JSON.stringify({ title: '고친 제목', body: '□ 고친 본문' }) })).json();
    assert.equal(save.ok, true);
    assert.equal(folders.state(dir, 'draft').title, '고친 제목');

    const bad = await (await fetch(s.url + 'approve', { method: 'POST', body: JSON.stringify({ title: '', body: '□ 고친 본문', photos: [1] }) })).json();
    assert.equal(bad.ok, false); assert.match(bad.error, /제목과 본문이 비어/);

    const ok = await (await fetch(s.url + 'approve', { method: 'POST', body: JSON.stringify({ title: '고친 제목', body: '□ 고친 본문', photos: [2] }) })).json();
    assert.equal(ok.ok, true);
    assert.deepEqual(folders.state(dir, 'approved').photos.map(p => path.basename(p)), ['02.jpg']);
    assert.equal(approvedSeen.length, 1);
    assert.ok((await (await fetch(s.url)).text()).includes('승인됨 · 올리기 대기'));

    const un = await (await fetch(s.url + 'unapprove', { method: 'POST', body: '{}' })).json();
    assert.equal(un.ok, true);
    assert.equal(folders.state(dir, 'approved'), null);
  } finally { await s.close(); }
});
