'use strict';
/** 시험 공통: 임시 홈·사진 폴더, 가짜 Claude 서버, 시험용 사진 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function tempHome(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'hongbo-test-'));
  process.env.HONGBO_HOME = path.join(dir, 'home');
  return dir;
}

async function makePhotos(dir, n = 3) {
  const sharp = require('sharp');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    await sharp({ create: { width: 2400 - i * 300, height: 1600, channels: 3, background: { r: 60 * i, g: 120, b: 180 } } })
      .jpeg().withMetadata({ exif: { IFD0: { ImageDescription: 'test ' + i, Copyright: 'x' } } }).toFile(path.join(dir, `IMG_${i + 1}.jpg`));
  }
}

const ARTICLE = '제목: 한라초 2학년, 안전체험관 현장체험학습 실시\n---\n□ 한라초등학교(교장 오상남)는 2026년 9월 17일(목) 2학년 학생들을 대상으로 안전체험관 현장체험학습을 실시하였다.\n\n□ 학생들은 지진·화재·태풍 체험과 심폐소생술 실습에 참여하였다.\n\n□ 이번 활동이 안전 의식을 높이는 계기가 되었기를 기대한다.';

/** 가짜 Anthropic 서버: 요청을 기록하고 텍스트를 돌려준다. handler(json) 가 문자열을 주면 그 텍스트로 답한다. */
function mockAnthropic(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = body ? JSON.parse(body) : null;
      requests.push({ url: req.url, json });
      const text = handler ? handler(json, requests.length) : ARTICLE;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: json.model, content: [{ type: 'text', text }], stop_reason: 'end_turn',
        usage: { input_tokens: 150, cache_creation_input_tokens: 60000, cache_read_input_tokens: 0, output_tokens: 400 } }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    baseURL: 'http://127.0.0.1:' + server.address().port, requests,
    close: () => new Promise(r => server.close(r))
  })));
}

module.exports = { tempHome, makePhotos, mockAnthropic, ARTICLE };
