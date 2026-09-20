'use strict';
/**
 * 홍보글 생성 — 화면에서 받은 값을 프롬프트로 조립하고, 선택한 AI 회사에 맞는 모듈로 호출합니다.
 * (Electron에 의존하지 않으므로 node --test 로 단위 시험할 수 있습니다.)
 */

const providers = require('./providers');
const builtinPrompt = require('./prompt');

const LLM = {
  anthropic: require('./llm/anthropic'),
  openai: require('./llm/openai'),
  gemini: require('./llm/gemini')
};

// 홍보글은 보통 1,000~2,000 토큰이지만, 모델이 답하기 전에 생각하는 분량도 여기에 포함되므로 넉넉히 둡니다.
// (실제 비용은 만들어진 토큰 수만큼만 듭니다.)
const MAX_TOKENS = 16000;

const EXAMPLES_INTRO = '다음은 우리 학교가 실제로 게시한 홍보글입니다. 문체와 구조를 따르되 문장을 그대로 베끼지는 마십시오. '
  + '예시마다 앞에 붙은 "─── … ───" 줄은 유형 표시일 뿐이므로 출력에는 쓰지 않습니다.';

const RESEARCH_HEADER = '[연구학교 참고자료]';

/**
 * 화면에서 받은 값을 프롬프트 입력으로 조립 (Apps Script 판과 같은 규칙).
 * research: 연구학교 참고자료 — "진로연계교육 연구학교 글"(f.iem)일 때만 끝에 덧붙입니다.
 */
function buildInput(f, research) {
  const lines = [];

  if (f.dateText) lines.push('날짜: ' + f.dateText);
  lines.push('대상: ' + f.target);
  lines.push('활동명: ' + f.activity);
  lines.push('활동 내용: ' + f.detail);
  if (f.scale) lines.push('규모·시수·장소: ' + f.scale);
  if (f.partner) lines.push('협력기관·강사: ' + f.partner);

  lines.push(f.effect
    ? '강조할 목적·기대효과: ' + f.effect
    : '목적·기대효과: 따로 주어지지 않았으므로 활동 내용에서 교육적 의미를 이끌어 내어 첫 문단과 마지막 문단에 자연스럽게 쓸 것');

  if (f.voiceMode === 'quote' && f.voice) {
    lines.push('참가자 소감(실제 발언 — 큰따옴표로 직접 인용하고 "라며", "라고 소감을 전했다"로 이을 것): ' + f.voice);
  } else if (f.voiceMode === 'polish' && f.voice) {
    lines.push('참가자 반응 키워드(실제로 나온 말 — 특정 인물을 지목하지 말고 "~라는 소감을 발표하며" 형태의 간접 요약 한 문장으로 다듬을 것): ' + f.voice);
  } else {
    lines.push('참가자 소감: 없음. 소감이나 발언을 지어내지 말고 무엇을 배웠는지 서술로만 마무리할 것');
  }

  if (f.quote2) lines.push('대표자·관계자 발언(실제 발언 — 직함과 이름을 밝히고 인용할 것): ' + f.quote2);

  lines.push('문체: ' + (f.tone === 'report' ? '보도자료체(~하였다)' : '안내체(~했습니다)'));
  lines.push('시점: ' + (f.tense === 'done' ? '이미 끝난 활동' : '진행 중이거나 앞으로 할 활동'));
  lines.push('문단 수: ' + f.paras + '개');
  lines.push('문단 기호: ' + f.mark);
  if (f.subhead) lines.push('각 문단 기호 뒤에 그 문단을 요약하는 짧은 소제목을 한 줄 넣고, 줄을 바꿔 본문을 쓸 것(첫 문단 제외)');
  const ref = f.iem && research ? String(research).trim() : '';
  if (f.iem) {
    lines.push('진로연계교육 연구학교 글: ' + (ref ? '아래 ' + RESEARCH_HEADER + '를 바탕으로 ' : '')
      + '이 활동이 <꿈 I-E.U.M 진로연계교육>과 진로주도성 신장에 어떻게 이어지는지 첫 문단이나 마지막 문단에서 자연스럽게 밝히고, '
      + '역량은 지난 글처럼 괄호 표기(예: 나(I)의 발견, 삶 이음(U), 꿈 이음(M))로 활동 내용과 연결해 녹일 것. 실제로 관련 있는 역량만 고르고, '
      + (ref ? '참고자료의 문장을 그대로 옮기거나 연구 개요를 길게 설명하지 말며, ' : '')
      + '활동에 없는 사실을 보태지 말 것');
  }
  if (f.signer) lines.push('마지막 문단 끝에 "(' + f.signer + ')"를 붙일 것');

  return lines.join('\n') + (ref ? '\n\n' + RESEARCH_HEADER + '\n' + ref : '');
}

