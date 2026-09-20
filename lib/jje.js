'use strict';
/**
 * 제주특별자치도교육청 누리집 "제주교육소식 > 학교소식 > 유치원/초등학교" 게시판 읽기.
 *
 * 이 누리집의 robots.txt 는 검색엔진(네이버·다음·구글) 외의 자동 수집을 금지하고 있습니다.
 * 그래서 이 모듈은 사람이 아침에 한 번 게시판을 훑어보는 정도만 합니다:
 *   - 목록 1~3쪽(기본 1쪽)만, 하루 몇 번 이내로 읽습니다.
 *   - 요청 사이에 쉬는 시간을 두고, 정체를 밝히는 User-Agent 를 씁니다.
 *   - 첨부파일(/board/download)은 절대 내려받지 않습니다. 본문 글만 읽습니다.
 */
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (compatible; HallaHongbo/0.1; school PR helper, 1-3 pages/day)';
let lastRequestAt = 0;

async function politeDelay(ms) {
  const wait = lastRequestAt + ms - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function fetchText(url, opts = {}) {
  if (/\/board\/download/.test(url)) throw new Error('첨부파일은 내려받지 않습니다: ' + url);
  await politeDelay(opts.delayMs == null ? 1500 : opts.delayMs);
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(opts.timeoutMs || 20000) });
  if (!res.ok) throw new Error('교육청 누리집 응답 ' + res.status + ' (' + url + ')');
  return res.text();
}

function abs(href) {
  return href ? new URL(href.replace(/&amp;/g, '&'), 'https://www.jje.go.kr/').toString() : '';
}

function normDate(s) {
  const m = /(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/.exec(s || '');
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

/** 목록 페이지 HTML → { total, items } */
function parseList(html) {
  const $ = cheerio.load(html);
  const totalText = $('body').text();
  const tm = /전체\s*([\d,]+)\s*건/.exec(totalText);
  const items = [];
  $('li.bdGall3').each((i, li) => {
    const a = $(li).find('a.bdGallLink').first();
    const href = a.attr('href') || '';
    const sid = /dataSid=(\d+)/.exec(href);
    if (!sid) return;
    items.push({
      dataSid: sid[1],
      title: $(li).find('.bdGall3Tit').text().replace(/\s+/g, ' ').trim(),
      school: $(li).find('.bdGall3Name').first().text().trim(),
      date: normDate($(li).find('.bdGall3Date').text()),
      summary: $(li).find('.bdGall3Cnt').text().replace(/\s+/g, ' ').trim(),
      thumb: abs($(li).find('.bdGall3Thum img').attr('src')),
      url: abs(href)
    });
  });
  return { total: tm ? Number(tm[1].replace(/,/g, '')) : null, items };
}

/** 글 보기 페이지 HTML → 제목·학교·본문·첨부 목록(이름만) */
function parseView(html) {
  const $ = cheerio.load(html);
  const wrap = $('.boardViewWrap').first();
  const info = wrap.find('.bdvInfo');
  const hits = info.find('.bdHit').map((i, e) => $(e).text().trim()).get();
  const files = wrap.find('.bdvFileWrap a.bdvfileName').map((i, e) => {
    const t = $(e).text().trim();
    const m = /^(.*?)\s*\((\d+)\s*kb\)$/i.exec(t);
    return { name: m ? m[1] : t, sizeKb: m ? Number(m[2]) : null };
  }).get();
  const cnt = wrap.find('.bdvCntWrap').first();
  cnt.find('script, style').remove();
  // 문단 단위로 줄바꿈을 살려서 글자만 남긴다
  cnt.find('br').replaceWith('\n');
  cnt.find('p, div, li').each((i, e) => { $(e).append('\n'); });
  const body = cnt.text().replace(/ /g, ' ').split('\n').map(s => s.trim()).filter(Boolean).join('\n')
    .replace(/\n(?=[□○•■◦-])/g, '\n\n');
  return {
    title: wrap.find('.bdvTit').first().text().replace(/\s+/g, ' ').trim(),
    school: info.find('.bdName').first().text().trim(),
    phone: hits.find(h => /\d{2,3}\)?[-\s]?\d{3,4}[-\s]?\d{4}/.test(h)) || '',
    views: (() => { const v = hits.find(h => /회$/.test(h)); return v ? Number(v.replace(/[^\d]/g, '')) : null; })(),
    date: normDate(info.find('.bdDate').text()),
    files,
    imageCount: files.filter(f => /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name)).length,
    body
  };
}

function withParams(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}
function listUrl(cfg, page) { return withParams(cfg.board.listUrl, { paging: 'ok', startPage: page || 1 }); }
function searchUrl(cfg, keyword, page) {
  return withParams(cfg.board.listUrl, { paging: 'ok', startPage: page || 1, searchType: 'DATA_TITLE', keyword });
}

async function fetchList(cfg, opts = {}) {
  const pages = Math.max(1, Math.min(opts.pages || cfg.scan.pages || 1, cfg.scan.maxPages || 3));
  let total = null;
  const items = [];
  for (let p = 1; p <= pages; p++) {
    const r = parseList(await fetchText(listUrl(cfg, p), { delayMs: cfg.scan.delayMs }));
    if (r.total != null) total = r.total;
    items.push(...r.items);
    if (!r.items.length) break;
  }
  return { total, items };
}

/** 학교 이름으로 제목 검색 (기본 1쪽 = 최근 10건 안팎) */
async function searchSchool(cfg, keyword, opts = {}) {
  const r = parseList(await fetchText(searchUrl(cfg, keyword, opts.page || 1), { delayMs: cfg.scan.delayMs }));
  return r;
}

async function fetchView(cfg, urlOrSid) {
  const url = /^\d+$/.test(String(urlOrSid)) ? withParams(cfg.board.listUrl.replace('list.jje', 'view.jje'), { dataSid: urlOrSid }) : urlOrSid;
  return Object.assign({ url }, parseView(await fetchText(url, { delayMs: cfg.scan.delayMs })));
}

module.exports = { UA, parseList, parseView, listUrl, searchUrl, fetchList, searchSchool, fetchView, fetchText, normDate };
