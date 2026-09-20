#!/usr/bin/env node
'use strict';
/**
 * hongbo — 한라초 홍보 도우미 명령줄 도구
 * 오픈클로(OpenClaw) 스킬이 이 명령을 호출하고, 사람이 직접 써도 됩니다. --json 을 붙이면 기계가 읽는 형식으로 답합니다.
 */
const path = require('path');
const config = require('../lib/config');
const providers = require('../lib/engine/providers');
const folders = require('../lib/folders');

const HELP = `hongbo — 한라초 홍보 도우미

설정
  hongbo config show                         설정 보기 (키는 가려서 보여 줍니다)
  hongbo config set-key <회사> <API키>        회사: anthropic | openai | gemini
  hongbo config set-provider <회사>           글을 만들 AI 회사
  hongbo config set-photo-root <폴더>          활동 사진 폴더 (그 아래 활동별 하위 폴더)
  hongbo config set <항목> <값>               예) school.phone 064-740-9500 / photos.max 4 / providers.anthropic.model claude-haiku-4-5
  hongbo prompt files                        규칙·예시·연구학교 자료 편집 파일 만들기(경로 출력)

훑기·활동
  hongbo scan [--pages 1] [--no-school]      교육청 학교소식 최신 글 + 우리 학교 게시 현황 + 새 사진 폴더 요약
  hongbo list                                활동 폴더 목록과 상태
  hongbo status <폴더>                        활동 하나의 상태

글 만들기 → 확인 → 게시
  hongbo draft <폴더> [--note "수정 요청"] [--rank]   초안 만들기 (+ 사진 준비. --rank 면 AI 가 사진 적합성 판정)
  hongbo photos <폴더> [--rank] [--max 4]           사진만 다시 준비
  hongbo edit <폴더> [--title "…"] [--body-file f]  초안 고치기
  hongbo review <폴더> [--no-open] [--detach]       확인 창 열기 (브라우저)
  hongbo approve <폴더> [--photos 1,2,3,4]          채팅으로 승인받았을 때 승인 기록
  hongbo unapprove <폴더>                            승인 취소
  hongbo plan <폴더> [--again]                       게시 계획 (오픈클로가 폼을 채울 때 쓰는 값)
  hongbo posted <폴더> --url <글주소>                 게시 완료 기록
  hongbo form-notes [--file f]                       게시판 글쓰기 폼 메모 저장(오픈클로가 첫 게시 뒤 기록)

<폴더>는 사진 폴더 아래 활동 폴더 이름(일부만 써도 됨)이나 전체 경로입니다. --json 을 붙이면 JSON 으로 답합니다.`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args.flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.flags[k] = argv[++i];
      else args.flags[k] = true;
    } else args._.push(a);
  }
  // --no-xxx
  for (const k of Object.keys(args.flags)) if (k.startsWith('no-')) { args.flags[k.slice(3)] = false; }
  return args;
}

