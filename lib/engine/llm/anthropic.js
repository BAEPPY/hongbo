'use strict';
/** Claude (Anthropic) 호출 */
const Anthropic = require('@anthropic-ai/sdk');

async function generate({ apiKey, model, system, input, maxTokens, baseURL }) {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 2, timeout: 5 * 60 * 1000 });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // 규칙·예시는 매번 같으므로 캐시해 둡니다. 5분 안에 다시 쓰면 입력 비용이 크게 줄어듭니다.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: input }]
  });
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const u = res.usage || {};
  return {
    text,
    refused: res.stop_reason === 'refusal',
    truncated: res.stop_reason === 'max_tokens',
    usage: {
      inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
      cachedTokens: u.cache_read_input_tokens || 0,
      cacheWriteTokens: u.cache_creation_input_tokens || 0,
      outputTokens: u.output_tokens || 0
    }
  };
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Claude API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.';
  if (err instanceof Anthropic.PermissionDeniedError) return '이 Claude API 키로는 요청할 수 없습니다. Anthropic 콘솔에서 키의 권한을 확인해 주세요.';
  if (err instanceof Anthropic.RateLimitError) return '요청이 몰렸습니다. 30초쯤 뒤에 다시 눌러 주세요.';
  if (err instanceof Anthropic.NotFoundError) return '선택한 Claude 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 주세요.';
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit|billing/i.test(err.message || '')) return 'Claude API 잔액이 부족합니다. Anthropic 콘솔(Billing)에서 결제 정보를 확인해 주세요.';
    return '요청이 잘못되어 글을 만들지 못했습니다 (400). ' + err.message;
  }
  if (err instanceof Anthropic.InternalServerError) return 'Anthropic 서버 쪽 오류입니다. 잠시 후 다시 눌러 주세요.';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return '응답이 너무 오래 걸려 중단했습니다. 다시 눌러 주세요.';
  if (err instanceof Anthropic.APIConnectionError) return '인터넷 연결을 확인해 주세요. Anthropic 서버에 접속하지 못했습니다.';
  if (err instanceof Anthropic.APIError) return '글을 만들지 못했습니다 (' + err.status + '). ' + err.message;
  return (err && err.message) || String(err);
}

module.exports = { generate, describeError };
