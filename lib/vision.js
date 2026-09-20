'use strict';
/**
 * 사진 한 장을 보고 게시 적합성을 판단합니다 (선택 기능 — API 키가 있을 때만).
 * 어느 회사 모델이든 같은 JSON 을 돌려주게 합니다:
 *   { facesCloseup: 얼굴이 크게·식별 가능하게 나옴, people: 대략 인원, blurry: 흐림, showsActivity: 활동이 드러남, caption: 한 문장 }
 */
const providers = require('./engine/providers');

const PROMPT = [
  '학교 홈페이지에 올릴 활동 사진을 검토합니다. 아래 JSON 형식으로만 답하세요. 다른 말은 쓰지 마세요.',
  '{"facesCloseup": true|false, "people": 숫자, "blurry": true|false, "showsActivity": true|false, "caption": "사진 설명 한 문장(한국어)"}',
  '- facesCloseup: 어린이 얼굴이 크게 나와 누구인지 알아볼 수 있으면 true. 뒷모습·멀리서 찍은 단체·작게 나온 얼굴은 false.',
  '- people: 사진에 보이는 사람 수(대략). 없으면 0.',
  '- blurry: 초점이 흐리거나 심하게 어두우면 true.',
  '- showsActivity: 무엇을 하는 활동인지 사진만 보고 알 수 있으면 true.'
].join('\n');

function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) throw new Error('사진 판정 응답을 읽을 수 없습니다: ' + String(text).slice(0, 120));
  const j = JSON.parse(m[0]);
  return {
    facesCloseup: !!j.facesCloseup,
    people: Number.isFinite(Number(j.people)) ? Number(j.people) : 0,
    blurry: !!j.blurry,
    showsActivity: !!j.showsActivity,
    caption: String(j.caption || '').trim()
  };
}

async function anthropic({ apiKey, model, image, mime, baseURL }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, baseURL: baseURL || process.env.ANTHROPIC_BASE_URL || undefined, timeout: 60000, maxRetries: 2 });
  const res = await client.messages.create({
    model, max_tokens: 300,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } }, { type: 'text', text: PROMPT }] }]
  });
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

async function openai({ apiKey, model, image, mime, baseURL }) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, baseURL: baseURL || process.env.OPENAI_BASE_URL || undefined, timeout: 60000, maxRetries: 2 });
  const res = await client.responses.create({
    model, max_output_tokens: 300,
    input: [{ role: 'user', content: [{ type: 'input_image', image_url: `data:${mime};base64,${image.toString('base64')}`, detail: 'low' }, { type: 'input_text', text: PROMPT }] }]
  });
  return res.output_text || '';
}

async function gemini({ apiKey, model, image, mime, baseURL }) {
  const { GoogleGenAI } = require('@google/genai');
  const httpOptions = { timeout: 60000 };
  const base = baseURL || process.env.HALLA_GEMINI_BASE_URL;
  if (base) httpOptions.baseUrl = base;
  const ai = new GoogleGenAI({ apiKey, httpOptions });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: image.toString('base64') } }, { text: PROMPT }] }],
    config: { maxOutputTokens: 300 }
  });
  return res.text || '';
}

const IMPL = { anthropic, openai, gemini };

/** @param {{provider:string, apiKey:string, model:string, image:Buffer, mime?:string, baseURL?:string}} o */
async function analyzeImage(o) {
  const p = providers.get(o.provider);
  const text = await IMPL[p.id](Object.assign({ mime: 'image/jpeg' }, o));
  return parseJson(text);
}

module.exports = { analyzeImage, parseJson, PROMPT };
