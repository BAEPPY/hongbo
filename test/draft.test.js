'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempHome, makePhotos, mockAnthropic, ARTICLE } = require('./helpers');
const config = require('../lib/config');
const draft = require('../lib/draft');
const folders = require('../lib/folders');
const builtin = require('../lib/engine/prompt');

const root = tempHome();
const photoRoot = path.join(root, '홍보사진');
const dir = path.join(photoRoot, '2026-09-17 2학년 안전체험관 현장체험학습');

test('초안: 메모·폴더 이름으로 글을 만들고 draft.json 에 저장', async () => {
  await makePhotos(dir, 2);
  fs.writeFileSync(path.join(dir, '메모.txt'), '내용:\n- 지진·화재·태풍 체험\n- 심폐소생술 실습\n규모: 8개 학급 210명\n연구학교: 예\n');
  const cfg = config.save({ provider: 'anthropic', providers: { anthropic: { apiKey: 'sk-ant-test', model: 'claude-sonnet-5' } }, photoRoot });
  const mock = await mockAnthropic();
  try {
    const d = await draft.makeDraft(dir, cfg, { baseURL: mock.baseURL });
    assert.equal(d.title, '한라초 2학년, 안전체험관 현장체험학습 실시');
    assert.ok(d.body.startsWith('□ 한라초등학교(교장 오상남)는'));
    assert.equal(d.form.target, '2학년');
    assert.equal(folders.state(dir, 'draft').title, d.title);
    const req = mock.requests[0].json;
    assert.equal(req.model, 'claude-sonnet-5');
    assert.ok(req.system[0].text.startsWith(builtin.RULES));                 // 내장 규칙·예시 그대로
    const input = req.messages[0].content;
    assert.ok(input.includes('대상: 2학년') && input.includes('활동명: 안전체험관 현장체험학습') && input.includes('- 심폐소생술 실습'));
    assert.ok(input.includes('규모·시수·장소: 8개 학급 210명'));
    assert.ok(input.includes('[연구학교 참고자료]'));                          // 연구학교: 예
    assert.equal(folders.describe(dir).state, 'drafted');

    // 수정 요청은 입력에 덧붙고, 승인은 무효화된다
    folders.setState(dir, 'approved', { approvedAt: 'x' });
    await draft.makeDraft(dir, cfg, { baseURL: mock.baseURL, note: '소감 문장은 빼 주세요' });
    assert.ok(mock.requests[1].json.messages[0].content.includes('(수정 요청: 소감 문장은 빼 주세요)'));
    assert.equal(folders.state(dir, 'approved'), null);
  } finally { await mock.close(); }
});

test('초안 고치기와 사용자 규칙 파일', async () => {
  const d = draft.updateDraft(dir, { title: ' 고친 제목 ', body: '□ 고친 본문\r\n\r\n□ 둘째' });
  assert.equal(d.title, '고친 제목');
  assert.equal(d.body, '□ 고친 본문\n\n□ 둘째');
  const pdir = draft.ensurePromptFiles();
  assert.ok(fs.existsSync(path.join(pdir, 'rules.txt')) && fs.existsSync(path.join(pdir, 'research.txt')));
  fs.writeFileSync(path.join(pdir, 'rules.txt'), '내가 고친 규칙');
  const p = draft.promptFiles();
  assert.equal(p.rules, '내가 고친 규칙');
  assert.deepEqual(p.custom, ['rules', 'examples', 'research']);
  assert.equal(p.examples, builtin.EXAMPLES);
});

test('다른 학교 설정이면 규칙·예시의 학교명·교장이 바뀌고, 연구학교 자료는 직접 채웠을 때만 쓴다', async () => {
  const archive = require('../lib/archive');
  archive.save({ dataSid: '77', title: '한림초, 디지털 진로 체험의 날 운영', school: '한림초등학교', date: '2026-09-18', body: '□ 하나\n\n□ 둘\n\n□ 셋' });
  const cfg = Object.assign({}, config.load(), { school: { name: '한림초등학교', short: '한림초', principal: '홍길동', phone: '064-000-0000' } });
  fs.rmSync(path.join(config.home(), 'prompt'), { recursive: true, force: true });    // 사용자 규칙 파일 없음
  const p = draft.promptFiles();
  const form = draft.formFor(dir, cfg).form;                                            // 메모에 연구학교: 예
  const b = draft.buildPrompt(form, cfg, p);
  assert.equal(b.school.isHalla, false);
  assert.ok(b.system.startsWith('당신은 제주 한림초등학교의'));
  assert.ok(b.system.includes('"한림초등학교(교장 홍길동)"') && !b.system.includes('오상남') && !b.system.includes('한라초'));
  assert.ok(b.system.includes('─── 아래는 제주 다른 초등학교들이 최근 교육청 학교소식에 올린 글입니다'));
  assert.ok(b.system.includes('제목: 한림초, 디지털 진로 체험의 날 운영'));
  assert.ok(!b.input.includes('I-E.U.M') && !b.input.includes('[연구학교 참고자료]'));       // 한라초 전용 자료는 안 붙음
  assert.equal(b.warnings.length, 1);
  assert.match(b.warnings[0], /한라초 전용/);

  fs.mkdirSync(path.join(config.home(), 'prompt'), { recursive: true });
  fs.writeFileSync(path.join(config.home(), 'prompt', 'research.txt'), '[연구 주제] 한림초 독서교육 연구학교');
  const b2 = draft.buildPrompt(form, cfg, draft.promptFiles());
  assert.ok(b2.input.includes('연구학교·특색교육 글:') && b2.input.endsWith('[연구학교 참고자료]\n[연구 주제] 한림초 독서교육 연구학교'));
  assert.equal(b2.warnings.length, 0);

  const halla = draft.buildPrompt(form, config.load(), draft.promptFiles());
  assert.ok(halla.system.startsWith('당신은 제주 한라초등학교') && halla.input.includes('[연구학교 참고자료]'));
  const off = draft.buildPrompt(form, Object.assign({}, config.load(), { draft: { recentExamples: 0 } }), draft.promptFiles());
  assert.ok(!off.system.includes('아래는 제주 다른 초등학교들이'));
  fs.rmSync(path.join(config.home(), 'prompt'), { recursive: true, force: true });
});

test('메모가 부족하면 무엇을 적을지 알려 주고, 키가 없으면 안내한다', async () => {
  const bare = path.join(photoRoot, '사진만'); await makePhotos(bare, 1);
  const cfg = config.load();
  await assert.rejects(draft.makeDraft(bare, cfg, {}), /메모에 대상·내용이\(가\) 없어 글을 만들 수 없습니다. 폴더에 메모.txt 를 만들어 "대상: …", "내용: …"/);
  await assert.rejects(draft.makeDraft(dir, Object.assign({}, cfg, { providers: {} }), {}), /anthropic API 키가 없습니다/);
});
