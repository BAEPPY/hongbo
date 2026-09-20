'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { tempHome, makePhotos, mockAnthropic } = require('./helpers');

const root = tempHome();
const photoRoot = path.join(root, '홍보사진');
const dir = path.join(photoRoot, '2026-09-17 2학년 안전체험관 현장체험학습');
const BIN = path.join(__dirname, '..', 'bin', 'hongbo.js');

/** 자식 프로세스로 명령 실행. (spawnSync 를 쓰면 같은 프로세스의 가짜 서버가 응답할 수 없어 멈춘다) */
function run(args, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [BIN, ...args], { env: Object.assign({}, process.env, env || {}) });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      let json = null;
      try { json = JSON.parse(out); } catch (e) { /* 텍스트 출력 */ }
      resolve({ code, out, err, json });
    });
  });
}

test('명령줄: 설정 → 초안 → 승인 → 계획 → 게시 기록', async () => {
  await makePhotos(dir, 3);
  fs.writeFileSync(path.join(dir, '메모.txt'), '내용: 지진·화재 체험, 심폐소생술 실습\n담당자: 교감 김영숙\n');
  assert.equal((await run(['config', 'set-photo-root', photoRoot])).code, 0);
  assert.equal((await run(['config', 'set-key', 'anthropic', 'sk-ant-test'])).code, 0);
  assert.equal((await run(['config', 'set', 'photos.max', '2'])).code, 0);
  const show = (await run(['config', 'show', '--json'])).json;
  assert.equal(show.providers.anthropic.hasKey, true);
  assert.ok(!JSON.stringify(show).includes('sk-ant-test'));                  // 키 원문 노출 없음
  assert.equal(show.photos.max, 2);

  const list = (await run(['list', '--json'])).json;
  assert.equal(list.activities[0].state, 'new');

  const noDraft = await run(['approve', '안전체험관', '--json']);
  assert.equal(noDraft.code, 1); assert.match(noDraft.json.error, /초안이 없습니다/);

  const mock = await mockAnthropic();
  try {
    const d = await run(['draft', '안전체험관', '--json'], { ANTHROPIC_BASE_URL: mock.baseURL });
    assert.equal(d.code, 0, d.err);
    assert.equal(d.json.title, '한라초 2학년, 안전체험관 현장체험학습 실시');
    assert.equal(d.json.photos.picked.length, 2);
    assert.ok(mock.requests[0].json.messages[0].content.includes('마지막 문단 끝에 "(교감 김영숙)"를 붙일 것'));
  } finally { await mock.close(); }

  const st = (await run(['status', '2026-09-17', '--json'])).json;
  assert.equal(st.state, 'drafted');

  const ed = (await run(['edit', '안전체험관', '--title', '고친 제목', '--json'])).json;
  assert.equal(ed.title, '고친 제목');

  const ap = (await run(['approve', '안전체험관', '--photos', '1,3', '--json'])).json;
  assert.equal(ap.ok, true); assert.equal(ap.photos.length, 2);

  const plan = (await run(['plan', '안전체험관', '--json'])).json;
  assert.equal(plan.ok, true);
  assert.equal(plan.title, '고친 제목');
  assert.equal(plan.paragraphs[plan.paragraphs.length - 1], '○ 관련사진 2매. 끝.');
  assert.deepEqual(plan.files.map(f => f.name), ['01.jpg', '03.jpg']);

  const posted = (await run(['posted', '안전체험관', '--url', 'https://www.jje.go.kr/board/view.jje?dataSid=9', '--json'])).json;
  assert.equal(posted.ok, true);
  assert.equal((await run(['status', '안전체험관', '--json'])).json.state, 'posted');
  const again = await run(['plan', '안전체험관', '--json']);
  assert.equal(again.code, 1); assert.match(again.json.error, /이미 게시된/);

  const text = await run(['status', '안전체험관']);
  assert.ok(text.out.includes('게시 완료'));
  assert.ok((await run(['help'])).out.includes('hongbo — 한라초 홍보 도우미'));
  const unknown = await run(['zzz']);
  assert.equal(unknown.code, 1); assert.match(unknown.err, /모르는 명령/);
});
