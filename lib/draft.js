'use strict';
/**
 * 초안 만들기: 활동 폴더의 이름·메모 → 글 엔진(hallahongbo 와 같은 규칙·예시·연구학교 자료) → .hongbo/draft.json
 *
 * 학교 맞춤: 설정의 school(이름·약칭·교장)이 한라초가 아니면 규칙·예시 속 학교명과 교장 이름을 우리 학교로 바꿔 씁니다.
 * 연구학교 자료(research)는 한라초 전용이므로 다른 학교는 <홈>/.hongbo/prompt/research.txt 를 직접 채웠을 때만 씁니다.
 * 보관함(archive)에 다른 학교 글이 있으면 최근 글 몇 편을 참고 예시로 덧붙입니다 (주제·표현 참고용, 사실은 옮기지 않도록 안내).
 * 규칙·예시·참고자료는 <홈>/.hongbo/prompt/{rules,examples,research}.txt 가 있으면 그것을, 없으면 내장본을 씁니다.
 */
const fs = require('fs');
const path = require('path');
const engine = require('./engine/api');
const providers = require('./engine/providers');
const builtin = require('./engine/prompt');
const config = require('./config');
const folders = require('./folders');
const memo = require('./memo');
const archive = require('./archive');

const LLM = { anthropic: require('./engine/llm/anthropic'), openai: require('./engine/llm/openai'), gemini: require('./engine/llm/gemini') };

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

/** 설정의 학교 정보 */
function schoolProfile(cfg) {
  const s = (cfg && cfg.school) || {};
  const name = (s.name || '한라초등학교').trim();
  return { name, short: (s.short || name.replace(/등학교$/, '')).trim(), principal: (s.principal || '').trim(), isHalla: name === '한라초등학교' };
}

/** 내장 규칙·예시는 한라초 기준으로 쓰여 있어, 다른 학교면 학교명·교장 이름을 바꿔 씁니다. */
function adaptToSchool(text, school) {
  if (school.isHalla) return text;
  let t = String(text || '');
  t = school.principal ? t.split('오상남').join(school.principal) : t.replace(/\(교장 오상남\)/g, '');
  t = t.split('한라초등학교').join(school.name).split('한라초').join(school.short);
  return t;
}

