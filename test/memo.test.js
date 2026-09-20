'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const memo = require('../lib/memo');

test('폴더 이름에서 날짜·대상·활동명을 읽는다', () => {
  assert.deepEqual(memo.parseFolderName('2026-09-17 2학년 안전체험관 현장체험학습'), { date: '2026-09-17', dateText: '2026년 9월 17일(목)', target: '2학년', activity: '안전체험관 현장체험학습' });
  assert.equal(memo.parseFolderName('20260918 한라마음소리합창단 노형동 행복음악회 참가').target, '한라마음소리합창단');
  assert.equal(memo.parseFolderName('2026.09.10 학부모회 연수').activity, '연수');
  assert.deepEqual(memo.parseFolderName('교원 연수'), { date: '', dateText: '', target: '교원', activity: '연수' });
  assert.equal(memo.parseFolderName('사진들').target, '');
});

test('메모의 항목을 읽고 여러 줄 내용을 이어 붙인다', () => {
  const m = memo.parseMemo('대상: 2학년\n내용:\n- 지진 체험\n- 심폐소생술\n\n규모: 8개 학급\n[강사] 제주안전체험관\n소감방식: 인용\n소감: 재밌었다');
  assert.equal(m.target, '2학년');
  assert.equal(m.detail, '- 지진 체험\n- 심폐소생술');
  assert.equal(m.scale, '8개 학급');
  assert.equal(m.partner, '제주안전체험관');
  assert.equal(m.voiceMode, '인용');
  assert.equal(memo.parseMemo('오늘 981파크에 갔다.\n재밌었다.').detail, '오늘 981파크에 갔다.\n재밌었다.');
});

test('폴더 이름 + 메모 → 글 엔진 입력값, 빠진 항목 안내', () => {
  const r = memo.buildForm('2026-09-17 2학년 안전체험관 현장체험학습', '내용:\n- 지진·화재·태풍 체험\n소감: "대피 방법을 알게 됐다"\n발언: 교감 김영숙 — 뜻깊었다\n문체: 안내\n시점: 예정\n문단: 4개\n기호: ○\n소제목: 예\n연구학교: 예\n담당자: 교감 김영숙');
  assert.deepEqual(r.missing, []);
  const f = r.form;
  assert.equal(f.dateText, '2026년 9월 17일(목)');
  assert.equal(f.target, '2학년');
  assert.equal(f.activity, '안전체험관 현장체험학습');
  assert.equal(f.voiceMode, 'quote');
  assert.equal(f.voice, '대피 방법을 알게 됐다');
  assert.equal(f.quote2, '교감 김영숙 — 뜻깊었다');
  assert.equal(f.tone, 'polite');
  assert.equal(f.tense, 'plan');
  assert.equal(f.paras, '4');
  assert.equal(f.mark, '○');
  assert.equal(f.subhead, true);
  assert.equal(f.iem, true);
  assert.equal(f.signer, '교감 김영숙');
  const plain = memo.buildForm('2026-09-18 5학년 981 제주파크 현장체험학습', '학생들이 카트를 탔다').form;
  assert.equal(plain.voiceMode, 'none'); assert.equal(plain.tone, 'report'); assert.equal(plain.paras, '3'); assert.equal(plain.mark, '□'); assert.equal(plain.iem, false);
  assert.deepEqual(memo.buildForm('사진들', '').missing, ['대상', '내용']);        // 한 단어 폴더 이름은 활동명으로 봄
  assert.deepEqual(memo.buildForm('', '').missing, ['대상', '활동명', '내용']);
  assert.equal(memo.buildForm('2026-09-01 행사', '내용: x', { target: '전교생' }).form.target, '전교생');
});
