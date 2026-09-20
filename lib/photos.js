'use strict';
/**
 * 사진 준비: 원본은 그대로 두고 upload/ 폴더에 게시용 사본을 만듭니다.
 *   - 긴 쪽 1600px 로 줄이고 JPEG 로 저장 (교육청 게시판 원본은 3~6MB 라 그대로 올려도 되지만, 위치 정보를 지우기 위해 다시 저장합니다)
 *   - EXIF(촬영 위치·기기 정보) 제거, 회전 정보는 반영
 *   - API 키가 있으면 사진마다 얼굴 크게 나옴/흐림/활동 드러남을 판정해 점수를 매기고 상위 N장을 추천합니다
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const folders = require('./folders');
const vision = require('./vision');

function score(a) {
  if (!a) return 0;
  return (a.showsActivity ? 3 : 0) + (a.blurry ? 0 : 2) + (a.facesCloseup ? 0 : 4) + Math.min(a.people || 0, 10) / 10;
}

/**
 * @param {string} dir 활동 폴더
 * @param {object} cfg 설정
 * @param {{rank?:boolean, max?:number, provider?:string, apiKey?:string, model?:string, baseURL?:string, onProgress?:Function}} opts
 */
async function prepare(dir, cfg, opts = {}) {
  const files = folders.listPhotoFiles(dir);
  if (!files.length) throw new Error('사진이 없습니다: ' + dir + ' (jpg·png 파일을 폴더에 넣어 주세요)');
  const outDir = path.join(dir, 'upload');
  fs.mkdirSync(outDir, { recursive: true });
  for (const old of fs.readdirSync(outDir)) if (/^\d{2}\.jpg$/.test(old)) fs.unlinkSync(path.join(outDir, old));

  const maxSide = (cfg.photos && cfg.photos.maxSide) || 1600;
  const max = opts.max || (cfg.photos && cfg.photos.max) || 4;
  const photos = [];
  for (let i = 0; i < files.length; i++) {
    const src = files[i];
    const out = path.join(outDir, String(i + 1).padStart(2, '0') + '.jpg');
    const img = sharp(src).rotate();                                  // EXIF 회전 반영
    const info = await img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true }).toFile(out);              // 메타데이터(위치 정보)는 기본적으로 제거됨
    const entry = { index: i + 1, src, out, width: info.width, height: info.height, bytes: info.size, analysis: null, score: 0 };
    if (opts.rank && opts.apiKey) {
      try {
        const small = await sharp(out).resize({ width: 800, height: 800, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
        entry.analysis = await vision.analyzeImage({ provider: opts.provider, apiKey: opts.apiKey, model: opts.model, image: small, baseURL: opts.baseURL });
        entry.score = score(entry.analysis);
      } catch (e) {
        entry.analysisError = e.message;
      }
    }
    photos.push(entry);
    if (opts.onProgress) opts.onProgress(entry, files.length);
  }
  // 추천: 판정이 있으면 점수순(동점이면 원래 순서), 없으면 파일 이름 순서대로 앞에서 N장
  const ranked = photos.slice().sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = (opts.rank && photos.some(p => p.analysis) ? ranked : photos).slice(0, max);
  for (const p of photos) p.recommended = picked.includes(p);
  const result = {
    preparedAt: new Date().toISOString(),
    ranked: !!(opts.rank && photos.some(p => p.analysis)),
    max, maxSide,
    photos: photos.map(p => Object.assign({}, p, { out: p.out, srcName: path.basename(p.src) })),
    picked: picked.sort((a, b) => a.index - b.index).map(p => p.out)
  };
  folders.setState(dir, 'photos', result);
  return result;
}

module.exports = { prepare, score };
