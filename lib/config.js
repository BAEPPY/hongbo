'use strict';
/**
 * 설정 파일: <홈>/.hongbo/config.json
 *
 *   provider          글을 만들 AI 회사 (anthropic | openai | gemini)
 *   providers.<id>    { apiKey, model }
 *   school            { name, short, phone, principal }
 *   photoRoot         활동 사진 폴더(그 아래 활동별 하위 폴더)
 *   board             교육청 학교소식 게시판 { listUrl, category, region, trailer }
 *   photos            { max, maxSide }
 *   scan              { pages }
 *
 * API 키는 환경 변수(ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY|GOOGLE_API_KEY)가 있으면 그것을 우선합니다.
 * 키는 이 컴퓨터의 사용자 폴더에 평문으로 저장되므로, 공용 컴퓨터에서는 환경 변수 방식을 쓰세요.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const providers = require('./engine/providers');

const DEFAULTS = {
  provider: 'anthropic',
  providers: {},
  school: { name: '한라초등학교', short: '한라초', phone: '064-740-9500', principal: '오상남' },
  photoRoot: '',
  board: {
    listUrl: 'https://www.jje.go.kr/board/list.jje?boardId=BBS_0000217&menuCd=DOM_000000202001000000',
    searchUrl: 'https://www.jje.go.kr/board/list.jje?boardId=BBS_0000217&menuCd=DOM_000000202001000000&searchType=DATA_TITLE&keyword=',
    category: '유치원/초등학교',
    region: '제주시',
    trailer: true
  },
  schoolSite: {
    newsUrl: 'https://school.jje.go.kr/halla-e/na/ntt/selectNttList.do?mi=104437&bbsId=114350'
  },
  photos: { max: 4, maxSide: 1600 },
  scan: { pages: 1, maxPages: 3, delayMs: 1500 }
};

function home() {
  return process.env.HONGBO_HOME || path.join(os.homedir(), '.hongbo');
}
function file() { return path.join(home(), 'config.json'); }

function deepMerge(base, over) {
  const out = Object.assign({}, base);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

function readRaw() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { return {}; }
}
function load() { return deepMerge(DEFAULTS, readRaw()); }
function save(patch) {
  fs.mkdirSync(home(), { recursive: true });
  const next = deepMerge(readRaw(), patch);
  fs.writeFileSync(file(), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return load();
}

/** 점 표기 경로로 값 설정: set('school.phone', '064-…') */
function setPath(dotted, value) {
  const keys = dotted.split('.');
  const patch = {};
  let cur = patch;
  keys.forEach((k, i) => { if (i === keys.length - 1) cur[k] = value; else cur = cur[k] = {}; });
  return save(patch);
}

function apiKey(providerId, cfg) {
  const c = cfg || load();
  const p = providers.get(providerId || c.provider);
  for (const env of p.envKeys) if (process.env[env]) return process.env[env].trim();
  return ((c.providers[p.id] || {}).apiKey || '').trim();
}
function model(providerId, cfg) {
  const c = cfg || load();
  const p = providers.get(providerId || c.provider);
  return ((c.providers[p.id] || {}).model || '').trim() || p.defaultModel;
}

/** 키 원문을 감춘 요약 (화면·채팅 출력용) */
function summary(cfg) {
  const c = cfg || load();
  const out = Object.assign({}, c, { providers: {} });
  for (const p of providers.PROVIDERS) {
    const key = apiKey(p.id, c);
    out.providers[p.id] = {
      hasKey: !!key,
      keyHint: key ? key.slice(0, 7) + '…' + key.slice(-4) : '',
      fromEnv: p.envKeys.some(e => !!process.env[e]),
      model: model(p.id, c)
    };
  }
  out.configPath = file();
  return out;
}

module.exports = { DEFAULTS, home, file, load, save, setPath, apiKey, model, summary };
