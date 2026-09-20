'use strict';
/**
 * 활동 폴더 관리. 사진 폴더(photoRoot) 아래 하위 폴더 하나가 활동 하나입니다.
 *
 *   홍보사진/
 *     2026-09-17 2학년 안전체험관 현장체험학습/
 *       메모.txt            ← 선생님이 쓴 메모 (없어도 폴더 이름만으로 시작 가능)
 *       IMG_0001.jpg …      ← 원본 사진
 *       upload/             ← 프로그램이 만든 게시용 사진 (크기 줄이고 위치 정보 제거)
 *       .hongbo/draft.json  ← 초안, photos.json 사진 선별, approved.json 승인, posted.json 게시 기록
 */
const fs = require('fs');
const path = require('path');
const memo = require('./memo');

const STATE = '.hongbo';
const MEMO_NAMES = ['메모.txt', 'memo.txt', '메모.md', 'memo.md', '내용.txt'];
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

function stateDir(dir) { return path.join(dir, STATE); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return data;
}
function state(dir, name) { return readJson(path.join(stateDir(dir), name + '.json')); }
function setState(dir, name, data) { return writeJson(path.join(stateDir(dir), name + '.json'), data); }
function clearState(dir, name) { try { fs.unlinkSync(path.join(stateDir(dir), name + '.json')); } catch (e) { /* 없으면 무시 */ } }

function readMemo(dir) {
  for (const n of MEMO_NAMES) {
    const f = path.join(dir, n);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  }
  const txt = fs.readdirSync(dir).find(n => /\.(txt|md)$/i.test(n));
  return txt ? fs.readFileSync(path.join(dir, txt), 'utf8').replace(/^﻿/, '') : null;
}

function listPhotoFiles(dir) {
  return fs.readdirSync(dir).filter(n => IMAGE_RE.test(n) && !n.startsWith('.')).sort((a, b) => a.localeCompare(b, 'ko'))
    .map(n => path.join(dir, n));
}

function describe(dir) {
  const name = path.basename(dir);
  const draft = state(dir, 'draft'), approved = state(dir, 'approved'), posted = state(dir, 'posted'), photos = state(dir, 'photos');
  const parsed = memo.parseFolderName(name);
  return {
    name, dir,
    date: parsed.date,
    activity: parsed.activity,
    target: parsed.target,
    hasMemo: !!readMemo(dir),
    photoCount: listPhotoFiles(dir).length,
    state: posted ? 'posted' : approved ? 'approved' : draft ? 'drafted' : 'new',
    draft, photos, approved, posted
  };
}

/** photoRoot 아래 활동 폴더들 (최근 날짜순) */
function listActivities(cfg) {
  const root = cfg.photoRoot;
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => describe(path.join(root, d.name)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.name.localeCompare(a.name, 'ko'));
}

/** 이름(일부만도 가능)이나 경로로 활동 폴더 찾기 */
function resolve(cfg, nameOrPath) {
  if (!nameOrPath) throw new Error('활동 폴더 이름을 알려 주세요. (예: "2026-09-17 2학년 안전체험관")');
  if (fs.existsSync(nameOrPath) && fs.statSync(nameOrPath).isDirectory()) return path.resolve(nameOrPath);
  const all = listActivities(cfg);
  const exact = all.find(a => a.name === nameOrPath);
  if (exact) return exact.dir;
  const norm = s => s.replace(/\s+/g, '').toLowerCase();
  const hits = all.filter(a => norm(a.name).includes(norm(nameOrPath)));
  if (hits.length === 1) return hits[0].dir;
  if (hits.length > 1) throw new Error('여러 폴더가 맞습니다. 더 정확히 알려 주세요: ' + hits.map(h => h.name).join(' / '));
  throw new Error(`"${nameOrPath}" 폴더를 ${cfg.photoRoot || '(사진 폴더 미설정)'} 아래에서 찾지 못했습니다.`);
}

module.exports = { STATE, stateDir, state, setState, clearState, readMemo, listPhotoFiles, describe, listActivities, resolve, readJson, writeJson };
