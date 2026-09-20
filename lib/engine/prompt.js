'use strict';
/**
 * 한라초 홍보글 작성 — 규칙과 예시 (앱에 내장되는 기본값)
 *
 * 실제 내용은 같은 폴더의 텍스트 파일에 있습니다.
 *   src/prompt/rules.txt     작성 규칙
 *   src/prompt/examples.txt  실제 게시한 홍보글 예시 (유형별 대표 예시 + 2025~2026학년도 게시글)
 *   src/prompt/research.txt  진로연계교육 연구학교 참고자료 ("연구학교 글"을 켰을 때만 함께 보냄)
 *
 * 앱을 다시 만들지 않고 예시를 바꾸려면, 앱 메뉴 [도움말 > 홍보글 예시 편집…]으로
 * 여는 사용자 폴더의 텍스트 파일을 고치면 됩니다. (그 파일이 있으면 내장본 대신 그 내용을 씁니다.)
 *
 * 예시 형식
 *   ─── 어떤 유형인지 한 줄 설명 ───
 *   제목: (제목)
 *   □ (첫 문단)
 *
 *   □ (둘째 문단)
 *
 * 예시가 많을수록 문체는 잘 따르지만 글 한 편당 비용이 조금씩 오릅니다. 겹치는 것은 지워도 됩니다.
 */

const fs = require('fs');
const path = require('path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, 'prompt', name), 'utf8')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

const RULES = read('rules.txt');
const EXAMPLES = read('examples.txt');
const RESEARCH = read('research.txt');

module.exports = { RULES, EXAMPLES, RESEARCH };
