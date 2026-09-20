'use strict';
/**
 * 활동 폴더 이름과 메모(메모.txt)를 글 엔진의 입력값으로 바꿉니다.
 *
 * 폴더 이름:  2026-09-17 2학년 안전체험관 현장체험학습
 *             → 날짜 2026년 9월 17일(목), 대상 2학년, 활동명 안전체험관 현장체험학습
 * 메모 형식:  "항목: 내용" 줄. 내용이 여러 줄이면 다음 항목 전까지 이어집니다. 항목 없이 쓴 글은 모두 '내용'으로 봅니다.
 *
 *   날짜: 2026년 9월 17일(목)      대상: 2학년          활동명: 안전체험관 현장체험학습
 *   내용:                           규모: 8개 학급 210명  강사: 제주안전체험관
 *   - 지진·화재·태풍 체험            목적: (강조할 목적)   소감: "재난 대피 방법을 알게 됐다" (큰따옴표면 그대로 인용, 없으면 간접 요약)
 *   - 심폐소생술 실습                발언: 교감 김영숙 — 뜻깊은 시간이었다
 *   문체: 보도자료|안내   시점: 완료|예정   문단: 3|4|5   기호: □|○|*   소제목: 예|아니오   연구학교: 예|아니오   담당자: 교감 김영숙
 */

const KEYS = [
  ['dateText', /^(날짜|일시|날)$/],
  ['target', /^(대상|학년)$/],
  ['activity', /^(활동명|활동|행사명|프로그램)$/],
  ['detail', /^(내용|활동\s*내용|활동내용|세부\s*내용|메모)$/],
  ['scale', /^(규모|시수|장소|규모[·\s]*시수[·\s]*장소|인원)$/],
  ['partner', /^(강사|협력기관|협력\s*기관|기관|협력기관[·\s]*강사)$/],
  ['effect', /^(목적|기대효과|목적[·\s]*기대효과|강조)$/],
  ['voice', /^(소감|참가자\s*소감|학생\s*소감|반응)$/],
  ['voiceMode', /^(소감\s*방식|소감방식)$/],
  ['quote2', /^(발언|대표자\s*발언|관계자\s*발언|교장\s*발언|교감\s*발언)$/],
  ['tone', /^(문체)$/],
  ['tense', /^(시점)$/],
  ['paras', /^(문단|문단\s*수)$/],
  ['mark', /^(기호|문단\s*기호)$/],
  ['subhead', /^(소제목)$/],
  ['iem', /^(연구학교|진로연계|I-E\.U\.M|꿈\s*이음)$/i],
  ['signer', /^(담당자|서명|끝에|표기)$/]
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateText(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일(${WEEKDAYS[d.getDay()]})`;
}

const TARGET_RE = /^(\d(?:[~\-·,]\d)?학년|전교생|전\s*학년|학부모(?:회)?|교원|교직원|전교학생회|학생회|\S+부|\S+단|유치원|돌봄교실|특수학급|신입생|졸업생)$/;

/** 폴더 이름 → { date, dateText, target, activity } */
function parseFolderName(name) {
  let rest = String(name || '').trim();
  let date = '';
  const dm = /^(\d{4})[.\-_ ]?(\d{2})[.\-_ ]?(\d{2})[.)]?\s*/.exec(rest);
  if (dm) { date = `${dm[1]}-${dm[2]}-${dm[3]}`; rest = rest.slice(dm[0].length).trim(); }
  let target = '';
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && TARGET_RE.test(tokens[0])) { target = tokens.shift(); }
  return { date, dateText: dateText(date), target, activity: tokens.join(' ').replace(/[_]+/g, ' ').trim() };
}

function yes(v) { return /^(예|네|응|y|yes|true|o|ㅇ|넣|포함|1)/i.test(String(v || '').trim()); }

/** 메모 본문 → 항목별 값 */
function parseMemo(text) {
  const lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = {};
  let cur = null;
  const free = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    // "항목: 내용" 또는 "[항목] 내용" 두 가지 표기를 받는다
    const m = /^\s*([^\s:：\[\]【】()]{1,12})\s*[:：]\s*(.*)$/.exec(line) || /^\s*[\[【]\s*([^\]】]{1,12}?)\s*[\]】]\s*[:：]?\s*(.*)$/.exec(line);
    const key = m ? KEYS.find(([, re]) => re.test(m[1].trim())) : null;
    if (key) {
      cur = key[0];
      out[cur] = (out[cur] ? out[cur] + '\n' : '') + m[2].trim();
    } else if (cur && line.trim()) {
      out[cur] += (out[cur] ? '\n' : '') + line.trim();
    } else if (line.trim()) {
      free.push(line.trim());
    }
    if (!line.trim() && cur !== 'detail') cur = null;   // 빈 줄이면 항목 끝 (내용은 계속)
  }
  if (free.length) out.detail = (out.detail ? out.detail + '\n' : '') + free.join('\n');
  return out;
}

/** 폴더 이름 + 메모 → 글 엔진 입력(form). 빠진 필수 항목은 missing 에 담습니다. */
function buildForm(folderName, memoText, defaults = {}) {
  const f = parseFolderName(folderName);
  const m = parseMemo(memoText);
  const voice = (m.voice || '').trim();
  const voiceMode = m.voiceMode ? (/인용|그대로|quote/i.test(m.voiceMode) ? 'quote' : 'polish')
    : voice ? (/["“”]/.test(voice) ? 'quote' : 'polish') : 'none';
  const form = {
    dateText: (m.dateText || f.dateText || '').trim(),
    target: (m.target || f.target || defaults.target || '').trim(),
    activity: (m.activity || f.activity || '').trim(),
    detail: (m.detail || '').trim(),
    scale: (m.scale || '').trim(),
    partner: (m.partner || '').trim(),
    effect: (m.effect || '').trim(),
    voiceMode,
    voice: voice.replace(/^["“]|["”]$/g, ''),
    quote2: (m.quote2 || '').trim(),
    tone: /안내|했습니다|polite/i.test(m.tone || '') ? 'polite' : 'report',
    tense: /예정|진행|앞으로|plan/i.test(m.tense || '') ? 'plan' : 'done',
    paras: ['3', '4', '5'].includes(String(m.paras || '').trim().replace(/개$/, '')) ? String(m.paras).trim().replace(/개$/, '') : '3',
    mark: ['□', '○', '*'].includes((m.mark || '').trim()) ? m.mark.trim() : '□',
    subhead: yes(m.subhead),
    iem: yes(m.iem),
    signer: (m.signer || defaults.signer || '').trim()
  };
  const missing = [];
  if (!form.target) missing.push('대상');
  if (!form.activity) missing.push('활동명');
  if (!form.detail) missing.push('내용');
  return { form, missing, folder: f };
}

module.exports = { parseFolderName, parseMemo, buildForm, dateText };
