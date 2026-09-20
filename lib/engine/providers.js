'use strict';
/**
 * 쓸 수 있는 AI 회사(제공자)와 모델 목록.
 *
 * 가격은 100만 토큰당 미국 달러(입력 / 캐시된 입력 / 출력)이며 화면의 어림 비용 표시에만 씁니다.
 * 회사별 가격표에서 확인한 날짜: PRICED_AT. 바뀌면 여기 숫자만 고치면 됩니다.
 * 목록에 없는 모델은 설정 창에서 "직접 입력"으로 쓸 수 있습니다(가격은 표시되지 않음).
 */

const PRICED_AT = '2026-09';

const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    short: 'Claude',
    note: '결제 수단 등록 후 선불 충전(5달러부터). 규칙·예시를 캐시해 두어 5분 안에 다시 쓰면 입력 비용이 크게 줄어듭니다.',
    keyPrefix: 'sk-ant-',
    envKeys: ['ANTHROPIC_API_KEY'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    usageUrl: 'https://console.anthropic.com/settings/billing',
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — 기본값. 품질과 비용의 균형', inputPrice: 2, cachedPrice: 0.2, outputPrice: 10 },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — 가장 저렴. 문장이 조금 단조로울 수 있음', inputPrice: 1, cachedPrice: 0.1, outputPrice: 5 },
      { id: 'claude-opus-5', label: 'Claude Opus 5 — 가장 정교. 비용이 약 2.5배', inputPrice: 5, cachedPrice: 0.5, outputPrice: 25 }
    ]
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    short: 'ChatGPT',
    note: 'platform.openai.com 에서 결제 수단을 등록하고 크레딧을 충전한 뒤 API 키를 만듭니다. ChatGPT Plus 구독과는 별개 요금입니다.',
    keyPrefix: 'sk-',
    envKeys: ['OPENAI_API_KEY'],
    keyUrl: 'https://platform.openai.com/api-keys',
    usageUrl: 'https://platform.openai.com/usage',
    defaultModel: 'gpt-5.6-terra',
    models: [
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — 기본값. 품질과 비용의 균형', inputPrice: 2, cachedPrice: 0.2, outputPrice: 12 },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — 상위 모델. 비용이 약 2배', inputPrice: 4, cachedPrice: 0.4, outputPrice: 20 },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — 가장 저렴. 문장이 조금 단조로울 수 있음', inputPrice: 0.2, cachedPrice: 0.02, outputPrice: 1.2 }
    ]
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    short: 'Gemini',
    note: 'Google AI Studio 에서 키를 만듭니다. 무료 등급이 있지만 무료 등급에서는 입력 내용이 Google 제품 개선에 쓰일 수 있으니, 학교 글에는 결제를 연결한 유료 등급을 권합니다.',
    keyPrefix: 'AIza',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    keyUrl: 'https://aistudio.google.com/apikey',
    usageUrl: 'https://aistudio.google.com/',
    defaultModel: 'gemini-3.8-flash',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — 기본값. 빠르고 저렴', inputPrice: 0.75, cachedPrice: 0.075, outputPrice: 3.75 },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (미리보기) — 상위 모델', inputPrice: 2, cachedPrice: 0.2, outputPrice: 12 },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — 이전 세대. 가장 저렴', inputPrice: 0.3, cachedPrice: 0.03, outputPrice: 2.5 }
    ]
  }
];

function get(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

function isKnown(id) {
  return PROVIDERS.some(p => p.id === id);
}

function findModel(providerId, modelId) {
  return get(providerId).models.find(m => m.id === modelId) || null;
}

/** 화면에 보낼 목록(가격·환경 변수 이름 제외) */
function forUi() {
  return PROVIDERS.map(p => ({
    id: p.id, label: p.label, short: p.short, note: p.note, keyPrefix: p.keyPrefix,
    keyUrl: p.keyUrl, usageUrl: p.usageUrl, defaultModel: p.defaultModel,
    models: p.models.map(m => ({ id: m.id, label: m.label }))
  }));
}

module.exports = { PRICED_AT, PROVIDERS, get, isKnown, findModel, forUi };