const out = { json: false };
function print(obj, text) {
  if (out.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  else process.stdout.write((typeof text === 'function' ? text() : text) + '\n');
}
function fail(msg, code = 1) {
  if (out.json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  else process.stderr.write('오류: ' + msg + '\n');
  process.exit(code);
}

function describeText(a) {
  const st = { new: '새 활동(초안 없음)', drafted: '초안 있음 · 승인 대기', approved: '승인됨 · 올리기 대기', posted: '게시 완료' }[a.state];
  return `${a.name}\n  상태: ${st}${a.posted && a.posted.url ? ' ' + a.posted.url : ''} · 사진 ${a.photoCount}장 · 메모 ${a.hasMemo ? '있음' : '없음'}${a.draft ? `\n  제목: ${a.draft.title}` : ''}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  out.json = !!args.flags.json;
  const [cmd, sub, ...rest] = args._;
  const cfg = config.load();

  if (!cmd || cmd === 'help' || args.flags.help) return print({ ok: true, help: HELP }, HELP);

  if (cmd === 'config') {
    if (sub === 'show' || !sub) { const s = config.summary(cfg); return print(Object.assign({ ok: true }, s), () => JSON.stringify(s, null, 2)); }
    if (sub === 'set-key') {
      const p = providers.get(rest[0]); const key = (rest[1] || '').trim();
      if (!rest[0] || !providers.isKnown(rest[0])) return fail('회사는 anthropic, openai, gemini 중 하나입니다.');
      if (!key) return fail('API 키를 함께 적어 주세요.');
      if (p.keyPrefix && !key.startsWith(p.keyPrefix)) process.stderr.write(`참고: ${p.label} 키는 보통 "${p.keyPrefix}" 로 시작합니다. 그대로 저장합니다.\n`);
      config.setPath(`providers.${p.id}.apiKey`, key);
      return print({ ok: true, provider: p.id }, `${p.label} 키를 저장했습니다. (${config.file()})`);
    }
    if (sub === 'set-provider') {
      if (!providers.isKnown(rest[0])) return fail('회사는 anthropic, openai, gemini 중 하나입니다.');
      config.setPath('provider', providers.get(rest[0]).id);
      return print({ ok: true, provider: rest[0] }, `글을 만들 AI: ${providers.get(rest[0]).label}`);
    }
    if (sub === 'set-photo-root') {
      const p = path.resolve(rest.join(' '));
      if (!require('fs').existsSync(p)) return fail('폴더가 없습니다: ' + p);
      config.setPath('photoRoot', p);
      return print({ ok: true, photoRoot: p }, '사진 폴더: ' + p);
    }
    if (sub === 'set') {
      if (!rest[0] || rest[1] === undefined) return fail('예) hongbo config set school.phone 064-740-9500');
      let v = rest.slice(1).join(' ');
      if (/^(true|false)$/.test(v)) v = v === 'true'; else if (/^\d+$/.test(v) && !/phone|name/.test(rest[0])) v = Number(v);
      config.setPath(rest[0], v);
      return print({ ok: true, key: rest[0], value: v }, `${rest[0]} = ${v}`);
    }
    return fail('config 하위 명령: show | set-key | set-provider | set-photo-root | set');
  }

  if (cmd === 'prompt') {
    const dir = require('../lib/draft').ensurePromptFiles();
    return print({ ok: true, dir }, `규칙·예시·연구학교 자료 파일: ${dir}\n(rules.txt, examples.txt, research.txt 를 고치면 다음 글부터 반영됩니다. 파일을 지우면 내장본으로 돌아갑니다)`);
  }

  if (cmd === 'list') {
    const acts = folders.listActivities(cfg);
    if (!cfg.photoRoot) return fail('사진 폴더가 설정되지 않았습니다. hongbo config set-photo-root <폴더>');
    return print({ ok: true, photoRoot: cfg.photoRoot, activities: acts.map(a => ({ name: a.name, dir: a.dir, date: a.date, state: a.state, photoCount: a.photoCount, hasMemo: a.hasMemo, title: a.draft ? a.draft.title : null, posted: a.posted })) },
      () => acts.length ? acts.map(describeText).join('\n') : `활동 폴더가 없습니다. ${cfg.photoRoot} 아래에 "2026-09-17 2학년 안전체험관" 처럼 폴더를 만들고 사진을 넣어 주세요.`);
  }

  if (cmd === 'scan') {
    const scan = require('../lib/scan');
    const r = await scan.runScan(cfg, { pages: args.flags.pages ? Number(args.flags.pages) : undefined, skipSchool: args.flags.school === false, skipSearch: args.flags.search === false });
    const digest = scan.formatDigest(r, cfg);
    return print(Object.assign({ ok: true, digest }, r), digest);
  }

  // 이하 활동 폴더가 필요한 명령
  const needDir = () => { try { return folders.resolve(cfg, [sub, ...rest.filter(x => !x.startsWith('--'))].filter(Boolean).join(' ')); } catch (e) { return fail(e.message); } };

  if (cmd === 'status') {
    const dir = needDir(); const a = folders.describe(dir);
    return print(Object.assign({ ok: true }, a), describeText(a));
  }

  if (cmd === 'photos') {
    const dir = needDir();
    const photos = require('../lib/photos');
    const rank = !!args.flags.rank;
    const r = await photos.prepare(dir, cfg, { rank, max: args.flags.max ? Number(args.flags.max) : undefined, provider: cfg.provider, apiKey: rank ? config.apiKey(cfg.provider, cfg) : '', model: config.model(cfg.provider, cfg) });
    return print(Object.assign({ ok: true }, r), () => `사진 ${r.photos.length}장 준비 (${path.join(dir, 'upload')}), 추천 ${r.picked.length}장${r.ranked ? ' (AI 판정 반영)' : ''}:\n` +
      r.photos.map(p => `  ${String(p.index).padStart(2, '0')} ${p.srcName} ${p.width}×${p.height}${p.recommended ? ' ✔ 추천' : ''}${p.analysis ? (p.analysis.facesCloseup ? ' ⚠ 얼굴 크게' : '') + (p.analysis.blurry ? ' ⚠ 흐림' : '') + (p.analysis.caption ? ' — ' + p.analysis.caption : '') : ''}${p.analysisError ? ' (판정 실패: ' + p.analysisError + ')' : ''}`).join('\n'));
  }

  if (cmd === 'draft') {
    const dir = needDir();
    const draftMod = require('../lib/draft');
    const photos = require('../lib/photos');
    let d;
    try {
      d = await draftMod.makeDraft(dir, cfg, { note: args.flags.note, provider: args.flags.provider, model: args.flags.model });
    } catch (e) { return fail(require('../lib/engine/api').describeError(e, args.flags.provider || cfg.provider) || e.message); }
    let ph = folders.state(dir, 'photos');
    if (args.flags.photos !== false && (!ph || args.flags.rank)) {
      try {
        const rank = !!args.flags.rank;
        ph = await photos.prepare(dir, cfg, { rank, provider: cfg.provider, apiKey: rank ? config.apiKey(cfg.provider, cfg) : '', model: config.model(cfg.provider, cfg) });
      } catch (e) { ph = { error: e.message, photos: [], picked: [] }; }
    }
    const usage = d.usage ? `입력 ${d.usage.inputTokens.toLocaleString('ko-KR')} · 출력 ${d.usage.outputTokens.toLocaleString('ko-KR')} 토큰${typeof d.usage.usd === 'number' ? ' · 약 $' + d.usage.usd.toFixed(3) : ''} · ${d.usage.providerLabel} ${d.usage.modelLabel}` : '';
    return print({ ok: true, dir, folder: path.basename(dir), title: d.title, body: d.body, truncated: d.truncated, usage: d.usage, form: d.form, photos: ph },
      () => `제목: ${d.title}\n\n${d.body}\n\n(${usage})${d.truncated ? '\n주의: 글이 길어 끝이 잘렸을 수 있습니다.' : ''}\n\n사진 ${ph.photos ? ph.photos.length : 0}장 준비, 추천 ${ph.picked ? ph.picked.length : 0}장${ph.error ? ' (사진 준비 실패: ' + ph.error + ')' : ''}\n확인 창: hongbo review "${path.basename(dir)}"`);
  }

  if (cmd === 'edit') {
    const dir = needDir();
    const draftMod = require('../lib/draft');
    const fs = require('fs');
    const patch = {};
    if (args.flags.title) patch.title = args.flags.title;
    if (args.flags['title-file']) patch.title = fs.readFileSync(args.flags['title-file'], 'utf8');
    if (args.flags.body) patch.body = args.flags.body;
    if (args.flags['body-file']) patch.body = fs.readFileSync(args.flags['body-file'], 'utf8');
    if (!Object.keys(patch).length) return fail('--title "…" 또는 --body-file <파일> 을 주세요.');
    const d = draftMod.updateDraft(dir, patch);
    return print({ ok: true, title: d.title, body: d.body }, `고쳤습니다.\n제목: ${d.title}\n\n${d.body}`);
  }

  if (cmd === 'review') {
    const dir = needDir();
    const review = require('../lib/review');
    if (args.flags.detach) {
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [__filename, 'review', dir, '--no-detach'], { detached: true, stdio: 'ignore' });
      child.unref();
      return print({ ok: true, detached: true }, '확인 창을 따로 열었습니다. 브라우저를 확인하세요.');
    }
    if (!folders.state(dir, 'photos')) {
      try { await require('../lib/photos').prepare(dir, cfg, {}); } catch (e) { /* 사진 없이도 열 수 있음 */ }
    }
    const s = await review.serve(dir, cfg, { open: args.flags.open !== false });
    process.stdout.write(`확인 창: ${s.url}\n(브라우저가 열리지 않으면 위 주소를 직접 여세요. 끝내려면 Ctrl+C)\n`);
    return new Promise(() => { /* 사용자가 끄기 전까지 유지 */ });
  }

  if (cmd === 'approve') {
    const dir = needDir();
    const post = require('../lib/post');
    if (!folders.state(dir, 'photos')) await require('../lib/photos').prepare(dir, cfg, {});
    const sel = { photos: args.flags.photos ? String(args.flags.photos).split(/[,\s]+/).filter(Boolean) : [] };
    if (args.flags.title) sel.title = args.flags.title;
    if (args.flags['body-file']) sel.body = require('fs').readFileSync(args.flags['body-file'], 'utf8');
    const a = post.approve(dir, cfg, sel);
    return print(Object.assign({ ok: true }, a), `승인 기록했습니다. 제목: ${a.title} · 사진 ${a.photos.length}장\n다음: hongbo plan "${path.basename(dir)}"`);
  }
  if (cmd === 'unapprove') { const dir = needDir(); require('../lib/post').unapprove(dir); return print({ ok: true }, '승인을 취소했습니다.'); }

  if (cmd === 'plan') {
    const dir = needDir();
    let p;
    try { p = require('../lib/post').postPlan(dir, cfg, { again: !!args.flags.again }); } catch (e) { return fail(e.message); }
    return print(p, () => `게시 계획 — ${p.folder}\n게시판: ${p.board.listUrl}\n분류: ${p.board.category} / ${p.board.region} · 학교: ${p.school.name} ${p.school.phone}\n\n제목: ${p.title}\n\n${p.body}\n\n사진 ${p.files.length}장:\n${p.files.map(f => '  ' + f.browserPath).join('\n')}${p.formNotes ? '\n\n폼 메모:\n' + p.formNotes : '\n\n(첫 게시입니다. 폼 구조를 hongbo form-notes 로 기록해 두면 다음부터 빨라집니다)'}`);
  }

  if (cmd === 'posted') {
    const dir = needDir();
    const rec = require('../lib/post').markPosted(dir, { url: args.flags.url || '', note: args.flags.note || '' });
    return print(Object.assign({ ok: true }, rec), `게시 완료로 기록했습니다. ${rec.url}`);
  }

  if (cmd === 'form-notes') {
    const fs = require('fs');
    const text = args.flags.file ? fs.readFileSync(args.flags.file, 'utf8') : args.flags.text || '';
    if (!text.trim()) return fail('--file <파일> 또는 --text "…" 로 내용을 주세요.');
    const f = require('../lib/post').saveFormNotes(text);
    return print({ ok: true, file: f }, '폼 메모를 저장했습니다: ' + f);
  }

  return fail(`모르는 명령입니다: ${cmd}\n\n${HELP}`);
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
