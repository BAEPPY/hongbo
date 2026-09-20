'use strict';
/** ChatGPT (OpenAI) 호출 — Responses API */
const OpenAI = require('openai');

async function generate({ apiKey, model, system, input, maxTokens, baseURL }) {
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 2, timeout: 5 * 60 * 1000 });
  const res = await client.responses.create({
    model,
    instructions: system,
    input,
    max_output_tokens: maxTokens
  });
  let text = typeof res.output_text === 'string' ? res.output_text : '';
  if (!text) {
    text = (res.output || [])
      .flatMap(o => (o && o.content) || [])
      .filter(c => c && c.type === 'output_text')
      .map(c => c.text)
      .join('\n');
  }
  const refused = (res.output || []).some(o => o && o.type === 'message'
    && (o.content || []).some(c => c && c.type === 'refusal'));
  const u = res.usage || {};
  return {
    text: text.trim(),
    refused,
    truncated: res.status === 'incomplete' && !!res.incomplete_details && res.incomplete_details.reason === 'max_output_tokens',
    usage: {
      inputTokens: u.input_tokens || 0,
      cachedTokens: (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0,
      cacheWriteTokens: 0,
      outputTokens: u.output_tokens || 0
    }
  };
}

function describeError(err) {
  if (err instanceof OpenAI.AuthenticationError) return 'OpenAI API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.';
  if (err instanceof OpenAI.RateLimitError) {
    if (err.code === 'insufficient_quota' || /quota|billing/i.test(err.message || '')) {
      return 'OpenAI 크레딧(잔액)이 부족합니다. platform.openai.com 의 Billing 에서 충전해 주세요.';
    }
    return '요청이 몰렸습니다. 30초쯤 뒤에 다시 눌러 주세요.';
  }
  if (err instanceof OpenAI.PermissionDeniedError) return '이 OpenAI API 키로는 요청할 수 없습니다. 키의 권한이나 프로젝트 설정을 확인해 주세요.';
  if (err instanceof OpenAI.NotFoundError) return '선택한 OpenAI 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 주세요.';
  if (err instanceof OpenAI.BadRequestError) return '요청이 잘못되어 글을 만들지 못했습니다 (400). ' + err.message;
  if (err instanceof OpenAI.InternalServerError) return 'OpenAI 서버 쪽 오류입니다. 잠시 후 다시 눌러 주세요.';
  if (err instanceof OpenAI.APIConnectionTimeoutError) return '응답이 너무 오래 걸려 중단했습니다. 다시 눌러 주세요.';
  if (err instanceof OpenAI.APIConnectionError) return '인터넷 연결을 확인해 주세요. OpenAI 서버에 접속하지 못했습니다.';
  if (err instanceof OpenAI.APIError) return '글을 만들지 못했습니다 (' + err.status + '). ' + err.message;
  return (err && err.message) || String(err);
}

module.exports = { generate, describeError };