/** 보관함의 최근 다른 학교 글을 참고 예시 블록으로 */
function recentExamplesBlock(cfg, school) {
  const n = cfg.draft && cfg.draft.recentExamples;
  if (!n) return '';
  let text = '';
  try { text = archive.exportExamples({ max: n, excludeKindergarten: true, minParagraphs: 3 }); } catch (e) { return ''; }
  if (!text) return '';
  return '\n\n─── 아래는 제주 다른 초등학교들이 최근 교육청 학교소식에 올린 글입니다. 주제와 표현만 참고하고, 학교명·인물·사실은 절대 옮기지 마십시오 ───\n\n' + text;
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

/** 시험용 가짜 서버 주소 (환경 변수). 평소에는 비어 있어 실제 API 로 갑니다. */
function testBaseUrl(providerId) {
  const env = { anthropic: 'ANTHROPIC_BASE_URL', openai: 'OPENAI_BASE_URL', gemini: 'HALLA_GEMINI_BASE_URL' }[providerId];
  return env && process.env[env] ? process.env[env] : undefined;
}

/**
 * 프롬프트 조립: 시스템(규칙+예시)과 입력. 학교 맞춤과 연구학교 자료 처리를 여기서 합니다.
 * @returns {{system:string, input:string, warnings:string[], school:object}}
 */
function buildPrompt(form, cfg, p) {
  const school = schoolProfile(cfg);
  const warnings = [];
  const rules = adaptToSchool(p.rules, school);
  const examples = adaptToSchool(p.examples, school) + recentExamplesBlock(cfg, school);
  let input;
  if (school.isHalla) {
    input = engine.buildInput(form, p.research);                       // 한라초: 엔진의 연구학교 지시문 그대로
  } else {
    input = engine.buildInput(Object.assign({}, form, { iem: false }));
    if (form.iem) {
      if (p.custom.includes('research')) {
        input += '\n연구학교·특색교육 글: 아래 [연구학교 참고자료]를 바탕으로 이 활동이 연구 주제와 어떻게 이어지는지 첫 문단이나 마지막 문단에서 자연스럽게 밝힐 것. '
          + '자료의 문장을 그대로 옮기거나 연구 개요를 길게 설명하지 말고, 활동에 없는 사실을 보태지 말 것\n\n[연구학교 참고자료]\n' + p.research.trim();
      } else {
        warnings.push('연구학교 자료는 한라초 전용이라 적용하지 않았습니다. 우리 학교 자료를 쓰려면 "hongbo prompt files" 로 만든 research.txt 를 채워 주세요.');
      }
    }
  }
  return { system: engine.buildSystemPrompt(rules, examples), input, warnings, school };
}

/** 엔진의 generateArticle 과 같은 절차이나, 조립한 프롬프트를 그대로 보낼 수 있게 분리 */
async function callModel({ providerId, apiKey, model, system, input, baseURL }) {
  const provider = providers.get(providerId);
  const impl = LLM[provider.id];
  const r = await impl.generate({ apiKey, model, system, input, maxTokens: engine.MAX_TOKENS, baseURL });
  if (r.refused) throw new Error('모델이 이 요청에는 글을 쓰지 않겠다고 답했습니다. 입력 내용을 조금 바꿔 다시 시도해 주세요.');
  if (!r.text) throw new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');
  const article = engine.parseArticle(r.text);
  if (!article.title && !article.body) throw new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');
  return { title: article.title, body: article.body, truncated: !!r.truncated, usage: engine.summarizeUsage(r.usage, provider.id, model) };
}

/**
 * @param {string} dir  활동 폴더
 * @param {object} cfg  설정
 * @param {{provider?:string, model?:string, note?:string, form?:object, baseURL?:string}} opts
 */
async function makeDraft(dir, cfg, opts = {}) {
  const providerId = providers.get(opts.provider || cfg.provider).id;
  const apiKey = config.apiKey(providerId, cfg);
  if (!apiKey) throw new Error(`${providerId} API 키가 없습니다. "hongbo config set-key ${providerId} <키>" 로 넣어 주세요.`);
  const { form, missing, memoText } = formFor(dir, cfg, opts);
  if (missing.length) {
    throw new Error(`메모에 ${missing.join('·')}이(가) 없어 글을 만들 수 없습니다. 폴더에 메모.txt 를 만들어 "${missing.map(k => k + ': …').join('", "')}" 줄을 적어 주세요.`);
  }
  const p = promptFiles();
  const prompt = buildPrompt(form, cfg, p);
  const model = opts.model || config.model(providerId, cfg);
  const r = await callModel({ providerId, apiKey, model, system: prompt.system, input: prompt.input, baseURL: opts.baseURL || testBaseUrl(providerId) });
  const draft = {
    createdAt: new Date(Date.now()).toISOString(),
    title: r.title, body: r.body, truncated: r.truncated, usage: r.usage,
    form, memoText, note: opts.note || '',
    school: prompt.school.name,
    customPrompt: p.custom,
    warnings: prompt.warnings
  };
  folders.setState(dir, 'draft', draft);
  folders.clearState(dir, 'approved');   // 새 초안이 생기면 이전 승인은 무효
  return draft;
}

/** 채팅이나 확인 창에서 고친 제목·본문을 초안에 반영 */
function updateDraft(dir, patch) {
  const cur = folders.state(dir, 'draft');
  if (!cur) throw new Error('아직 초안이 없습니다. 먼저 초안을 만들어 주세요.');
  const next = Object.assign({}, cur, { title: patch.title != null ? String(patch.title).trim() : cur.title, body: patch.body != null ? String(patch.body).replace(/\r\n?/g, '\n').trim() : cur.body, editedAt: new Date(Date.now()).toISOString() });
  folders.setState(dir, 'draft', next);
  folders.clearState(dir, 'approved');
  return next;
}

module.exports = { promptFiles, ensurePromptFiles, schoolProfile, adaptToSchool, recentExamplesBlock, buildPrompt, formFor, makeDraft, updateDraft };