/** 규칙과 예시로 시스템 프롬프트를 만듭니다. */
function buildSystemPrompt(rules, examples) {
  return rules + '\n\n' + EXAMPLES_INTRO + '\n\n' + examples;
}

/* ── 응답 해석 ──────────────────────────────────────────────────────────
 * 모델은 "제목: …\n---\n본문" 으로 답하라고 지시받지만 실제로는 예시 글처럼 구분선을 빼거나(제목 줄 바로 다음에 본문),
 * 구분선을 ***·───·- - - 로 바꾸거나, 마크다운(**제목:**, # 제목)을 섞거나, 앞뒤에 인사말·코드 울타리를 붙이거나,
 * 본문 첫 줄에 제목을 되풀이하기도 합니다. 어느 경우든 제목이 본문에 섞이지 않도록 너그럽게 읽습니다. */
const SEP_LINE = /^\s*(?:[-–—―─━═_*=~]\s*){3,}$/;                       // ---, ***, ___, ───, - - - 처럼 구분선으로만 된 줄
const TYPE_HEADER = /^\s*[─━]{2,}.*[─━]{2,}\s*$/;                         // 예시 파일의 "─── 유형 ───" 표시를 따라 쓴 줄
const FENCE_LINE = /^\s*```/;                                              // 마크다운 코드 울타리
const TITLE_LINE = /^[\s#>*_\[【]*(?:제\s*목|title)\s*(?:[:：]|[\]】]\s*[:：]?)\s*(.*?)\s*$/i;  // 제목: … / **제목:** … / [제목] …
const BODY_LABEL = /^[\s#>*_\[【]*본\s*문(?:\*\*|__)?\s*(?:[:：\]】]|$)\s*(.*?)\s*$/;           // 본문: … 표시
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;                             // # 제목 (마크다운 머리글)
const MARK_START = /^[□■○●◎◇◆•·*\-–—─━>]/;                              // 문단 기호로 시작하는 줄(본문)

const isNoise = line => !line.trim() || SEP_LINE.test(line) || TYPE_HEADER.test(line);

/** 제목 주변의 마크다운 강조·따옴표를 걷어냅니다. */
function cleanTitle(s) {
  let t = String(s || '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').replace(/\s*(?:[-–—―─━═_*=~]\s*){3,}$/, '').trim();
  const q = /^(["“'‘「『])(.+)(["”'’」』])$/.exec(t);
  if (q && !q[2].includes(q[1]) && !q[2].includes(q[3])) t = q[2].trim();
  return t;
}

/** "제목:" 표시가 없을 때, 이 줄을 제목으로 봐도 되는지 (짧고, 문단 기호로 시작하지 않고, 문장으로 끝나지 않음) */
function looksLikeTitle(line) {
  const t = cleanTitle(String(line || '').replace(HEADING, '$1'));
  return t.length > 0 && t.length <= 80 && !MARK_START.test(t) && !/[.。]$/.test(t) && !/[다요]$/.test(t);
}

/** 되풀이된 제목을 알아보기 위한 비교용 정규화 (기호·공백 무시) */
function norm(s) {
  return String(s || '').replace(/[\s"'“”‘’「」『』*_#`□■○●◎◇◆•·\-–—─━:：.,!?~()\[\]【】]/g, '');
}

