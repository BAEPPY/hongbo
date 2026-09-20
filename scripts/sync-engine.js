'use strict';
/** 옆 폴더의 hallahongbo 저장소에서 글 엔진(규칙·예시·회사별 호출)을 복사해 옵니다. 사용법: node scripts/sync-engine.js [hallahongbo 경로] */
const fs = require('fs');
const path = require('path');
const src = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'hallahongbo'));
const dst = path.join(__dirname, '..', 'lib', 'engine');
if (!fs.existsSync(path.join(src, 'src', 'api.js'))) { console.error('hallahongbo 저장소를 찾지 못했습니다: ' + src); process.exit(1); }
const files = ['api.js', 'providers.js', 'prompt.js', 'llm/anthropic.js', 'llm/openai.js', 'llm/gemini.js', 'prompt/rules.txt', 'prompt/examples.txt', 'prompt/research.txt'];
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true });
  fs.copyFileSync(path.join(src, 'src', f), path.join(dst, f));
  console.log('복사:', f);
}
