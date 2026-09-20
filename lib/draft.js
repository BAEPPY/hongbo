'use strict';
/**
 * 초안 만들기: 활동 폴더의 이름·메모 → 글 엔진(hallahongbo 와 같은 규칙·예시·연구학교 자료) → .hongbo/draft.json
 * 규칙·예시·참고자료는 <홈>/.hongbo/prompt/{rules,examples,research}.txt 가 있으면 그것을, 없으면 내장본을 씁니다.
 */
const fs = require('fs');
const path = require('path');
const engine = require('./engine/api');
const builtin = require('./engine/prompt');
const config = require('./config');
const folders = require('./folders');
const memo = require('./memo');

function promptFiles() {
  const dir = path.join(config.home(), 'prompt');
  const read = (name, fallback) => {
    try { const t = fs.readFileSync(path.join(dir, name), 'utf8').replace(/^﻿/, '').trim(); return t || fallback; } catch (e) { return fallback; }
  };
  return {
    dir,
    rules: read('rules.txt', builtin.RULES),
    examples: read('examples.txt', builtin.EXAMPLES),
    research: read('research.txt', builtin.RESEARCH),
    custom: ['rules', 'examples', 'research'].filter(k => fs.existsSync(path.join(dir, k + '.txt')))
  };
}

/** 편집용 파일이 없으면 내장본으로 만들어 둡니다. */
function ensurePromptFiles() {
  const dir = path.join(config.home(), 'prompt');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of [['rules.txt', builtin.RULES], ['examples.txt', builtin.EXAMPLES], ['research.txt', builtin.RESEARCH]]) {
    const f = path.join(dir, name);
    if (!fs.existsSync(f)) fs.writeFileSync(f, text + '\n', 'utf8');
  }
  return dir;
}

/** 시험용 가짜 서버 주소 (환경 변수). 평소에는 비어 있어 실제 API 로 갑니다. */
function testBaseUrl(providerId) {
  const env = { anthropic: 'ANTHROPIC_BASE_URL', openai: 'OPENAI_BASE_URL', gemini: 'HALLA_GEMINI_BASE_URL' }[providerId];
  return env && process.env[env] ? process.env[env] : undefined;
}

/** 폴더 → 입력값 (메모가 없어도 폴더 이름으로 만들 수 있는 만큼) */
function formFor(dir, cfg, extra = {}) {
  const text = folders.readMemo(dir) || '';
  const built = memo.buildForm(path.basename(dir), text, { signer: (cfg.school && cfg.school.signer) || '' });
  const form = Object.assign(built.form, extra.form || {});
  if (extra.note) form.detail = (form.detail ? form.detail + '\n' : '') + '(수정 요청: ' + extra.note.trim() + ')';
  const missing = built.missing.filter(k => !(k === '내용' && form.detail) && !(k === '대상' && form.target) && !(k === '활동명' && form.activity));
  return { form, missing, memoText: text, folder: built.folder };
}

/**
 * @param {string} dir  활동 폴더
 * @param {object} cfg  설정
 * @param {{provider?:string, model?:string, note?:string, form?:object, baseURL?:string}} opts
 */
async function makeDraft(dir, cfg, opts = {}) {
  const providerId = opts.provider || cfg.provider;
  const apiKey = config.apiKey(providerId, cfg);
  if (!apiKey) throw new Error(`${providerId} API 키가 없습니다. "hongbo config set-key ${providerId} <키>" 로 넣어 주세요.`);
  const { form, missing, memoText } = formFor(dir, cfg, opts);
  if (missing.length) {
    throw new Error(`메모에 ${missing.join('·')}이(가) 없어 글을 만들 수 없습니다. 폴더에 메모.txt 를 만들어 "${missing.map(k => k + ': …').join('", "')}" 줄을 적어 주세요.`);
  }
  const p = promptFiles();
  const r = await engine.generateArticle(form, {
    provider: providerId, apiKey, model: opts.model || config.model(providerId, cfg),
    rules: p.rules, examples: p.examples, research: p.research, baseURL: opts.baseURL || testBaseUrl(providerId)
  });
  const draft = {
    createdAt: new Date().toISOString(),
    title: r.title, body: r.body, truncated: r.truncated, usage: r.usage,
    form, memoText, note: opts.note || '',
    customPrompt: p.custom
  };
  folders.setState(dir, 'draft', draft);
  folders.clearState(dir, 'approved');   // 새 초안이 생기면 이전 승인은 무효
  return draft;
}

/** 채팅이나 확인 창에서 고친 제목·본문을 초안에 반영 */
function updateDraft(dir, patch) {
  const cur = folders.state(dir, 'draft');
  if (!cur) throw new Error('아직 초안이 없습니다. 먼저 초안을 만들어 주세요.');
  const next = Object.assign({}, cur, { title: patch.title != null ? String(patch.title).trim() : cur.title, body: patch.body != null ? String(patch.body).replace(/\r\n?/g, '\n').trim() : cur.body, editedAt: new Date().toISOString() });
  folders.setState(dir, 'draft', next);
  folders.clearState(dir, 'approved');
  return next;
}

module.exports = { promptFiles, ensurePromptFiles, formFor, makeDraft, updateDraft };
