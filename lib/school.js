'use strict';
/** 한라초 홈페이지 알림마당 > 학교소식 목록 읽기 (제목·날짜만; 우리 학교 글이 교육청에 올라갔는지 대조용) */
const cheerio = require('cheerio');
const { fetchText, normDate } = require('./jje');

function parseSchoolList(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('.photo_list li a.selectNttInfo, .photo_list li a[data-nm="nttSn"]').each((i, a) => {
    const nttSn = $(a).attr('data-param') || '';
    const title = ($(a).find('.lst_tit').text() || $(a).attr('title') || '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    items.push({ nttSn, title, date: normDate($(a).find('.date').text()) });
  });
  return items;
}

function infoUrl(cfg, nttSn) {
  const u = new URL(cfg.schoolSite.newsUrl);
  u.pathname = u.pathname.replace('selectNttList.do', 'selectNttInfo.do');
  u.searchParams.set('nttSn', nttSn);
  return u.toString();
}

async function fetchSchoolNews(cfg) {
  const html = await fetchText(cfg.schoolSite.newsUrl, { delayMs: cfg.scan.delayMs });
  return parseSchoolList(html).map(it => Object.assign(it, { url: it.nttSn ? infoUrl(cfg, it.nttSn) : cfg.schoolSite.newsUrl }));
}

module.exports = { parseSchoolList, fetchSchoolNews, infoUrl };
