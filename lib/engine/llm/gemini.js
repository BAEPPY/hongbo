'use strict';
/** Gemini (Google) 호출 — Gemini API (@google/genai) */
const { GoogleGenAI, ApiError } = require('@google/genai');

async function generate({ apiKey, model, system, input, maxTokens, baseURL }) {
  const httpOptions = { timeout: 5 * 60 * 1000 };
  const base = baseURL || process.env.HALLA_GEMINI_BASE_URL; // 시험용 가짜 서버 주소
  if (base) httpOptions.baseUrl = base;
  const ai = new GoogleGenAI({ apiKey, httpOptions });
  const res = await ai.models.generateContent({
    model,
    contents: input,
    config: { systemInstruction: system, maxOutputTokens: maxTokens }
  });
  const cand = (res.candidates || [])[0];
  const finish = cand && cand.finishReason;
  const blocked = !!(res.promptFeedback && res.promptFeedback.blockReason);
  let text = '';
  try { text = (res.text || '').trim(); } catch (e) { text = ''; }
  if (!text && cand && cand.content && Array.isArray(cand.content.parts)) {
    text = cand.content.parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
  }
  const u = res.usageMetadata || {};
  return {
    text,
    refused: blocked || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST',
    truncated: finish === 'MAX_TOKENS',
    usage: {
      inputTokens: u.promptTokenCount || 0,
      cachedTokens: u.cachedContentTokenCount || 0,
      cacheWriteTokens: 0,
      outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)
    }
  };
}

function describeError(err) {
  if (err instanceof ApiError) {
    const s = err.status;
    const m = err.message || '';
    if (s === 400 && /api key/i.test(m)) return 'Gemini API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.';
    if (s === 401 || s === 403) return 'Gemini API 키가 올바르지 않거나 권한이 없습니다. 설정에서 키를 확인해 주세요.';
    if (s === 429) return '요청 한도를 넘었습니다. 무료 등급이면 1분쯤 뒤에 다시 눌러 주세요. 계속되면 Google AI Studio 에서 결제·한도를 확인해 주세요.';
    if (s === 404) return '선택한 Gemini 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 주세요.';
    if (s === 400) return '요청이 잘못되어 글을 만들지 못했습니다 (400). ' + m;
    if (s >= 500) return 'Google 서버 쪽 오류입니다. 잠시 후 다시 눌러 주세요.';
    return '글을 만들지 못했습니다 (' + s + '). ' + m;
  }
  if (err && /fetch failed|ECONN|ENOTFOUND|network|timeout|abort/i.test(err.message || '')) {
    return '인터넷 연결을 확인해 주세요. Google 서버에 접속하지 못했습니다.';
  }
  return (err && err.message) || String(err);
}

module.exports = { generate, describeError };