/** 모델 응답을 제목과 본문으로 나눕니다. */
function parseArticle(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
    .filter(l => !FENCE_LINE.test(l));
  while (lines.length && isNoise(lines[0])) lines.shift();
  while (lines.length && isNoise(lines[lines.length - 1])) lines.pop();
  if (!lines.length) return { title: '', body: '' };

  let title = '';
  let bodyStart = 0;
  const LOOK = Math.min(lines.length, 8);          // 제목은 첫머리에 있어야 함 (그 앞은 인사말 등으로 보고 버림)

  let k = -1;
  for (let i = 0; i < LOOK; i++) if (TITLE_LINE.test(lines[i])) { k = i; break; }
  if (k >= 0) {
    title = cleanTitle(TITLE_LINE.exec(lines[k])[1]);
    bodyStart = k + 1;
    if (!title) {                                  // "제목:" 다음 줄에 제목을 쓴 경우
      while (bodyStart < lines.length && !lines[bodyStart].trim()) bodyStart++;
      if (bodyStart < lines.length && !isNoise(lines[bodyStart]) && looksLikeTitle(lines[bodyStart])) { title = cleanTitle(lines[bodyStart]); bodyStart++; }
    }
  } else {
    let s = -1;                                    // 표시 없이 구분선만 쓴 경우: 구분선 앞의 마지막 글줄이 제목
    for (let i = 1; i < LOOK; i++) if (SEP_LINE.test(lines[i])) { s = i; break; }
    if (s > 0) {
      let j = s - 1;
      while (j >= 0 && !lines[j].trim()) j--;
      if (j >= 0 && looksLikeTitle(lines[j])) { title = cleanTitle(lines[j].replace(HEADING, '$1')); bodyStart = s + 1; }
    }
    if (!title) {
      const h = HEADING.exec(lines[0]);
      if (h) { title = cleanTitle(h[1]); bodyStart = 1; }
      else if (lines.length > 1 && looksLikeTitle(lines[0])) {   // 첫 줄이 제목처럼 생겼고, 빈 줄이나 문단 기호가 뒤따르면 제목
        let n = 1;
        while (n < lines.length && !lines[n].trim()) n++;
        const next = (lines[n] || '').trim();
        if (n > 1 || MARK_START.test(next) || /^한라초/.test(next)) { title = cleanTitle(lines[0]); bodyStart = n; }
      }
    }
  }

  const body = lines.slice(bodyStart);
  const dropLeading = () => {
    while (body.length && isNoise(body[0])) body.shift();
    if (body.length) body[0] = body[0].replace(/^\s*(?:[-–—―─━═_*=~]\s*){3,}/, '');   // "---□ 본문" 처럼 붙은 구분선
  };
  dropLeading();
  for (let guard = 0; guard < 3 && body.length; guard++) {   // "본문:" 표시, 되풀이된 제목 제거
    const first = body[0];
    const label = BODY_LABEL.exec(first);
    if (label) { if (label[1]) body[0] = label[1]; else body.shift(); dropLeading(); continue; }
    if (TITLE_LINE.test(first)) { if (!title) title = cleanTitle(TITLE_LINE.exec(first)[1]); body.shift(); dropLeading(); continue; }
    if (title && norm(first) === norm(title)) { body.shift(); dropLeading(); continue; }
    break;
  }
  while (body.length && isNoise(body[body.length - 1])) body.pop();
  return { title, body: body.join('\n').trim() };
}

/**
 * 토큰 사용량으로 비용을 어림합니다(미국 달러). 목록에 없는 모델은 usd 가 null 입니다.
 * Claude 의 캐시 저장(cacheWriteTokens)은 입력 단가의 1.25배, 캐시 읽기는 회사별 캐시 단가를 씁니다.
 */
function summarizeUsage(usage, providerId, modelId) {
  const provider = providers.get(providerId);
  const model = providers.findModel(provider.id, modelId);
  const u = usage || {};
  const inputTokens = u.inputTokens || 0;
  const cachedTokens = u.cachedTokens || 0;
  const cacheWriteTokens = u.cacheWriteTokens || 0;
  const outputTokens = u.outputTokens || 0;
  let usd = null;
  if (model) {
    const plain = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
    usd = (plain * model.inputPrice
      + cacheWriteTokens * model.inputPrice * 1.25
      + cachedTokens * model.cachedPrice
      + outputTokens * model.outputPrice) / 1e6;
  }
  return {
    provider: provider.id,
    providerLabel: provider.short,
    model: modelId,
    modelLabel: model ? model.label.split(' — ')[0] : modelId,
    inputTokens, cachedTokens, outputTokens, usd
  };
}

/** 오류를 사용자에게 보여 줄 한국어 문장으로 바꿉니다. */
function describeError(err, providerId) {
  const impl = LLM[providerId] || LLM[providers.get(providerId).id];
  return impl.describeError(err);
}

/**
 * 홍보글 생성.
 * @param {object} form  화면 입력값
 * @param {object} opts  { provider, apiKey, model, rules, examples, research?, baseURL? }
 * @returns {Promise<{title:string, body:string, truncated:boolean, usage:object}>}
 */
async function generateArticle(form, opts) {
  const provider = providers.get(opts.provider);
  const model = ((opts.model || '').trim() || provider.defaultModel);
  const impl = LLM[provider.id];

  const r = await impl.generate({
    apiKey: opts.apiKey,
    model,
    system: buildSystemPrompt(opts.rules, opts.examples),
    input: buildInput(form, opts.research || builtinPrompt.RESEARCH),
    maxTokens: MAX_TOKENS,
    baseURL: opts.baseURL
  });

  if (r.refused) {
    throw new Error('모델이 이 요청에는 글을 쓰지 않겠다고 답했습니다. 입력 내용을 조금 바꿔 다시 시도해 주세요.');
  }
  if (!r.text) throw new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');

  const article = parseArticle(r.text);
  if (!article.title && !article.body) throw new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');
  return {
    title: article.title,
    body: article.body,
    truncated: !!r.truncated,
    usage: summarizeUsage(r.usage, provider.id, model)
  };
}

module.exports = {
  MAX_TOKENS, RESEARCH_HEADER,
  buildInput, buildSystemPrompt, parseArticle, summarizeUsage, describeError, generateArticle
};
