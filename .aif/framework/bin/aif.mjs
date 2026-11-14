#!/usr/bin/env node
// ai-framework 실행 스크립트. 의존성 없음 (Node 18+).
// 명령: log, task, harvest, check, guard-push, git, analyze, report, baseline, doctor, new
// 명세: core/runtime.md, core/feedback/events.md, core/feedback/rules.yaml, core/feedback/causes.md

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);

// ───────────────────────── 공통 ─────────────────────────

function findRoot(start) {
  let d = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(d, '.aif'))) return d;
    const p = path.dirname(d);
    if (p === d) return path.resolve(start);
    d = p;
  }
}
const ROOT = process.env.CLAUDE_PROJECT_DIR ? path.resolve(process.env.CLAUDE_PROJECT_DIR) : findRoot(process.cwd());
const AIF = path.join(ROOT, '.aif');
const P = (...a) => path.join(ROOT, ...a);
const rel = (f) => (f ? path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/') : '');

function isoNow(d = process.env.AIF_NOW ? new Date(process.env.AIF_NOW) : new Date()) { // AIF_NOW: 시험용 시각 고정
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}
const ms = (ts) => new Date(ts).getTime();
const readText = (f, def = '') => { try { return fs.readFileSync(f, 'utf8'); } catch { return def; } };
const readJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const exists = (f) => fs.existsSync(f);

function readStdin() {
  if (process.stdin.isTTY) return {};
  try { const t = fs.readFileSync(0, 'utf8'); return t.trim() ? JSON.parse(t) : {}; } catch { return {}; }
}

function git(args, opts = {}) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim(); }
  catch { return null; }
}

function logError(where, e) {
  try {
    fs.mkdirSync(AIF, { recursive: true });
    fs.appendFileSync(path.join(AIF, 'log-errors.jsonl'), JSON.stringify({ ts: isoNow(), where, error: String(e && e.stack || e) }) + '\n');
  } catch { /* 기록 실패는 무시 */ }
}

// ───────────────────────── YAML (이 프레임워크가 쓰는 부분만) ─────────────────────────

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function splitTop(s) {
  const out = []; let depth = 0, q = null, cur = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function findColon(s) {
  let q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ':' && depth === 0 && (i === s.length - 1 || s[i + 1] === ' ')) return i;
  }
  return -1;
}
function scalar(v) {
  v = v.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) return splitTop(v.slice(1, -1)).map(scalar);
  if (v.startsWith('{') && v.endsWith('}')) {
    const o = {};
    for (const part of splitTop(v.slice(1, -1))) {
      const k = findColon(part);
      if (k < 0) continue;
      o[part.slice(0, k).trim()] = scalar(part.slice(k + 1));
    }
    return o;
  }
  return v;
}
export function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = stripComment(raw).replace(/\s+$/, '');
    if (!s.trim()) continue;
    lines.push({ ind: s.length - s.trimStart().length, t: s.trim() });
  }
  let i = 0;
  function block(ind) {
    if (i >= lines.length) return null;
    if (lines[i].t.startsWith('- ') || lines[i].t === '-') return seq(lines[i].ind);
    return map(ind);
  }
  function map(ind, obj = {}) {
    while (i < lines.length && lines[i].ind === ind && !lines[i].t.startsWith('- ')) {
      const { t } = lines[i];
      const k = findColon(t);
      if (k < 0) { i++; continue; }
      const key = t.slice(0, k).trim();
      const rest = t.slice(k + 1).trim();
      i++;
      if (rest) obj[key] = scalar(rest);
      else if (i < lines.length && (lines[i].ind > ind || (lines[i].ind === ind && lines[i].t.startsWith('- ')))) obj[key] = block(lines[i].ind);
      else obj[key] = null;
    }
    return obj;
  }
  function seq(ind) {
    const arr = [];
    while (i < lines.length && lines[i].ind === ind && (lines[i].t.startsWith('- ') || lines[i].t === '-')) {
      const content = lines[i].t === '-' ? '' : lines[i].t.slice(2);
      const k = findColon(content);
      if (content && k > 0 && !/^[\[{"']/.test(content)) {
        const itemInd = ind + 2;
        lines[i] = { ind: itemInd, t: content };
        arr.push(map(itemInd));
      } else {
        i++;
        if (!content && i < lines.length && lines[i].ind > ind) arr.push(block(lines[i].ind));
        else arr.push(scalar(content));
      }
    }
    return arr;
  }
  return lines.length ? block(lines[0].ind) : null;
}

// ───────────────────────── 설정·상태 ─────────────────────────

function config() {
  const c = parseYaml(readText(P('.aif/config.yaml'))) || {};
  c.commands = c.commands || {};
  c.paths = c.paths || {};
  c.paths.code = c.paths.code || ['src/**'];
  c.paths.tests = c.paths.tests || ['**/*.test.*', '**/*.spec.*', 'tests/**', 'test/**'];
  c.paths.data_raw = c.paths.data_raw || ['data/raw/**'];
  c.hooks_off = c.hooks_off || [];
  c.checks_off = c.checks_off || [];
  c.verifier = [].concat(c.verifier || ['reviewer']);
  return c;
}
const fwVersion = () => readText(P('.aif/framework/VERSION')).trim() || String(config().framework_version || '');
const current = () => readJson(P('.aif/current.json'), null);
const setCurrent = (v) => writeJson(P('.aif/current.json'), v);
const taskDir = (id) => P('.aif/tasks', id);

function globRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { const j = g.indexOf('}', i); re += '(?:' + g.slice(i + 1, j).split(',').map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')'; i = j; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
const matchAny = (f, globs) => (globs || []).some((g) => globRe(g).test(f));

function fileKind(f, cfg = config()) {
  if (!f) return null;
  const r = rel(f);
  if (r.startsWith('..')) return 'other';
  if (/^docs\/(spec|question)\.md$/.test(r) || /^\.aif\/tasks\/[^/]+\/card\.md$/.test(r)) return 'goal';
  if (r === 'docs/progress.md') return 'progress';
  if (r.startsWith('docs/adr/')) return 'adr';
  if (matchAny(r, cfg.paths.data_raw)) return 'data_raw';
  if (matchAny(r, cfg.paths.tests)) return 'test';
  if (matchAny(r, cfg.paths.code)) return /\.(m?[jt]sx?|c[jt]s|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h|dart|scala|lua|gd)$/.test(r) && !/\.d\.ts$/.test(r) ? 'code' : 'asset';
  if (r.startsWith('docs/') || r.endsWith('.md')) return 'doc';
  return 'other';
}

const SECRET = [
  [/sk-[A-Za-z0-9_-]{16,}/g, 'sk-***'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh*_***'],
  [/AKIA[0-9A-Z]{16}/g, 'AKIA***'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '***PRIVATE KEY***'],
  [/((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)(["']?)[^\s"']+/gi, '$1$2***'],
];
const redact = (s) => (typeof s === 'string' ? SECRET.reduce((a, [re, r]) => a.replace(re, r), s) : s);
const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : s);

function appendEvent(type, data = {}, hook = {}, taskOverride) {
  const cur = current();
  const task = taskOverride || (cur && !cur.closed && cur.task) || '_none';
  const ev = {
    ts: isoNow(), task,
    route: (cur && cur.task === task && cur.route) || null,
    phase: (cur && cur.task === task && cur.phase) || 'none',
    type,
    session_id: hook.session_id || null,
    prompt_id: hook.prompt_id || null,
    tool_use_id: hook.tool_use_id || null,
    fw: fwVersion() || null,
    data,
  };
  const dir = taskDir(task);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(ev) + '\n');
  return ev;
}
function readEvents(id) {
  return readText(path.join(taskDir(id), 'events.jsonl')).split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    .sort((a, b) => ms(a.ts) - ms(b.ts));
}

// ───────────────────────── log (훅) ─────────────────────────

function lastAssistantText(transcript) {
  const lines = readText(transcript).split('\n').filter(Boolean);
  for (let k = lines.length - 1; k >= 0; k--) {
    try {
      const o = JSON.parse(lines[k]);
      if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
        const t = o.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        if (t) return t;
      }
    } catch { /* 건너뜀 */ }
  }
  return '';
}

function cmdLog(type) {
  const h = readStdin();
  const cfg = config();
  let data = {};
  switch (type) {
    case 'session.start': {
      data = { source: h.source || null, entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT || null };
      const idx = readJson(P('.aif/sessions/index.json'), {});
      if (h.session_id) idx[h.session_id] = { ...(idx[h.session_id] || {}), transcript_path: h.transcript_path || null, started: isoNow() };
      writeJson(P('.aif/sessions/index.json'), idx);
      break;
    }
    case 'session.end': {
      data = { reason: h.reason || null };
      // 이 세션 안에서 작업이 닫혔으면, 세션 끝은 그 작업에도 남긴다 (세션 단위 규칙이 쓴다)
      const cur = current();
      if (cur && cur.closed && h.session_id && readEvents(cur.task).some((e) => e.session_id === h.session_id)) {
        appendEvent(type, data, h, cur.task);
        return;
      }
      break;
    }
    case 'prompt': {
      const text = String(h.prompt || '');
      const m = text.match(/^\/([\w:.-]+)/);
      data = { len: text.length, skill: m ? m[1] : null, text: redact(clip(text, 4000)) };
      break;
    }
    case 'tool':
    case 'tool.fail': {
      const ti = h.tool_input || {};
      const f = ti.file_path || ti.notebook_path || ti.path || null;
      data = { tool: h.tool_name || null };
      if (f) { data.file = rel(f); data.file_kind = fileKind(f, cfg); }
      if (ti.command) {
        data.bash = redact(clip(String(ti.command), 200));
        const cmds = Object.values(cfg.commands || {}).filter(Boolean).map(String);
        if (cmds.some((c) => String(ti.command).includes(c))) data.check = true;
      }
      const tr = h.tool_response || {};
      if (typeof tr === 'object' && tr) {
        if ('exit_code' in tr) data.exit = tr.exit_code;
        else if ('exitCode' in tr) data.exit = tr.exitCode;
        if (tr.interrupted) data.interrupted = true;
      }
      if (h.tool_name === 'Agent' || h.tool_name === 'Task') data.agent_type = ti.subagent_type || null;
      // 질문 창으로 받은 사람의 답: 결정 기록의 근거가 된다 (질문과 답만, 짧게)
      if (h.tool_name === 'AskUserQuestion') {
        data.questions = (ti.questions || []).map((q) => clip(String(q.question || ''), 200));
        const ans = (tr && (tr.answers || tr.result)) || null;
        data.answers = ans ? redact(clip(typeof ans === 'string' ? ans : JSON.stringify(ans), 800)) : null;
      }
      if (type === 'tool.fail') data.error = redact(clip(String(h.error || tr.error || ''), 200));
      break;
    }
    case 'block': {
      const ti = h.tool_input || {};
      const f = ti.file_path || ti.path || null;
      data = { by: 'permission', tool: h.tool_name || null, what: redact(clip(String(ti.command || f || ''), 200)) };
      if (f) data.file_kind = fileKind(f, cfg);
      break;
    }
    case 'turn': data = { last_text: redact(clip(h.last_assistant_message || lastAssistantText(h.transcript_path), 300)) }; break;
    case 'subagent': data = { agent_type: h.agent_type || null }; break;
    case 'compact': data = { trigger: h.trigger || null }; break;
    case 'notify': data = { kind: h.notification_type || null, message: redact(clip(String(h.message || ''), 200)) }; break; // 승인 요청·입력 대기 알림
    default: data = {};
  }
  appendEvent(type, data, h);
}

// ───────────────────────── task ─────────────────────────

// 규모(size)와 경로(route): explore | S→light | M·L→standard. 규칙은 경로·규모 둘 다로 거른다
const SIZES = ['explore', 'S', 'M', 'L'];
const routeOf = (size) => (size === 'explore' ? 'explore' : size === 'S' ? 'light' : 'standard');
const sizeOfRoute = (route) => (route === 'explore' ? 'explore' : route === 'light' ? 'S' : 'L');
function budgetOf(size, cfg = config()) {
  const b = (cfg.budgets || {})[size] || {};
  const def = { S: { minutes: 30, tokens: 500000 }, M: { minutes: 120, tokens: 2000000 } }[size] || {};
  return { minutes: b.minutes !== undefined ? b.minutes : def.minutes || null, tokens: b.tokens !== undefined ? b.tokens : def.tokens || null };
}
// 진행 중 작업의 실작업 시간(이벤트 간격 5분 이하 합). 백그라운드 세션은 뺀다
function activeMinutesOf(id) {
  const all = readEvents(id);
  const bg = backgroundSessions(all);
  let sum = 0, prev = null;
  for (const e of all) { if (bg.has(e.session_id)) continue; const t = ms(e.ts); if (prev !== null && t - prev <= 5 * 6e4) sum += t - prev; prev = t; }
  return Math.round(sum / 6e4);
}
function budgetLine(cur) {
  if (!cur || !cur.size || cur.size === 'explore') return '';
  const b = budgetOf(cur.size);
  const used = activeMinutesOf(cur.task);
  if (!b.minutes) return `실작업 ${used}분 (규모 ${cur.size}, 기대 없음)`;
  const over = used > b.minutes * 1.5;
  return `실작업 ${used}분 / 기대 ${b.minutes}분 (규모 ${cur.size})` + (over ? ' — 기대의 1.5배를 넘었다. 멈추고 사람에게 묻는다: 규모 올리기 / 범위 줄이기 / 계속' : '');
}

function cmdTask(args) {
  const [sub, ...rest] = args;
  const flag = (n) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : null; };
  const cfg = config();
  const cur = current();
  if (sub === 'new') {
    const slug = (rest[0] || 'task').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'task';
    let size = flag('size');
    if (!size && flag('route')) size = { explore: 'explore', light: 'S', standard: 'M' }[flag('route')];
    size = size || 'M';
    if (!SIZES.includes(size)) throw new Error('size는 explore | S | M | L');
    const route = routeOf(size);
    const d = new Date();
    const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${slug}`;
    let id = base, n = 2;
    while (exists(taskDir(id))) id = `${base}-${n++}`;
    fs.mkdirSync(taskDir(id), { recursive: true });
    // /aif-plan 프롬프트는 작업 ID가 생기기 전에 기록되므로 새 작업으로 옮긴다
    for (const src of new Set([(cur && cur.task) || '_none', '_none'])) {
      const f = path.join(taskDir(src), 'events.jsonl');
      const lines = readText(f).split('\n').filter(Boolean);
      let k = -1;
      for (let j = lines.length - 1; j >= 0; j--) { try { if (JSON.parse(lines[j]).type === 'prompt') { k = j; break; } } catch { /* 건너뜀 */ } }
      if (k < 0) continue;
      const e = JSON.parse(lines[k]);
      const recent = process.env.AIF_NOW || Date.now() - ms(e.ts) < 30 * 6e4;
      if (!(e.data && e.data.skill === 'aif-plan' && recent)) continue;
      lines.splice(k, 1);
      fs.writeFileSync(f, lines.length ? lines.join('\n') + '\n' : '');
      fs.appendFileSync(path.join(taskDir(id), 'events.jsonl'), JSON.stringify({ ...e, task: id, route, phase: 'plan' }) + '\n');
      break;
    }
    setCurrent({ task: id, route, size, phase: 'plan', purpose: cfg.purpose || null, variant: cfg.variant || null, started: isoNow() });
    appendEvent('task.start', { slug, route, size, purpose: cfg.purpose || null, variant: cfg.variant || null });
    appendEvent('phase', { to: 'plan' });
    console.log(id);
    // 이 세션에서 Claude Code 훅이 도는지: 최근 12시간 안에 SessionStart 훅 기록이 없으면 알린다
    const idx = readJson(P('.aif/sessions/index.json'), {});
    const live = Object.values(idx).some((v) => v.started && Date.now() - ms(v.started) < 12 * 3600e3);
    if (!live && !process.env.AIF_NOW) console.log('경고: 이 세션에서 Claude Code 훅 기록이 없습니다. Claude Code를 이 프로젝트 폴더에서 시작하지 않았거나(데스크톱 앱에서 다른 폴더로 열고 이동한 경우 등) 훅이 꺼져 있습니다. 기록이 남지 않으니 사람에게 알리고, 이 폴더에서 Claude Code를 다시 시작하도록 안내하세요.');
    return;
  }
  if (!cur || (cur.closed && sub !== 'show')) throw new Error('진행 중인 작업이 없습니다. /aif-plan으로 시작하세요.');
  if (sub === 'phase') {
    const to = rest[0];
    setCurrent({ ...cur, phase: to });
    appendEvent('phase', { to });
    console.log(`${cur.task} → ${to}`);
    const bl = budgetLine(current()); if (bl) console.log(bl);
  } else if (sub === 'route' || sub === 'size') {
    let size = sub === 'size' ? rest[0] : { explore: 'explore', light: 'S', standard: 'M' }[rest[0]];
    if (!SIZES.includes(size)) throw new Error('task size <explore|S|M|L>');
    const from = cur.size || sizeOfRoute(cur.route);
    appendEvent('task.route', { from: cur.route, to: routeOf(size), size_from: from, size_to: size });
    setCurrent({ ...cur, route: routeOf(size), size });
    console.log(`${cur.task} 규모: ${from} → ${size}`);
  } else if (sub === 'gate') {
    const [phase, result] = rest;
    if (!['pass', 'fail'].includes(result)) throw new Error('gate <단계> <pass|fail>');
    appendEvent('gate', { phase, result, evidence: flag('evidence') });
    console.log(`${cur.task} ${phase} 게이트: ${result}`);
    { const bl = budgetLine(cur); if (bl) console.log(bl); }
    // 작업 끝: 탐색은 수행 통과, 나머지는 전달 통과. 이후 기록은 다음 작업이 시작될 때까지 _none으로 간다
    const last = cur.route === 'explore' ? 'work' : 'deliver';
    if (phase === last && result === 'pass') {
      appendEvent('task.end', { route: cur.route, size: cur.size || null });
      setCurrent({ ...cur, closed: true, ended: isoNow() });
      console.log(`${cur.task} 작업을 닫았습니다.`);
      try { cmdClose([cur.task]); } catch (e) { logError('close', e); console.log('기록 문서 생성 실패: .aif/log-errors.jsonl 참고'); }
      console.log(`이어서 리뷰: /aif-report ${cur.task}`);
    }
  } else if (sub === 'show') {
    console.log(JSON.stringify(cur, null, 2));
  } else throw new Error('task new|phase|route|gate|show');
}

// ───────────────────────── harvest (세션 기록 보관) ─────────────────────────

function harvestOne(sessionId, transcript) {
  const lines = readText(transcript).split('\n').filter(Boolean);
  if (!lines.length) return null;
  const seen = new Map();
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0, requests: 0 };
  const perMsg = [];
  const humans = [];
  let ccVersion = null;
  for (const l of lines) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.version) ccVersion = o.version;
    if (o.type === 'assistant' && o.message && o.message.usage) {
      // 같은 요청이 스트리밍 중간 값으로 여러 줄 남는다. 마지막 줄이 최종값이므로 덮어쓴다 (첫 줄을 쓰면 출력 토큰이 적게 잡힌다)
      const key = o.requestId || o.message.id || o.uuid || `line${perMsg.length}`;
      const u = o.message.usage;
      const row = { ts: o.timestamp || null, input: u.input_tokens || 0, output: u.output_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0 };
      if (seen.has(key)) { const prev = seen.get(key); row.ts = prev.ts || row.ts; for (const k of ['input', 'output', 'cache_read', 'cache_write']) row[k] = Math.max(prev[k], row[k]); Object.assign(prev, row); continue; }
      seen.set(key, row);
      perMsg.push(row);
    } else if (o.type === 'user' && o.message && !o.isMeta) {
      const c = o.message.content;
      let text = typeof c === 'string' ? c : Array.isArray(c) && !c.some((x) => x.type === 'tool_result') ? c.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : '';
      if (text && !text.startsWith('<command-') && !text.startsWith('<local-command')) humans.push({ ts: o.timestamp || null, text: redact(clip(text, 500)) });
    }
  }
  for (const r of perMsg) { usage.input += r.input; usage.output += r.output; usage.cache_read += r.cache_read; usage.cache_write += r.cache_write; usage.requests++; }
  const out = { session_id: sessionId, transcript, harvested_at: isoNow(), cc_version: ccVersion, usage, per_message: perMsg, human: humans };
  writeJson(P('.aif/sessions', `${sessionId}.json`), out);
  // 작업별로 나눠 usage 이벤트 남기기: 그 세션의 이벤트가 있는 작업의 시간 구간
  const tasksDir = P('.aif/tasks');
  const refreshed = new Set();
  for (const id of exists(tasksDir) ? fs.readdirSync(tasksDir) : []) {
    const evs = readEvents(id).filter((e) => e.session_id === sessionId);
    if (!evs.length || evs.some((e) => e.type === 'usage' && e.data.session === sessionId)) continue;
    const a = ms(evs[0].ts) - 5 * 60e3, b = ms(evs[evs.length - 1].ts) + 60e3;
    const sum = { input: 0, output: 0, cache_read: 0, cache_write: 0, requests: 0 };
    for (const r of perMsg) {
      const t = r.ts ? ms(r.ts) : null;
      if (t === null || (t >= a && t <= b)) { sum.input += r.input; sum.output += r.output; sum.cache_read += r.cache_read; sum.cache_write += r.cache_write; sum.requests++; }
    }
    appendEvent('usage', { session: sessionId, ...sum }, { session_id: sessionId }, id);
    refreshed.add(id);
  }
  // 이미 닫힌 작업은 토큰이 뒤늦게 들어오므로 기록 문서·장부를 다시 쓴다
  for (const id of refreshed) {
    if (readEvents(id).some((e) => e.type === 'task.end') && exists(DOCS('tasks', `${id}.md`))) { try { cmdClose([id], { quiet: true }); } catch (e) { logError('harvest-close', e); } }
  }
  const idx = readJson(P('.aif/sessions/index.json'), {});
  idx[sessionId] = { ...(idx[sessionId] || {}), transcript_path: transcript, harvested: isoNow() };
  writeJson(P('.aif/sessions/index.json'), idx);
  return out;
}

function cmdHarvest(args) {
  if (args.includes('--pending')) {
    const h = readStdin();
    const idx = readJson(P('.aif/sessions/index.json'), {});
    for (const [sid, v] of Object.entries(idx)) {
      if (sid === h.session_id || v.harvested || !v.transcript_path || !exists(v.transcript_path)) continue;
      try { harvestOne(sid, v.transcript_path); } catch (e) { logError('harvest-pending', e); }
    }
    return;
  }
  const fileArg = args.find((a) => !a.startsWith('--'));
  if (fileArg) { const r = harvestOne(path.basename(fileArg, '.jsonl'), path.resolve(fileArg)); console.log(JSON.stringify(r && r.usage)); return; }
  const h = readStdin();
  if (h.session_id && h.transcript_path) harvestOne(h.session_id, h.transcript_path);
}

// ───────────────────────── check / guard-push (강제 훅) ─────────────────────────

const DISABLE_RE = /\b(?:it|test|describe|context)\.(?:skip|only)\s*\(|\bx(?:it|describe|test)\s*\(|@Disabled\b|@Ignore\b|pytest\.mark\.skip|\bt\.Skip\s*\(/;

function cmdCheck() {
  const h = readStdin();
  const cfg = config();
  if (cfg.hooks_off.includes('check')) return;
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return;
  const hasHead = git(['rev-parse', '--verify', 'HEAD']) !== null;
  const status = (hasHead ? git(['diff', '--name-status', 'HEAD']) : git(['diff', '--cached', '--name-status'])) || '';
  const problems = [];
  for (const line of status.split('\n').filter(Boolean)) {
    const [st, f] = line.split('\t');
    if (st.startsWith('D') && matchAny(f, cfg.paths.tests)) problems.push({ what: 'test.deleted', file: f });
  }
  const diff = (hasHead ? git(['diff', '-U0', 'HEAD']) : git(['diff', '-U0', '--cached'])) || '';
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ b\//, ''); continue; }
    if (file && matchAny(file, cfg.paths.tests) && line.startsWith('+') && DISABLE_RE.test(line)) problems.push({ what: 'test.disabled', file, line: clip(line, 120) });
  }
  // 새 파일(추적 안 됨)은 diff에 안 나오므로 내용을 직접 본다
  for (const f of (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean)) {
    if (!matchAny(f, cfg.paths.tests)) continue;
    readText(P(f)).split('\n').forEach((line) => { if (DISABLE_RE.test(line)) problems.push({ what: 'test.disabled', file: f, line: clip(line.trim(), 120) }); });
  }
  if (!problems.length) return;
  for (const p of problems) appendEvent('block', { by: 'check', what: p.what, file: p.file, line: p.line || null }, h);
  const reason = '테스트를 지우거나 끄는 변경이 있습니다: ' + problems.map((p) => `${p.what} ${p.file}`).join(', ') +
    '. 되돌리세요. 정말 필요하면 이유를 사람에게 설명하고 승인을 받으세요 (.aif/config.yaml hooks_off 에 check, off_reasons 에 이유).';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

function cmdGuardPush() {
  const h = readStdin();
  const cfg = config();
  if (cfg.hooks_off.includes('guard-push')) return;
  const cmd = String((h.tool_input && h.tool_input.command) || '');
  const segs = cmd.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter((s) => /^git\s+push\b/.test(s));
  if (!segs.length) return;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  for (const s of segs) {
    const toks = s.split(/\s+/).slice(2);
    const force = toks.some((t) => /^(-f|--force|--force-with-lease(=.*)?|\+.*)$/.test(t));
    const pos = toks.filter((t) => !t.startsWith('-'));
    const refspecs = pos.slice(1);
    const toMain = refspecs.length
      ? refspecs.some((r) => /(^|:)(refs\/heads\/)?(main|master)$/.test(r.replace(/^\+/, '')))
      : ['main', 'master'].includes(branch);
    if (force || toMain) {
      const why = force ? '강제 push' : 'main·master로 직접 push';
      appendEvent('block', { by: 'guard_push', what: why, cmd: clip(s, 200) }, h);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${why}는 막혀 있습니다. 작업 브랜치로 push하고 PR을 여세요 (/aif-deliver).` } }));
      return;
    }
  }
}

// ───────────────────────── git 훅 ─────────────────────────

function cmdGit(args) {
  const [hook, ...rest] = args;
  const cfg = config();
  if (hook === 'prepare-commit-msg') {
    const [file, source] = rest;
    if (!file || ['merge', 'squash'].includes(source)) return;
    const cur = current();
    if (!cur) return;
    const msg = readText(file);
    if (/^Task:\s/m.test(msg)) return;
    const lines = msg.split('\n');
    const firstComment = lines.findIndex((l) => l.startsWith('#'));
    const body = (firstComment >= 0 ? lines.slice(0, firstComment) : lines).join('\n').replace(/\s+$/, '');
    const tail = firstComment >= 0 ? '\n' + lines.slice(firstComment).join('\n') : '\n';
    fs.writeFileSync(file, `${body}\n\nTask: ${cur.task}\nPhase: ${cur.phase}\n${tail}`);
  } else if (hook === 'post-commit') {
    const sha = git(['rev-parse', 'HEAD']);
    if (!sha) return;
    const msg = git(['log', '-1', '--format=%B']) || '';
    const tm = msg.match(/^Task:\s*(\S+)/m);
    const task = tm ? tm[1] : (current() || {}).task || '_none';
    const ns = git(['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', 'HEAD']) || '';
    const files = ns.split('\n').filter(Boolean).map((l) => { const [st, f] = l.split('\t'); return { st, f, kind: fileKind(f, cfg) }; });
    appendEvent('commit', { sha, subject: clip(msg.split('\n')[0], 120), files }, {}, task);
  }
}

// ───────────────────────── analyze ─────────────────────────

function loadRules() {
  const local = P('.aif/framework/rules.yaml');
  const repo = path.resolve(path.dirname(SCRIPT), '../feedback/rules.yaml');
  const y = parseYaml(readText(exists(local) ? local : repo)) || {};
  return y.rules || [];
}

function goalDocPath(route, cfg) {
  if (route === 'standard') return cfg.purpose === 'analyze' ? 'docs/question.md' : 'docs/spec.md';
  return null;
}
function criteriaCount(id, route, cfg) {
  const f = route === 'standard' ? P(goalDocPath(route, cfg)) : path.join(taskDir(id), 'card.md');
  const t = readText(f);
  const m = t.split(/\n(?=#+\s)/).find((s) => /완료 기준|인수 사례|요구사항|Acceptance/i.test(s.split('\n')[0]));
  if (!m) return 0;
  // 체크박스 줄, 또는 표의 "| R1 |" 같은 요구사항 줄
  return (m.match(/^\s*- \[[ xX]\]/gm) || []).length + (m.match(/^\|\s*R\d+\s*\|/gm) || []).length;
}

function deriveActivities(events, judg, cfg) {
  const acts = [];
  const add = (name, e, extra = {}) => acts.push({ name, ts: e.ts, t: ms(e.ts), session: e.session_id, phase: e.phase, ev: e, ...extra });
  let approvedAt = null;
  let turn = 0;
  const promptLabels = {};
  for (const j of (judg && judg.items) || []) if (j.kind === 'prompt' && j.label && j.label !== 'uncertain') promptLabels[j.candidate_id] = j.label;
  const claimLabels = {};
  for (const j of (judg && judg.items) || []) if (j.kind === 'claim' && j.label) claimLabels[j.candidate_id] = j.label;
  for (const e of events) {
    const d = e.data || {};
    if (e.type === 'prompt') {
      turn++; e._turn = turn;
      const lab = promptLabels['p-' + turn];
      if (lab) add('prompt.' + lab, e, { turn });
      if (['correction', 'stop', 'revert', 'direction_change'].includes(lab)) add('correction', e, { turn, label: lab });
      if (d.skill === 'code-review' && e.phase === 'verify') add('builtin.code_review_in_verify', e);
      if (d.skill === 'goal') add('builtin.goal_set', e);
    } else if (e.type === 'gate') {
      if (d.phase === 'plan' && d.result === 'pass') {
        // 승인이 프롬프트가 아니라 질문 도구(AskUserQuestion) 답으로 온 경우: 게이트 직전 2분 안의 질문을 사람 승인으로 본다 [추론]
        const ask = [...events].reverse().find((x) => ms(x.ts) <= ms(e.ts) && ms(e.ts) - ms(x.ts) <= 120e3 && x.type === 'tool' && x.data.tool === 'AskUserQuestion');
        if (ask) add('prompt.approval', ask, { via: 'AskUserQuestion' });
        add('goal.approved', e); approvedAt = approvedAt || ms(e.ts);
      }
      if (d.phase === 'verify') add(d.result === 'pass' ? 'verify.pass' : 'verify.fail', e);
      if (d.phase === 'work' && d.result === 'pass') add('work.done', e);
      if (d.phase === 'deliver' && d.result === 'pass') add('deliver.done', e);
    } else if (e.type === 'phase') {
      if (d.to === 'deliver') add('deliver.start', e);
    } else if (e.type === 'tool') {
      const editing = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(d.tool);
      if (d.file) d.file_kind = fileKind(d.file, cfg); // 기록 때와 분류 기준이 달라졌을 수 있어 다시 분류
      if (editing && d.file_kind) {
        const map = { code: 'edit.code', test: 'edit.test', data_raw: 'edit.data_raw', progress: 'edit.progress', adr: 'decision.recorded', goal: 'edit.goal' };
        if (map[d.file_kind]) add(map[d.file_kind], e, { file: d.file });
        if (d.file_kind === 'goal' && approvedAt && ms(e.ts) > approvedAt) add('goal.changed_after_approval', e, { file: d.file });
      }
      if (d.tool === 'Bash' && d.check) add('check.run', e, { turn });
      if (d.tool === 'Bash' && e.phase === 'verify' && /analysis\//.test(d.bash || '')) add('check.rerun', e);
      if ((d.tool === 'Agent' || d.tool === 'Task') && e.phase === 'verify' && /review/i.test(d.agent_type || '')) add('subagent.reviewer_in_verify', e);
    } else if (e.type === 'subagent') {
      if (e.phase === 'verify' && /review/i.test(d.agent_type || '')) add('subagent.reviewer_in_verify', e);
    } else if (e.type === 'block') {
      if (d.by === 'check') add(d.what === 'test.deleted' ? 'test.deleted' : 'test.disabled', e);
      if (d.by === 'guard_push') add('block.guard_push', e);
      if (d.by === 'permission') { add('block.permission', e); if (d.file_kind === 'data_raw') add('block.permission_data_raw', e); }
    } else if (e.type === 'commit') {
      for (const f of d.files || []) if (f.st && f.st.startsWith('D') && f.kind === 'test') add('test.deleted', e, { file: f.f });
      // 셸로 쓴 결정 기록(cat > docs/adr/...)도 커밋에서 잡는다
      for (const f of d.files || []) if (f.st && /^[AM]/.test(f.st) && f.kind === 'adr') add('decision.recorded', e, { file: f.f });
    } else if (e.type === 'turn') {
      const lab = claimLabels['c-' + turn];
      if (lab === 'done_claim') add('claim.done', e, { turn });
      if (lab === 'stop_report') add('stopped_and_reported', e, { turn });
    } else if (e.type === 'task.route') add('task.routed', e);
  }
  // session.has_work
  const bySession = {};
  for (const a of acts) if (a.session && (a.name.startsWith('edit.') || a.name === 'commit')) bySession[a.session] = true;
  for (const e of events) if (e.type === 'commit' && e.session_id) bySession[e.session_id] = true;
  for (const e of events.filter((x) => x.type === 'session.end')) if (bySession[e.session_id]) add('session.has_work', e);
  return acts.sort((a, b) => a.t - b.t);
}

function evalRules(rules, ctx) {
  const { acts, events, route, cfg, judg } = ctx;
  const has = (names) => { const ns = [].concat(names); return acts.filter((a) => ns.includes(a.name)); };
  const results = [];
  for (const r of rules) {
    const ap = r.applies || {};
    const skip = (ap.route && !ap.route.includes(route)) || (ap.size && !ap.size.includes(ctx.size)) || (ap.purpose && !ap.purpose.includes(cfg.purpose)) || (ap.variant && !ap.variant.includes(cfg.variant));
    const res = { id: r.id, text: r.text, source: r.source, template: r.template, judge: r.judge, activations: 0, violations: [], status: 'n/a' };
    if (skip) { res.status = 'n/a'; results.push(res); continue; }
    if (cfg.checks_off.includes(r.id)) { res.status = 'off'; res.reason = (cfg.off_reasons || {})[r.id] || '이유 없음'; results.push(res); continue; }
    const aiPending = r.judge === 'ai+code' && !judg;
    switch (r.template) {
      case 'precedence': {
        const bs = has(r.b);
        if (r.scope === 'per_commit') {
          // 커밋 사이 구간마다: 코드 수정이 있으면 그 앞에 테스트 수정이 있어야 한다
          const commits = events.filter((e) => e.type === 'commit').map((e) => ms(e.ts));
          const bounds = [-Infinity, ...commits, Infinity];
          for (let k = 0; k < bounds.length - 1; k++) {
            const inWin = (a) => a.t > bounds[k] && a.t <= bounds[k + 1];
            const b1 = has(r.b).filter(inWin)[0];
            if (!b1) continue;
            res.activations++;
            const a1 = has(r.a).filter(inWin)[0];
            if (!a1 || a1.t > b1.t) res.violations.push({ ts: b1.ts, detail: `${b1.file || b1.name}가 ${[].concat(r.a).join('/')}보다 먼저` });
          }
        } else {
          for (const b of bs) {
            res.activations++;
            if (!has(r.a).some((a) => a.t <= b.t)) res.violations.push({ ts: b.ts, detail: `${b.name}${b.file ? ' ' + b.file : ''} 전에 ${[].concat(r.a).join('/')} 없음` });
          }
        }
        break;
      }
      case 'response': {
        for (const a of has(r.a)) {
          res.activations++;
          let ok;
          if (r.window === 'same_turn') {
            const nextPrompt = events.find((e) => e.type === 'prompt' && ms(e.ts) > a.t);
            const prevPrompt = [...events].reverse().find((e) => e.type === 'prompt' && ms(e.ts) <= a.t);
            const lo = prevPrompt ? ms(prevPrompt.ts) : -Infinity, hi = nextPrompt ? ms(nextPrompt.ts) : Infinity;
            ok = has(r.b).some((b) => b.t >= lo && b.t <= Math.max(a.t, hi));
          } else if (r.window === 'same_session') {
            ok = has(r.b).some((b) => b.session === a.session && b.t <= a.t);
          } else ok = has(r.b).some((b) => b.t >= a.t);
          if (!ok) res.violations.push({ ts: a.ts, detail: `${a.name} 뒤에 ${[].concat(r.b).join('/')} 없음` });
        }
        break;
      }
      case 'absence': {
        const xs = has(r.a);
        res.activations = 1;
        for (const x of xs) res.violations.push({ ts: x.ts, detail: `${x.name}${x.file ? ' ' + x.file : ''}${x.ev && x.ev.type === 'block' ? ' (시도했고 훅이 막음)' : ''}`, blocked: !!(x.ev && x.ev.type === 'block') });
        break;
      }
      case 'different': {
        const sess = (ph) => new Set(events.filter((e) => e.phase === ph && e.session_id).map((e) => e.session_id));
        const w = sess(r.x), v = sess(r.y);
        if (!v.size) break;
        res.activations = 1;
        const overlap = [...v].some((s) => w.has(s));
        const alt = [].concat(r.or || []).some((n) => has(n).length);
        if (overlap && !alt) res.violations.push({ ts: null, detail: '검증 단계가 수행과 같은 세션이고 독립 검증자(/code-review, reviewer) 기록이 없음' });
        break;
      }
      case 'count': {
        const c = countRule(r.id, ctx);
        if (c === null) break;
        res.activations = 1;
        if (!c.ok) res.violations.push({ ts: null, detail: c.detail });
        break;
      }
      case 'lines': {
        const t = readText(P(r.file));
        if (!t) break;
        res.activations = 1;
        const n = t.split('\n').length;
        if (n > r.max) res.violations.push({ ts: null, detail: `${r.file} ${n}줄 (기준 ${r.max + 1}줄 미만)` });
        break;
      }
    }
    if (aiPending) { res.status = 'ai-pending'; res.violations = []; }
    else res.status = res.activations === 0 ? 'n/a' : res.violations.length ? 'violated' : 'ok';
    results.push(res);
  }
  return results;
}

function countRule(id, ctx) {
  const { acts, events, route, cfg, task } = ctx;
  const taskCommits = events.filter((e) => e.type === 'commit').length;
  switch (id) {
    case 'C-LIGHT-SCOPE': {
      if (route !== 'light' && !acts.some((a) => a.name === 'task.routed')) return null;
      const crit = criteriaCount(task, 'light', cfg);
      const routedUp = acts.some((a) => a.name === 'task.routed');
      const ok = route !== 'light' || routedUp || (taskCommits <= 1 && crit <= 3);
      return { ok, detail: `가벼운 경로인데 커밋 ${taskCommits}개, 완료 기준 ${crit}개 (표준으로 올리지 않음)` };
    }
    case 'D-COMMIT-PER-TASK': {
      const t = readText(P('docs/tasks.md'));
      if (!t) return null;
      const checked = (t.match(/^\s*- \[[xX]\]/gm) || []).length;
      return { ok: checked <= taskCommits, detail: `체크한 작업 ${checked}개, 커밋 ${taskCommits}개` };
    }
    case 'C-TWO-CORRECTIONS': {
      const j = ctx.judg;
      if (!j) return null;
      const topics = {};
      for (const it of j.items || []) if (it.kind === 'prompt' && it.label === 'correction' && it.topic) topics[it.topic] = (topics[it.topic] || 0) + 1;
      const max = Math.max(0, ...Object.values(topics));
      const stopped = acts.some((a) => a.name === 'stopped_and_reported');
      return { ok: max <= 2 || stopped, detail: `같은 주제 수정 요청 ${max}번, 멈추고 원인 보고 없음` };
    }
    case 'A-SOURCES-LOGGED':
    case 'A-CROSS-CHECK': {
      const rep = readText(P('docs/report.md'));
      if (!rep) return null;
      const srcs = readText(P('docs/sources.md'));
      const rows = rep.split('\n').filter((l) => /\[확인\]/.test(l));
      if (id === 'A-SOURCES-LOGGED') {
        const bad = rows.filter((l) => !/#?\d+/.test(l.split('[확인]').slice(1).join(''))).length;
        return { ok: bad === 0 || !srcs, detail: `[확인] 주장 중 출처 번호가 없는 것 ${bad}개` };
      }
      const concl = (rep.split(/\n## /).find((s) => s.startsWith('결론')) || '').split('\n').filter((l) => /\[확인\]/.test(l));
      const single = concl.filter((l) => (l.match(/#\d+/g) || []).length < 2).length;
      return { ok: single === 0, detail: `결론의 [확인] 주장 중 출처가 하나뿐인 것 ${single}개` };
    }
    default: return null;
  }
}

// 사람이 쓰지 않은 세션을 찾는다.
// 1) SessionStart 때 CLAUDE_CODE_ENTRYPOINT가 sdk-*  2) [추정] 다른 세션의 턴이 끝난 뒤 10초 안에 시작했고, 도구를 쓰지 않았고, 프롬프트가 하나뿐인 세션 (Stop 훅이 띄운 요약 세션 등)
function backgroundSessions(events) {
  const bySess = {};
  for (const e of events) if (e.session_id) (bySess[e.session_id] = bySess[e.session_id] || []).push(e);
  const out = new Set();
  for (const [sid, evs] of Object.entries(bySess)) {
    const st = evs.find((e) => e.type === 'session.start');
    if (st && /^sdk/.test(st.data.entrypoint || '')) { out.add(sid); continue; }
    if (!st) continue;
    const prompts = evs.filter((e) => e.type === 'prompt');
    const tools = evs.filter((e) => e.type === 'tool' || e.type === 'tool.fail');
    const t0 = ms(st.ts);
    const afterTurn = events.some((e) => e.type === 'turn' && e.session_id && e.session_id !== sid && t0 - ms(e.ts) >= 0 && t0 - ms(e.ts) <= 10e3);
    if (afterTurn && !tools.length && prompts.length <= 1) out.add(sid);
  }
  return out;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }

function cmdAnalyze(args, { quiet = false } = {}) {
  const id = args[0] || (current() || {}).task;
  if (!id || !exists(taskDir(id))) throw new Error('작업 ID가 없습니다: ' + id);
  const cfg = config();
  const allEvents = readEvents(id);
  if (!allEvents.length) throw new Error('이벤트가 없습니다: ' + id);
  const start = allEvents.find((e) => e.type === 'task.start');
  let route = (start && start.data.route) || 'standard';
  let size = (start && start.data.size) || sizeOfRoute(route);
  const routed = allEvents.filter((e) => e.type === 'task.route');
  if (routed.length) { route = routed[routed.length - 1].data.to; size = routed[routed.length - 1].data.size_to || sizeOfRoute(route); }
  const judg = readJson(path.join(taskDir(id), 'ai-judgments.json'), null);
  // 백그라운드 세션 (플러그인이 띄운 요약 등): 사람이 쓰지 않은 세션이라 규칙·개입 지표에서 빼고 토큰만 따로 센다
  const bg = backgroundSessions(allEvents);
  const events = allEvents.filter((e) => !bg.has(e.session_id));
  const acts = deriveActivities(events, judg, cfg);
  const ctx = { acts, events, route, size, cfg, judg, task: id };
  const rules = evalRules(loadRules(), ctx);

  // ② 효율
  const prompts = events.filter((e) => e.type === 'prompt');
  const isHuman = (e) => !(e.data.skill || '').startsWith('aif-') && !/^\s*<task-notification>/.test(e.data.text || '');
  const humanPrompts = prompts.filter(isHuman);
  const corrections = acts.filter((a) => a.name === 'correction');
  const phases = [];
  const phaseEvs = events.filter((e) => e.type === 'phase');
  const lastTs = ms(events[events.length - 1].ts);
  // 실작업 시간: 이벤트 사이 간격 중 5분 이하만 더한다 (자리 비움·절전 제외)
  const activeMin = (a, b) => { let sum = 0; let prev = null; for (const e of events) { const t = ms(e.ts); if (t < a || t > b) continue; if (prev !== null && t - prev <= 5 * 6e4) sum += t - prev; prev = t; } return Math.round(sum / 6e4 * 10) / 10; };
  const phaseAgg = {};
  phaseEvs.forEach((e, k) => {
    const end = k + 1 < phaseEvs.length ? ms(phaseEvs[k + 1].ts) : lastTs;
    const p = (phaseAgg[e.data.to] = phaseAgg[e.data.to] || { phase: e.data.to, start: e.ts, minutes: 0, wall_minutes: 0, entries: 0 });
    p.minutes = Math.round((p.minutes + activeMin(ms(e.ts), end)) * 10) / 10;
    p.wall_minutes = Math.round((p.wall_minutes + (end - ms(e.ts)) / 6e4) * 10) / 10;
    p.entries++;
  });
  phases.push(...Object.values(phaseAgg));
  // AI 작업 시간 vs 사람 대기: prompt→turn = AI, turn→다음 prompt = 사람
  let ai = 0, wait = 0;
  for (let k = 0; k < events.length; k++) {
    const e = events[k];
    // AI 시간은 실작업(5분 넘는 빈 시간 제외), 사람 대기는 턴 끝 → 다음 프롬프트 (자리 비움 포함)
    if (e.type === 'prompt') { const t = events.slice(k + 1).find((x) => x.type === 'turn'); if (t) ai += activeMin(ms(e.ts), ms(t.ts)) * 6e4; }
    if (e.type === 'turn') { const p = events.slice(k + 1).find((x) => x.type === 'prompt' && !/^\s*<task-notification>/.test(x.data.text || '')); if (p) wait += ms(p.ts) - ms(e.ts); }
  }
  const bgUsage = allEvents.filter((e) => e.type === 'usage' && bg.has(e.data.session)).reduce((s, e) => s + (e.data.input || 0) + (e.data.output || 0) + (e.data.cache_write || 0), 0);
  const usage = events.filter((e) => e.type === 'usage' && !bg.has(e.data.session)).reduce((s, e) => ({ input: s.input + (e.data.input || 0), output: s.output + (e.data.output || 0), cache_read: s.cache_read + (e.data.cache_read || 0), cache_write: s.cache_write + (e.data.cache_write || 0) }), { input: 0, output: 0, cache_read: 0, cache_write: 0 });
  const tokens = usage.input + usage.output + usage.cache_write;
  const verifyGates = events.filter((e) => e.type === 'gate' && e.data.phase === 'verify');
  const limits = cfg.limits || {};
  const totalMin = Math.round((lastTs - ms(events[0].ts)) / 6e4);
  const eff = {
    human_prompts: humanPrompts.length,
    corrections: judg ? corrections.length : null,
    intervention_rate: judg && humanPrompts.length ? Math.round(corrections.length / humanPrompts.length * 100) / 100 : null,
    decisions_after_approval: acts.filter((a) => a.name === 'goal.changed_after_approval').length + acts.filter((a) => a.name === 'prompt.direction_change').length,
    phases, total_minutes: totalMin, active_minutes: activeMin(-Infinity, Infinity),
    ai_minutes: Math.round(ai / 6e4), wait_minutes: Math.round(wait / 6e4),
    tokens: usage, tokens_total: tokens,
    background: { sessions: bg.size, tokens: bgUsage },
    verify_fail_rounds: verifyGates.filter((g) => g.data.result === 'fail').length,
    verify_attempts: verifyGates.length,
    tool_failures: events.filter((e) => e.type === 'tool.fail').length,
    permission_prompts: events.filter((e) => e.type === 'notify' && /permission/i.test((e.data.kind || '') + ' ' + (e.data.message || ''))).length,
    compacts: events.filter((e) => e.type === 'compact').length,
    routed_up: routed.length > 0,
    over_limit: (limits.hours_per_task && totalMin > limits.hours_per_task * 60) || (limits.tokens_per_task && tokens > limits.tokens_per_task) || false,
    size, budget: budgetOf(size, cfg),
  };

  // ③ 완성도
  const firstVerify = verifyGates[0];
  const claims = acts.filter((a) => a.name === 'claim.done');
  const falseDone = claims.filter((c) => verifyGates.some((g) => ms(g.ts) > c.t && g.data.result === 'fail' && !claims.some((c2) => c2.t > c.t && c2.t < ms(g.ts)))).length;
  const firstFail = events.find((e) => e.type === 'tool.fail' || (e.type === 'gate' && e.data.result === 'fail'));
  const surfaced = events.find((e) => e.type === 'gate' && e.data.result === 'fail');
  const deliverAt = acts.find((a) => a.name === 'deliver.done');
  let rework = null;
  if (deliverAt) {
    const log = git(['log', `--since=${new Date(deliverAt.t).toISOString()}`, `--until=${new Date(deliverAt.t + 7 * 864e5).toISOString()}`, '--format=%s%x1f%B%x1e']) || '';
    rework = log.split('\x1e').filter((s) => s.trim()).filter((s) => { const [subj, body] = s.split('\x1f'); return /^(fix|revert|hotfix)/i.test(subj.trim()) && new RegExp(`Task:\\s*${id}\\b`).test(body); }).length;
  }
  const comp = {
    criteria: criteriaCount(id, route, cfg),
    first_verify: firstVerify ? firstVerify.data.result : null,
    verify_result: verifyGates.length ? verifyGates[verifyGates.length - 1].data.result : null,
    false_done: judg ? falseDone : null,
    first_failure: firstFail ? { ts: firstFail.ts, phase: firstFail.phase, type: firstFail.type } : null,
    surfaced: surfaced ? { ts: surfaced.ts, phase: surfaced.phase } : null,
    rework_after_deliver: rework,
  };

  // 판정 (임계값은 [추론], 운영하며 조정)
  const viol = rules.filter((r) => r.status === 'violated');
  const vRules = viol.length >= 2 ? '문제' : viol.length === 1 ? '주의' : '정상';
  let vEff = '정상';
  if (eff.verify_attempts >= 2 || eff.routed_up || eff.decisions_after_approval > 0 || (eff.intervention_rate !== null && eff.intervention_rate > 0.3)) vEff = '주의';
  // 기대 대비: 규모의 기대 시간·토큰을 1.5배 넘으면 문제, 넘기만 하면 주의
  const bud = eff.budget || {};
  eff.budget_ratio = { minutes: bud.minutes ? Math.round(eff.active_minutes / bud.minutes * 100) / 100 : null, tokens: bud.tokens ? Math.round(eff.tokens_total / bud.tokens * 100) / 100 : null };
  eff.over_budget = [eff.budget_ratio.minutes, eff.budget_ratio.tokens].some((r) => r !== null && r > 1.5);
  if ([eff.budget_ratio.minutes, eff.budget_ratio.tokens].some((r) => r !== null && r > 1) && vEff === '정상') vEff = '주의';
  if (eff.verify_attempts >= 3 || eff.over_limit || eff.over_budget) vEff = '문제';
  let vComp = '정상';
  if (comp.first_verify === 'fail') vComp = '주의';
  if ((comp.false_done || 0) > 0 || (comp.rework_after_deliver || 0) > 0 || comp.verify_result === 'fail') vComp = '문제';

  // AI 판정 후보
  const cand = { task: id, goal_doc: route === 'standard' ? goalDocPath(route, cfg) : `.aif/tasks/${id}/card.md`, prompts: [], claims: [], causes: [], causes_context: [] };
  let turn = 0;
  for (const e of events) {
    if (e.type === 'prompt') { turn++; if (isHuman(e)) cand.prompts.push({ candidate_id: 'p-' + turn, turn, ts: e.ts, phase: e.phase, text: e.data.text }); }
    if (e.type === 'turn' && ['work', 'verify', 'explore'].includes(e.phase) && /(완료|끝났|됐습니다|마쳤|구현했|고쳤|done|complete|finished|fixed)/i.test(e.data.last_text || '')) {
      const turnChecks = acts.filter((a) => a.name === 'check.run' && a.turn === turn).length;
      cand.claims.push({ candidate_id: 'c-' + turn, turn, ts: e.ts, phase: e.phase, text: e.data.last_text, check_runs_in_turn: turnChecks });
    }
  }
  const near = (ts) => { const t = ts ? ms(ts) : lastTs; return events.filter((e) => e.type === 'prompt' && !/^\s*<task-notification>/.test(e.data.text || '') && Math.abs(ms(e.ts) - t) < 30 * 6e4).map((e) => ({ turn: e._turn, text: clip(e.data.text, 300) })); };
  // 훅이 이미 막은 시도는 원인 판정 후보에서 뺀다 (강제 수단이 작동한 것이므로 다음에 바꿀 것이 없다)
  // 같은 규칙의 위반은 한 후보로 묶는다 (원인이 같으면 한 번만 세고 한 번만 제안한다)
  for (const r of viol) {
    const vs = r.violations.filter((x) => !x.blocked);
    if (!vs.length) continue;
    cand.causes.push({ candidate_id: `k-rule-${r.id}`, kind: 'rule', rule: r.id, text: r.text, detail: vs.length > 1 ? `${vs.length}건: ${vs.map((v) => v.detail).join('; ')}` : vs[0].detail, ts: vs[0].ts, nearby_prompts: near(vs[0].ts) });
  }
  // 검증 FAIL마다: 근거 파일과 FAIL 직후 AI가 남긴 요약 (판정자가 원인을 찾을 재료)
  const failRounds = verifyGates.filter((g) => g.data.result === 'fail').map((g, k) => {
    const t = events.find((x) => x.type === 'turn' && ms(x.ts) >= ms(g.ts));
    const nextHuman = events.find((x) => x.type === 'prompt' && ms(x.ts) > ms(g.ts) && !/^\s*<task-notification>/.test(x.data.text || ''));
    return { round: k + 1, ts: g.ts, evidence: g.data.evidence || null, ai_summary: t ? t.data.last_text : null, human_reply: nextHuman ? clip(nextHuman.data.text, 300) : null };
  });
  if (eff.verify_attempts >= 2) cand.causes.push({ candidate_id: 'k-eff-verify', kind: 'efficiency', detail: `검증 ${eff.verify_attempts}회 시도 (FAIL ${failRounds.length}회)`, verify_fails: failRounds, evidence_files: [...new Set(failRounds.map((r) => r.evidence).filter(Boolean))], nearby_prompts: near(verifyGates[verifyGates.length - 1].ts) });
  if (eff.routed_up) cand.causes.push({ candidate_id: 'k-eff-routed', kind: 'efficiency', detail: '가벼운 → 표준으로 올림', nearby_prompts: near(routed[0].ts) });
  if (eff.decisions_after_approval) cand.causes.push({ candidate_id: 'k-eff-decision', kind: 'efficiency', detail: `승인 뒤 재결정 ${eff.decisions_after_approval}회`, nearby_prompts: near(null) });
  if (eff.over_limit) cand.causes.push({ candidate_id: 'k-eff-limit', kind: 'efficiency', detail: '상한 초과', nearby_prompts: near(null) });
  if (eff.over_budget) cand.causes.push({ candidate_id: 'k-eff-budget', kind: 'efficiency', detail: `규모 ${eff.size} 기대 대비 시간 ${eff.budget_ratio.minutes ?? '-'}배, 토큰 ${eff.budget_ratio.tokens ?? '-'}배 (규모를 잘못 골랐나, 절차가 과했나, 기획에서 놓쳤나)`, phases: eff.phases, nearby_prompts: near(null) });
  if (comp.first_verify === 'fail') cand.causes.push({ candidate_id: 'k-q-first-verify', kind: 'quality', detail: '첫 검증 실패', verify_fails: failRounds.slice(0, 1), evidence_files: failRounds[0] && failRounds[0].evidence ? [failRounds[0].evidence] : [], nearby_prompts: near(firstVerify.ts) });
  if (comp.rework_after_deliver) cand.causes.push({ candidate_id: 'k-q-rework', kind: 'quality', detail: `전달 뒤 7일 안 수정 커밋 ${comp.rework_after_deliver}개`, nearby_prompts: [] });

  const analysis = {
    task: id, analyzed_at: isoNow(), fw: fwVersion(), route, size, purpose: cfg.purpose, variant: cfg.variant,
    verdict: { rules: vRules, efficiency: vEff, quality: vComp },
    rules, efficiency: eff, quality: comp,
    ai: judg ? { judged: true, uncertain: (judg.items || []).filter((x) => x.label === 'uncertain').length, total: (judg.items || []).length } : { judged: false },
    activations: Object.fromEntries(rules.map((r) => [r.id, r.activations])),
  };
  writeJson(path.join(taskDir(id), 'analysis.json'), analysis);
  writeJson(path.join(taskDir(id), 'ai-candidates.json'), cand);
  if (!quiet) {
    console.log(`분석: ${id} (경로 ${route})`);
    console.log(`  규칙 준수 ${vRules} · 효율 ${vEff} · 완성도 ${vComp}`);
    console.log(`  AI 판정 후보: 사람 메시지 ${cand.prompts.length}, 완료 보고 ${cand.claims.length}, 원인 ${cand.causes.length} → .aif/tasks/${id}/ai-candidates.json`);
  }
  return analysis;
}

// ───────────────────────── merge-judgments (두 판정 합치기) ─────────────────────────

function cmdMergeJudgments(args) {
  const [fa, fb, outArg] = args;
  if (!fa || !fb) throw new Error('merge-judgments <판정A.json> <판정B.json> [<출력>]');
  const A = readJson(fa, { items: [] }), B = readJson(fb, { items: [] });
  const key = (x) => `${x.kind}:${x.candidate_id}`;
  const valid = (x) => x && x.candidate_id && x.kind && x.label && Array.isArray(x.evidence) && x.evidence.some((e) => e && e.quote);
  const ma = new Map((A.items || []).filter(valid).map((x) => [key(x), x]));
  const mb = new Map((B.items || []).filter(valid).map((x) => [key(x), x]));
  const items = [];
  let dropped = (A.items || []).length + (B.items || []).length - ma.size - mb.size;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const a = ma.get(k), b = mb.get(k);
    const base = a || b;
    if (a && b && a.label === b.label) {
      const sug = [...new Set([a.suggestion, b.suggestion].filter(Boolean))];
      items.push({ candidate_id: base.candidate_id, kind: base.kind, label: a.label, topic: a.topic || b.topic || null, evidence: [...a.evidence, ...b.evidence], suggestion: sug[0] || null, suggestion_alt: sug[1] || null, agreed: true });
    } else {
      items.push({ candidate_id: base.candidate_id, kind: base.kind, label: 'uncertain', labels: { A: a ? a.label : null, B: b ? b.label : null }, evidence: [...(a ? a.evidence : []), ...(b ? b.evidence : [])], suggestion: null, agreed: false });
    }
  }
  const out = { merged_at: isoNow(), judges: [A.judge || 'A', B.judge || 'B'], dropped_without_evidence: dropped, items };
  const target = outArg || path.join(taskDir((current() || {}).task || '_none'), 'ai-judgments.json');
  writeJson(target, out);
  console.log(`판정 합침: ${items.length}건 (일치 ${items.filter((x) => x.agreed).length}, 불확실 ${items.filter((x) => !x.agreed).length}, 근거 없어 버림 ${dropped}) → ${rel(target)}`);
}

// ───────────────────────── report ─────────────────────────

const CAUSE_KO = { plan_gap: '기획 누락', decision: '의사결정 지연·번복', setting: '설정 문제', process: '진행 방식', impl: '구현', unknown: '판단 불가', uncertain: '불확실' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cmdReport(args, { quiet = false } = {}) {
  const id = args[0] || (current() || {}).task;
  const a = cmdAnalyze([id], { quiet: true });
  const judg = readJson(path.join(taskDir(id), 'ai-judgments.json'), null);
  const causes = ((judg && judg.items) || []).filter((x) => x.kind === 'cause');
  const counts = {};
  for (const c of causes) counts[c.label] = (counts[c.label] || 0) + 1;
  // 같은 제안은 한 번만, 두 판정자의 문장이 다르면 둘 다 보이고 사람이 고른다 (기획 질문에는 첫 문장만 넣는다)
  const suggestions = [];
  for (const c of causes.filter((x) => x.label !== 'uncertain' && x.suggestion)) {
    if (suggestions.some((s) => s.text === c.suggestion)) continue;
    suggestions.push({ label: c.label, text: c.suggestion, alt: c.suggestion_alt || null, ids: [c.candidate_id] });
  }
  const order = ['plan_gap', 'decision', 'setting', 'process', 'impl'];
  const headline = judg
    ? `이번 작업에서 결과를 늦추거나 떨어뜨린 원인: ${order.map((k) => `${CAUSE_KO[k]} ${counts[k] || 0}건`).join(', ')}${counts.uncertain ? ` (불확실 ${counts.uncertain}건)` : ''}`
    : 'AI 판정 전입니다. /aif-report가 판정을 끝내면 원인 단계가 채워집니다.';

  // plan-questions에 기획 질문 쌓기
  const qFile = P('.aif/plan-questions.md');
  let q = readText(qFile, '# 쌓인 기획 질문\n\n지난 작업에서 기획 누락·결정 지연의 원인으로 나온 질문입니다. /aif-plan이 읽습니다. 필요 없는 줄은 지워도 됩니다.\n');
  let added = 0;
  for (const s of suggestions.filter((s) => s.label === 'plan_gap' || s.label === 'decision')) {
    if (!q.includes(s.text)) { q = q.replace(/\s*$/, '\n') + `- ${s.text} (출처: ${id}, ${CAUSE_KO[s.label]})\n`; added++; }
  }
  if (added) fs.writeFileSync(qFile, q);

  const badge = (v) => `<span class="b ${v === '정상' ? 'ok' : v === '주의' ? 'warn' : 'bad'}">${v}</span>`;
  const viol = a.rules.filter((r) => r.status === 'violated');
  const e = a.efficiency, c = a.quality;
  const maxMin = Math.max(1, ...e.phases.map((p) => p.minutes));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>작업 보고 ${esc(id)}</title><style>
:root{--fg:#1f2328;--mut:#656d76;--bd:#d0d7de;--bg:#fff;--card:#f6f8fa;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e;--ac:#0969da}
@media(prefers-color-scheme:dark){:root{--fg:#e6edf3;--mut:#9198a1;--bd:#30363d;--bg:#0d1117;--card:#161b22;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--ac:#4493f8}}
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;color:var(--fg);background:var(--bg);margin:0;padding:24px;max-width:980px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}.mut{color:var(--mut);font-size:13px}
.head{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:16px;margin:16px 0}
.head p{margin:4px 0}.b{display:inline-block;padding:1px 10px;border-radius:12px;font-size:13px;font-weight:600;border:1px solid}
.ok{color:var(--ok);border-color:var(--ok)}.warn{color:var(--warn);border-color:var(--warn)}.bad{color:var(--bad);border-color:var(--bad)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cell{border:1px solid var(--bd);border-radius:10px;padding:12px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:500}
.bar{height:10px;background:var(--ac);border-radius:5px}.tag{font-size:12px;color:var(--mut);border:1px solid var(--bd);border-radius:6px;padding:0 6px}
ul{margin:4px 0 4px 18px;padding:0}</style></head><body>
<h1>작업 보고: ${esc(id)}</h1>
<div class="mut">규모 ${esc(a.size || '-')} (경로 ${esc(a.route)}) · 목적 ${esc(a.purpose || '-')} / ${esc(a.variant || '-')} · 프레임워크 ${esc(a.fw || '-')} · 분석 ${esc(a.analyzed_at)}</div>
<div class="head"><p><b>${esc(headline)}</b> ${judg ? '<span class="tag">AI 판정</span>' : ''}</p>
${suggestions.length ? '<p>다음 작업에서 바꿀 것:</p><ul>' + suggestions.map((s) => `<li>[${esc(CAUSE_KO[s.label])}] ${esc(s.text)}${s.alt ? `<div class="mut">다른 판정자: ${esc(s.alt)}</div>` : ''}</li>`).join('') + '</ul>' : ''}
${added ? `<p class="mut">기획 질문 ${added}개를 .aif/plan-questions.md에 추가했습니다.</p>` : ''}
${a.ai.judged ? `<p class="mut">AI 판정 ${a.ai.total}건 중 불확실 ${a.ai.uncertain}건 (두 판정이 달라 집계에서 뺌)</p>` : ''}</div>
<div class="grid">
<div class="cell"><div class="mut">① 규칙 준수</div>${badge(a.verdict.rules)}<div>${a.rules.filter((r) => r.status === 'ok').length}/${a.rules.filter((r) => ['ok', 'violated'].includes(r.status)).length} 지킴</div></div>
<div class="cell"><div class="mut">② 기획 대비 효율</div>${badge(a.verdict.efficiency)}<div>${e.budget && e.budget.minutes ? `기대 ${e.budget.minutes}분의 ${e.budget_ratio.minutes}배 · ` : ''}검증 ${e.verify_attempts}회 · 개입률 ${e.intervention_rate === null ? '판정 전' : Math.round(e.intervention_rate * 100) + '%'}</div></div>
<div class="cell"><div class="mut">③ 완성도</div>${badge(a.verdict.quality)}<div>첫 검증 ${esc(c.first_verify || '없음')} · 최종 ${esc(c.verify_result || '없음')}</div></div></div>
<h2>규칙 위반</h2>${viol.length ? '<table><tr><th>규칙</th><th>내용</th><th>시점</th></tr>' + viol.flatMap((r) => r.violations.map((v) => `<tr><td>${esc(r.id)}<div class="mut">${esc(r.text)}</div></td><td>${esc(v.detail)}</td><td class="mut">${esc(v.ts || '-')}</td></tr>`)).join('') + '</table>' : '<p class="mut">없음</p>'}
${a.rules.some((r) => r.status === 'off') ? '<p class="mut">끈 규칙: ' + a.rules.filter((r) => r.status === 'off').map((r) => `${esc(r.id)} (${esc(r.reason)})`).join(', ') + '</p>' : ''}
${a.rules.some((r) => r.status === 'ai-pending') ? '<p class="mut">AI 판정을 기다리는 규칙: ' + a.rules.filter((r) => r.status === 'ai-pending').map((r) => esc(r.id)).join(', ') + '</p>' : ''}
<h2>단계별 시간</h2><table>${e.phases.map((p) => `<tr><td style="width:90px">${esc(p.phase)}${p.entries > 1 ? ` <span class="mut">×${p.entries}</span>` : ''}</td><td><div class="bar" style="width:${Math.max(2, p.minutes / maxMin * 100)}%"></div></td><td style="width:80px">${p.minutes}분</td></tr>`).join('')}</table>
<p class="mut">실작업 ${e.active_minutes}분 (시작~끝 ${e.total_minutes}분, 5분 넘는 빈 시간 제외) · AI 작업 ${e.ai_minutes}분 · 사람 대기 ${e.wait_minutes}분 · 토큰 ${e.tokens_total.toLocaleString()} (캐시 읽기 ${e.tokens.cache_read.toLocaleString()} 제외)${e.background.sessions ? ` · 백그라운드 세션 ${e.background.sessions}개 토큰 ${e.background.tokens.toLocaleString()} 별도 (플러그인이 띄운 세션으로 추정)` : ''}</p>
<h2>효율·완성도 지표</h2><table>
<tr><th>사람 메시지</th><td>${e.human_prompts}</td><th>수정·중단·되돌리기</th><td>${e.corrections === null ? '판정 전' : e.corrections}</td></tr>
<tr><th>승인 뒤 재결정</th><td>${e.decisions_after_approval}</td><th>경로 올림</th><td>${e.routed_up ? '예' : '아니오'}</td></tr>
<tr><th>승인 요청</th><td>${e.permission_prompts}</td><th>검증 FAIL 회차</th><td>${e.verify_fail_rounds}</td></tr>
<tr><th>도구 실패</th><td>${e.tool_failures}</td><th>맥락 압축</th><td>${e.compacts} <span class="mut">(참고)</span></td></tr>
<tr><th>완료 기준 수</th><td>${c.criteria}</td><th>거짓 완료</th><td>${c.false_done === null ? '판정 전' : c.false_done}</td></tr>
<tr><th>첫 실패</th><td>${c.first_failure ? esc(c.first_failure.phase + ' ' + c.first_failure.type) : '없음'}</td><th>전달 뒤 재작업</th><td>${c.rework_after_deliver === null ? '전달 전' : c.rework_after_deliver}</td></tr></table>
<p class="mut">판정 기준(정상·주의·문제)은 [추론]이며 운영하며 조정합니다. 점수 하나로 합치지 않습니다.</p>
</body></html>`;
  fs.writeFileSync(path.join(taskDir(id), 'report.html'), html);

  // 회고는 docs/aif/tasks/<ID>.md의 리뷰 절이 맡는다 (aif close + /aif-report)
  if (quiet) return;
  console.log(headline);
  console.log(`보고 화면: ${rel(path.join(taskDir(id), 'report.html'))}`);
}

// ───────────────────────── status (지금 어디이고 다음은 무엇인지) ─────────────────────────

function statusInfo() {
  const cur = current();
  if (!cur || cur.closed) return { text: cur ? `진행 중인 작업 없음 (마지막: ${cur.task}, 닫힘). 새 작업은 /aif-plan <요청>` : '진행 중인 작업 없음. 새 작업은 /aif-plan <요청>' };
  const evs = readEvents(cur.task);
  const gates = evs.filter((e) => e.type === 'gate');
  const last = gates[gates.length - 1];
  const fails = gates.filter((g) => g.data.phase === 'verify' && g.data.result === 'fail').length;
  let next;
  if (!last) next = '/aif-plan 이어서 (목표 승인 전)';
  else if (last.data.phase === 'plan') next = '/aif-work';
  else if (last.data.phase === 'work') next = '/aif-verify';
  else if (last.data.phase === 'verify') next = last.data.result === 'pass' ? '/aif-deliver' : `/aif-work (검증 FAIL ${fails}회, 근거: ${last.data.evidence || '-'})`;
  else next = '/aif-report';
  if (cur.phase !== (last && last.data.phase) && last && !(last.data.phase === 'verify' && last.data.result === 'fail')) next = `${cur.phase} 단계 진행 중 → 끝나면 ${next}`;
  const bl = budgetLine(cur);
  return { text: `진행 중인 작업: ${cur.task} (규모 ${cur.size || sizeOfRoute(cur.route)}, 단계 ${cur.phase}). 다음: ${next}${bl ? '. ' + bl : ''}`, cur, next };
}
function cmdStatus(args) {
  const info = statusInfo();
  if (args.includes('--hook')) {
    // SessionStart 동기 훅: 새 세션의 Claude에게 지금 상태를 알려 준다
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `[ai-framework] ${info.text}. 사람이 다른 일을 요청하지 않았다면 첫 답에서 이 상태와 다음 명령을 한 줄로 알려 준다.` } }));
    return;
  }
  console.log(info.text);
}

// ───────────────────────── 문서화: close (작업 기록·장부), stats (일·주·월), improve (개선 목록), manual ─────────────────────────
// 모든 작업은 docs/aif/ 아래 문서로 남는다. 원시 기록(.aif/tasks/*/events.jsonl, .aif/sessions/)은 대화 내용이 있어 커밋하지 않고,
// 사람이 읽고 비교할 수치·기준·리뷰는 문서로 커밋한다.

const DOCS = (...a) => P('docs/aif', ...a);
const fmtTs = (ts) => (ts ? ts.replace('T', ' ').slice(0, 16) : '-');
const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'));
const durText = (min) => { if (min === null || min === undefined) return '-'; const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.round(min % 60); return (d ? `${d}일 ` : '') + (h ? `${h}시간 ` : '') + `${m}분`; };
const VERDICT_KO = { rules: '규칙', efficiency: '효율', quality: '완성도' };

function goalDocOf(id, a) {
  const card = path.join('.aif/tasks', id, 'card.md');
  if (exists(P(card))) return card;
  const g = a && a.route === 'standard' ? goalDocPath('standard', config()) : null;
  return g && exists(P(g)) ? g : null;
}
function strengthOf(goal) {
  const m = readText(goal ? P(goal) : '').match(/검증 강도:\s*(가볍게|보통|엄격)(?!\s*\/)/);
  return m ? m[1] : null;
}
function titleOf(goal, id) {
  const t = readText(goal ? P(goal) : '');
  const m = t.match(/^#\s+(.+)$/m) || t.match(/^(?:목표|질문):\s*(.+)$/m);
  return m ? m[1].replace(/^(Spec|작업 카드|질문 정의)\s*[:：]\s*/i, '').trim() : id;
}

function taskRecord(id) {
  const a = cmdAnalyze([id], { quiet: true });
  const evs = readEvents(id);
  const bg = backgroundSessions(evs);
  const start = evs.find((e) => e.type === 'task.start');
  const end = [...evs].reverse().find((e) => e.type === 'task.end');
  const goal = goalDocOf(id, a);
  const e = a.efficiency, q = a.quality;
  const judg = readJson(path.join(taskDir(id), 'ai-judgments.json'), null);
  return {
    id, title: titleOf(goal, id), purpose: a.purpose, variant: a.variant, size: a.size, strength: strengthOf(goal), goal,
    start: start ? start.ts : evs[0].ts, end: end ? end.ts : null, status: end ? '완료' : `진행 중 (${(current() || {}).task === id ? (current() || {}).phase : '-'})`,
    active_min: e.active_minutes, wall_min: end ? Math.round((ms(end.ts) - ms((start || evs[0]).ts)) / 6e4) : null,
    ai_min: e.ai_minutes, wait_min: e.wait_minutes,
    budget_min: (e.budget || {}).minutes || null, budget_ratio: (e.budget_ratio || {}).minutes ?? null,
    tokens_in: e.tokens.input, tokens_out: e.tokens.output, cache_write: e.tokens.cache_write, cache_read: e.tokens.cache_read,
    tokens_total: e.tokens_total, budget_tokens: (e.budget || {}).tokens || null, bg_tokens: (e.background || {}).tokens || 0,
    human_prompts: e.human_prompts, corrections: e.corrections, intervention_rate: e.intervention_rate,
    decisions_after_approval: e.decisions_after_approval,
    verify_rounds: e.verify_attempts, verify_fails: e.verify_fail_rounds, final_verify: q.verify_result,
    criteria: q.criteria, false_done: q.false_done, commits: evs.filter((x) => x.type === 'commit' && !bg.has(x.session_id)).length,
    verdict_rules: a.verdict.rules, verdict_eff: a.verdict.efficiency, verdict_quality: a.verdict.quality, fw: a.fw,
    _a: a, _evs: evs, _judg: judg,
  };
}

function taskDocData(r) {
  const a = r._a, e = a.efficiency, evs = r._evs;
  const L = [];
  L.push(`| 항목 | 값 |`, `|---|---|`);
  L.push(`| 제목 | ${r.title} |`);
  L.push(`| 목적 · 변형 | ${r.purpose || '-'} · ${r.variant || '-'} |`);
  L.push(`| 규모 · 검증 강도 | ${r.size || '-'} · ${r.strength || '정하지 않음'} |`);
  L.push(`| 목표 문서 | ${r.goal ? '`' + r.goal + '`' : '-'} |`);
  L.push(`| 시작 · 완료 | ${fmtTs(r.start)} · ${r.end ? fmtTs(r.end) : r.status} |`);
  L.push(`| 걸린 기간 (시작~완료) | ${r.wall_min === null ? '-' : durText(r.wall_min)} |`);
  L.push(`| 실작업 (5분 넘는 빈 시간 제외) | ${durText(r.active_min)}${r.budget_min ? ` — 기대 ${r.budget_min}분의 ${r.budget_ratio}배` : ''} |`);
  L.push(`| AI 작업 · 사람 대기 | ${durText(r.ai_min)} · ${durText(r.wait_min)} |`);
  L.push(`| 토큰 (캐시 읽기 제외) | ${num(r.tokens_total)}${r.budget_tokens ? ` — 기대 ${num(r.budget_tokens)}의 ${(e.budget_ratio || {}).tokens}배` : ''} |`);
  L.push(`| 토큰 내역 | 입력 ${num(r.tokens_in)} · 출력 ${num(r.tokens_out)} · 캐시 쓰기 ${num(r.cache_write)} · 캐시 읽기 ${num(r.cache_read)} |`);
  if (r.bg_tokens) L.push(`| 백그라운드 세션 토큰 | ${num(r.bg_tokens)} (플러그인 등, 위 합계와 별도) |`);
  L.push(`| 사람 메시지 · 수정 요청 · 개입률 | ${r.human_prompts} · ${r.corrections ?? '판정 전'} · ${r.intervention_rate === null ? '판정 전' : Math.round(r.intervention_rate * 100) + '%'} |`);
  L.push(`| 승인 뒤 재결정 | ${r.decisions_after_approval} |`);
  L.push(`| 완료 기준 · 최종 검증 | ${r.criteria}개 · ${r.final_verify || '없음'} |`);
  L.push(`| 검증 회차 (FAIL) | ${r.verify_rounds} (${r.verify_fails}) |`);
  L.push(`| 커밋 | ${r.commits} |`);
  L.push(`| 판정 | 규칙 ${r.verdict_rules} · 효율 ${r.verdict_eff} · 완성도 ${r.verdict_quality} |`);
  L.push('', '### 단계별 시간', '| 단계 | 실작업 | 들어간 횟수 | 처음 시작 |', '|---|---|---|---|');
  for (const p of e.phases) L.push(`| ${p.phase} | ${durText(p.minutes)} | ${p.entries} | ${fmtTs(p.start)} |`);
  L.push('', '### 게이트', '| 시각 | 단계 | 결과 | 근거 |', '|---|---|---|---|');
  for (const g of evs.filter((x) => x.type === 'gate')) L.push(`| ${fmtTs(g.ts)} | ${g.data.phase} | ${g.data.result} | ${g.data.evidence ? '`' + g.data.evidence + '`' : '-'} |`);
  const asks = evs.filter((x) => x.type === 'tool' && x.data.tool === 'AskUserQuestion' && (x.data.questions || x.data.answers));
  if (asks.length) {
    L.push('', '### 사람 결정 (질문 창)');
    for (const x of asks) L.push(`- ${fmtTs(x.ts)} [${x.phase}] ${(x.data.questions || []).join(' / ')} → ${x.data.answers || '(답 기록 없음)'}`);
  }
  const viol = a.rules.filter((x) => x.status === 'violated');
  L.push('', '### 규칙 위반', ...(viol.length ? viol.map((x) => `- ${x.id}: ${x.text} — ${x.violations.map((v) => v.detail).join('; ')}`) : ['- 없음']));
  const causes = ((r._judg && r._judg.items) || []).filter((x) => x.kind === 'cause');
  L.push('', '### 원인 (AI 판정)', ...(causes.length ? causes.map((x) => `- [${CAUSE_KO[x.label] || x.label}] ${x.suggestion || ''}`) : [r._judg ? '- 원인 후보 없음' : (r.size === 'L' || [r.verdict_rules, r.verdict_eff, r.verdict_quality].some((v) => v !== '정상') ? '- 판정 전 (/aif-report가 판정한다)' : '- 판정 안 함 (S·M이고 세 판정이 모두 정상)')]));
  return L.join('\n');
}

function writeTaskDoc(r) {
  const f = DOCS('tasks', `${r.id}.md`);
  const data = `<!-- aif:data:start — aif close가 다시 쓴다. 손으로 고치지 않는다 -->\n${taskDocData(r)}\n<!-- aif:data:end -->`;
  let doc = readText(f);
  if (doc && doc.includes('<!-- aif:data:start')) doc = doc.replace(/<!-- aif:data:start[\s\S]*?<!-- aif:data:end -->/, data);
  else doc = `# 작업 기록: ${r.title}\n\n작업 ID \`${r.id}\` · 프레임워크 ${r.fw || '-'}\n\n## 기록\n${data}\n\n## 리뷰\n<!-- aif:review:start -->\n(대기 — /aif-report가 채운다)\n<!-- aif:review:end -->\n`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, doc);
  return f;
}

const LEDGER_COLS = ['id', 'title', 'purpose', 'variant', 'size', 'strength', 'start', 'end', 'status', 'active_min', 'wall_min', 'budget_min', 'budget_ratio', 'tokens_total', 'tokens_in', 'tokens_out', 'cache_write', 'cache_read', 'bg_tokens', 'human_prompts', 'corrections', 'decisions_after_approval', 'verify_rounds', 'verify_fails', 'criteria', 'commits', 'verdict_rules', 'verdict_eff', 'verdict_quality', 'fw'];
const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return head ? body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] === '' ? null : r[k]]))) : [];
}
function readLedger() { return parseCsv(readText(DOCS('ledger.csv'))); }
function writeLedger(rows) {
  rows.sort((x, y) => String(x.start).localeCompare(String(y.start)));
  fs.mkdirSync(DOCS(), { recursive: true });
  fs.writeFileSync(DOCS('ledger.csv'), [LEDGER_COLS.join(','), ...rows.map((r) => LEDGER_COLS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
}

function cmdClose(args, { quiet = false } = {}) {
  const all = args.includes('--all');
  const ids = all
    ? (exists(P('.aif/tasks')) ? fs.readdirSync(P('.aif/tasks')).filter((x) => x !== '_none' && readEvents(x).some((e) => e.type === 'task.start')) : [])
    : [args.find((x) => !x.startsWith('--')) || (current() || {}).task].filter(Boolean);
  if (!ids.length) throw new Error('기록할 작업이 없습니다.');
  const ledger = readLedger();
  for (const id of ids) {
    const r = taskRecord(id);
    const f = writeTaskDoc(r);
    const row = Object.fromEntries(LEDGER_COLS.map((c) => [c, r[c]]));
    const k = ledger.findIndex((x) => x.id === id);
    if (k >= 0) ledger[k] = row; else ledger.push(row);
    try { cmdReport([id], { quiet: true }); } catch (e) { logError('close-report', e); }
    if (!quiet) console.log(`기록: ${rel(f)} (실작업 ${durText(r.active_min)}, 토큰 ${num(r.tokens_total)}, 판정 규칙 ${r.verdict_rules}·효율 ${r.verdict_eff}·완성도 ${r.verdict_quality})`);
  }
  writeLedger(ledger);
  cmdStats([], { quiet: true });
  cmdManual([], { quiet: true });
  if (!quiet) console.log(`장부: ${rel(DOCS('ledger.csv'))} · 통계: ${rel(DOCS('stats.md'))} · 화면: ${rel(DOCS('dashboard.html'))}`);
}

// 일·주·월 집계: 실작업 시간은 모든 작업의 이벤트에서, 토큰은 모든 세션 기록(작업 밖 세션 포함)에서
function dayKey(t) { const d = new Date(t); const off = -d.getTimezoneOffset(); const l = new Date(d.getTime() + off * 6e4); return l.toISOString().slice(0, 10); }
function weekKey(day) { const d = new Date(day + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
function collectDaily() {
  const days = {};
  const get = (k) => (days[k] = days[k] || { active_min: 0, tokens: 0, cache_read: 0, sessions: new Set(), tasks_done: 0, prompts: 0 });
  const tdir = P('.aif/tasks');
  for (const id of exists(tdir) ? fs.readdirSync(tdir) : []) {
    const evs = readEvents(id); const bg = backgroundSessions(evs);
    let prev = null;
    for (const e of evs) {
      if (bg.has(e.session_id)) continue;
      const t = ms(e.ts);
      if (prev !== null && t - prev <= 5 * 6e4) get(dayKey(t)).active_min += (t - prev) / 6e4;
      prev = t;
      if (e.type === 'prompt' && !/^\s*<task-notification>/.test(e.data.text || '') && !/^Below is a conversation/.test(e.data.text || '')) get(dayKey(t)).prompts++;
      if (e.type === 'task.end') get(dayKey(t)).tasks_done++;
    }
  }
  const sdir = P('.aif/sessions');
  for (const f of exists(sdir) ? fs.readdirSync(sdir).filter((x) => x !== 'index.json') : []) {
    const s = readJson(path.join(sdir, f), null);
    if (!s || !s.per_message) continue;
    for (const m of s.per_message) {
      if (!m.ts) continue;
      const d = get(dayKey(ms(m.ts)));
      d.tokens += (m.input || 0) + (m.output || 0) + (m.cache_write || 0); d.cache_read += m.cache_read || 0; d.sessions.add(s.session_id);
    }
  }
  return days;
}
function rollup(days, keyFn) {
  const out = {};
  for (const [d, v] of Object.entries(days)) {
    const k = keyFn(d); const o = (out[k] = out[k] || { active_min: 0, tokens: 0, cache_read: 0, sessions: new Set(), tasks_done: 0, prompts: 0 });
    o.active_min += v.active_min; o.tokens += v.tokens; o.cache_read += v.cache_read; o.tasks_done += v.tasks_done; o.prompts += v.prompts; v.sessions.forEach((x) => o.sessions.add(x));
  }
  return Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, ...v, sessions: v.sessions.size, active_min: Math.round(v.active_min) }));
}

function cmdStats(args, { quiet = false } = {}) {
  const days = collectDaily();
  const daily = rollup(days, (d) => d).slice(-31);
  const weekly = rollup(days, weekKey).slice(-12);
  const monthly = rollup(days, (d) => d.slice(0, 7));
  const ledger = readLedger();
  const table = (rows, label) => [`| ${label} | 실작업 | 토큰 (캐시 읽기 제외) | 캐시 읽기 | 세션 | 사람 메시지 | 끝낸 작업 |`, '|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.key} | ${durText(r.active_min)} | ${num(r.tokens)} | ${num(r.cache_read)} | ${r.sessions} | ${r.prompts} | ${r.tasks_done} |`)].join('\n');
  const bySize = {};
  for (const r of ledger.filter((x) => x.end)) { const s = r.size || '-'; (bySize[s] = bySize[s] || []).push(r); }
  const med = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined && x !== '').map(Number).filter((x) => !isNaN(x)).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  const sizeRows = Object.entries(bySize).map(([s, rs]) => `| ${s} | ${rs.length} | ${durText(med(rs.map((r) => r.active_min)))} | ${med(rs.map((r) => r.budget_ratio)) ?? '-'} | ${num(med(rs.map((r) => r.tokens_total)))} | ${med(rs.map((r) => r.verify_fails)) ?? '-'} | ${med(rs.map((r) => r.human_prompts)) ?? '-'} |`);
  const md = `# 사용 통계\n\n자동 생성 (${isoNow().slice(0, 16).replace('T', ' ')}). \`aif close\`·\`aif stats\`가 다시 쓴다.\n\n- 실작업: 이벤트 사이 간격 중 5분 이하만 더한 시간 (자리 비움 제외). 작업 밖 세션은 포함되지 않는다.\n- 토큰: 세션 기록 전체(작업 밖 세션 포함). 같은 요청은 마지막 줄 값.\n\n## 규모별 (끝낸 작업, 중앙값)\n| 규모 | 작업 수 | 실작업 | 기대 대비 | 토큰 | 검증 FAIL | 사람 메시지 |\n|---|---|---|---|---|---|---|\n${sizeRows.join('\n') || '| - | 0 | - | - | - | - | - |'}\n\n## 월별\n${table(monthly, '월')}\n\n## 주별 (월요일 시작, 최근 12주)\n${table(weekly, '주 시작일')}\n\n## 일별 (최근 31일)\n${table(daily, '날짜')}\n\n## 작업 목록\n| 작업 | 규모 | 시작 | 완료 | 실작업 | 기대 대비 | 토큰 | 검증(FAIL) | 판정 (규칙·효율·완성도) |\n|---|---|---|---|---|---|---|---|---|\n${ledger.map((r) => `| [${r.title || r.id}](tasks/${r.id}.md) | ${r.size || '-'} | ${fmtTs(r.start)} | ${r.end ? fmtTs(r.end) : r.status} | ${durText(Number(r.active_min))} | ${r.budget_ratio ?? '-'} | ${num(r.tokens_total)} | ${r.verify_rounds}(${r.verify_fails}) | ${r.verdict_rules}·${r.verdict_eff}·${r.verdict_quality} |`).join('\n')}\n`;
  fs.mkdirSync(DOCS(), { recursive: true });
  fs.writeFileSync(DOCS('stats.md'), md);
  fs.writeFileSync(DOCS('dashboard.html'), dashboardHtml({ daily, weekly, monthly, ledger }));
  if (!quiet) console.log(`통계: ${rel(DOCS('stats.md'))}, 화면: ${rel(DOCS('dashboard.html'))}`);
}

function dashboardHtml({ daily, weekly, monthly, ledger }) {
  const bars = (rows, field, fmt) => { const max = Math.max(1, ...rows.map((r) => r[field])); return rows.map((r) => `<div class="row"><span class="k">${esc(r.key)}</span><span class="bar"><i style="width:${Math.max(1, r[field] / max * 100)}%"></i></span><span class="v">${esc(fmt(r[field]))}</span></div>`).join(''); };
  const imp = readJson(DOCS('improvements.json'), { items: [] }).items;
  const badge = (v) => `<span class="b ${v === '정상' ? 'ok' : v === '주의' ? 'warn' : 'bad'}">${esc(v || '-')}</span>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 작업 대시보드</title><style>
:root{--fg:#1f2328;--mut:#656d76;--bd:#d0d7de;--bg:#fff;--card:#f6f8fa;--ac:#0969da;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e}
@media(prefers-color-scheme:dark){:root{--fg:#e6edf3;--mut:#9198a1;--bd:#30363d;--bg:#0d1117;--card:#161b22;--ac:#4493f8;--ok:#3fb950;--warn:#d29922;--bad:#f85149}}
body{font:14px/1.55 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;color:var(--fg);background:var(--bg);max-width:1100px;margin:auto;padding:24px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:26px 0 8px}.mut{color:var(--mut);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}.card{border:1px solid var(--bd);border-radius:10px;padding:12px}
.row{display:grid;grid-template-columns:96px 1fr 92px;gap:8px;align-items:center;font-size:12px;margin:2px 0}.bar{background:var(--card);border-radius:4px;height:10px}.bar i{display:block;height:10px;background:var(--ac);border-radius:4px}.v{text-align:right;color:var(--mut)}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--bd);padding:6px;text-align:left}th{color:var(--mut);font-weight:500}
.b{padding:0 8px;border-radius:10px;border:1px solid;font-size:12px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}</style></head><body>
<h1>AI 작업 대시보드</h1><div class="mut">자동 생성 ${esc(isoNow().slice(0, 16).replace('T', ' '))} · 원본: docs/aif/ledger.csv, .aif/sessions</div>
<h2>작업</h2><table><tr><th>작업</th><th>규모</th><th>시작</th><th>완료</th><th>실작업</th><th>기대 대비</th><th>토큰</th><th>검증(FAIL)</th><th>규칙</th><th>효율</th><th>완성도</th></tr>
${ledger.map((r) => `<tr><td>${esc(r.title || r.id)}<div class="mut">${esc(r.id)}</div></td><td>${esc(r.size || '-')}</td><td>${esc(fmtTs(r.start))}</td><td>${esc(r.end ? fmtTs(r.end) : r.status)}</td><td>${esc(durText(Number(r.active_min)))}</td><td>${esc(r.budget_ratio ?? '-')}</td><td>${esc(num(r.tokens_total))}</td><td>${esc(r.verify_rounds)}(${esc(r.verify_fails)})</td><td>${badge(r.verdict_rules)}</td><td>${badge(r.verdict_eff)}</td><td>${badge(r.verdict_quality)}</td></tr>`).join('')}</table>
<div class="grid">
<div class="card"><h2>일별 실작업</h2>${bars(daily, 'active_min', durText)}</div>
<div class="card"><h2>일별 토큰 (캐시 읽기 제외)</h2>${bars(daily, 'tokens', num)}</div>
<div class="card"><h2>주별 · 월별</h2>${bars(weekly, 'active_min', durText)}<div class="mut" style="margin:8px 0 4px">월별 토큰</div>${bars(monthly, 'tokens', num)}</div></div>
<h2>개선 목록</h2>${imp.length ? `<table><tr><th>ID</th><th>범위</th><th>원인</th><th>내용</th><th>상태</th><th>작업</th></tr>${imp.map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.scope === 'framework' ? '프레임워크' : '프로젝트')}</td><td>${esc(CAUSE_KO[x.cause] || x.cause || '-')}</td><td>${esc(x.text)}</td><td>${esc(IMP_STATUS[x.status] || x.status)}</td><td class="mut">${esc(x.task || '-')}</td></tr>`).join('')}</table>` : '<p class="mut">없음</p>'}
</body></html>`;
}

// 개선 목록: 리뷰에서 나온 "바꿀 것". 프로젝트 범위는 여기서 반영하고, 프레임워크 범위는 inbox로 보내 여러 프로젝트에서 모아 본다
const IMP_STATUS = { proposed: '제안', approved: '승인', rejected: '기각', done: '반영' };
function improvementsDoc(items) {
  const sec = (st) => items.filter((x) => x.status === st);
  const rows = (xs) => xs.length ? ['| ID | 범위 | 원인 | 내용 | 작업 | 날짜 |', '|---|---|---|---|---|---|', ...xs.map((x) => `| ${x.id} | ${x.scope === 'framework' ? '프레임워크' : '프로젝트'} | ${CAUSE_KO[x.cause] || x.cause || '-'} | ${x.text.replace(/\|/g, '\\|')} | ${x.task || '-'} | ${(x.decided || x.created || '').slice(0, 10)} |`)].join('\n') : '- 없음';
  return `# 개선 목록\n\n실행 → 리뷰 → 개선. 리뷰(/aif-report)에서 나온 "다음에 바꿀 것"을 모은다. \`aif improve\`가 다시 쓴다.\n- 프로젝트 범위: 이 프로젝트의 설정·규칙·오버라이딩에 반영한다.\n- 프레임워크 범위: \`aif improve export\`로 ~/.aif/inbox에 보내고, 프레임워크 저장소에서 \`aif inbox\`로 여러 프로젝트의 것을 모아 본다.\n\n## 제안 (결정 대기)\n${rows(sec('proposed'))}\n\n## 승인 (반영 대기)\n${rows(sec('approved'))}\n\n## 반영\n${rows(sec('done'))}\n\n## 기각\n${rows(sec('rejected'))}\n`;
}
function cmdImprove(args) {
  const [sub, ...rest] = args;
  const flag = (n) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : null; };
  const store = readJson(DOCS('improvements.json'), { items: [] });
  const save = () => { writeJson(DOCS('improvements.json'), store); fs.writeFileSync(DOCS('improvements.md'), improvementsDoc(store.items)); };
  if (sub === 'add') {
    const text = flag('text'); if (!text) throw new Error('improve add --text "<바꿀 것>" --scope project|framework --cause <원인> [--task <ID>]');
    const scope = flag('scope') || 'project'; if (!['project', 'framework'].includes(scope)) throw new Error('scope는 project | framework');
    const dup = store.items.find((x) => x.text === text && x.status !== 'rejected');
    if (dup) { console.log(`이미 있음: ${dup.id}`); return; }
    const id = 'I-' + String(store.items.length + 1).padStart(3, '0');
    store.items.push({ id, created: isoNow(), task: flag('task') || (current() || {}).task || null, scope, cause: flag('cause') || null, text, status: 'proposed' });
    save(); console.log(id);
  } else if (sub === 'set') {
    const [id, st] = rest; if (!IMP_STATUS[st]) throw new Error('improve set <ID> proposed|approved|rejected|done [--note "..."]');
    const it = store.items.find((x) => x.id === id); if (!it) throw new Error('없는 ID: ' + id);
    it.status = st; it.decided = isoNow(); if (flag('note')) it.note = flag('note');
    save(); console.log(`${id} → ${IMP_STATUS[st]}`);
    if (it.scope === 'framework' && st === 'approved') exportImprovements();
  } else if (sub === 'export') { exportImprovements(); }
  else if (sub === 'list' || !sub) { save(); for (const x of store.items) console.log(`${x.id} [${IMP_STATUS[x.status]}] (${x.scope}) ${x.text}`); }
  else throw new Error('improve add|set|list|export');
}
function exportImprovements() {
  const store = readJson(DOCS('improvements.json'), { items: [] });
  const items = store.items.filter((x) => x.scope === 'framework' && x.status !== 'rejected');
  const dir = path.join(os.homedir(), '.aif', 'inbox');
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(ROOT);
  const ledger = readLedger();
  writeJson(path.join(dir, `${name}.json`), { project: name, root: ROOT, exported: isoNow(), fw: fwVersion(), items, tasks: ledger.map((r) => ({ id: r.id, size: r.size, active_min: r.active_min, budget_ratio: r.budget_ratio, tokens_total: r.tokens_total, verify_fails: r.verify_fails, verdicts: [r.verdict_rules, r.verdict_eff, r.verdict_quality] })) });
  console.log(`프레임워크 후보 ${items.length}개 → ~/.aif/inbox/${name}.json`);
}
// 프레임워크 저장소에서: 여러 프로젝트가 보낸 개선 후보와 작업 수치를 모아 본다
function cmdInbox() {
  const dir = path.join(os.homedir(), '.aif', 'inbox');
  const files = exists(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : [];
  if (!files.length) { console.log('inbox 비어 있음 (~/.aif/inbox). 프로젝트에서 aif improve export'); return; }
  const byCause = {};
  for (const f of files) {
    const d = readJson(path.join(dir, f), {});
    console.log(`\n## ${d.project} (fw ${d.fw}, 작업 ${(d.tasks || []).length}개, 내보냄 ${String(d.exported).slice(0, 16)})`);
    for (const x of d.items || []) { console.log(`- [${IMP_STATUS[x.status]}] ${CAUSE_KO[x.cause] || x.cause || '-'}: ${x.text} (${x.task})`); (byCause[x.cause || '-'] = byCause[x.cause || '-'] || new Set()).add(d.project); }
  }
  const thr = Number(config().promote_threshold || 2);
  const hot = Object.entries(byCause).filter(([, s]) => s.size >= thr);
  console.log(`\n여러 프로젝트에서 반복된 원인 (기준 ${thr}곳 이상): ${hot.length ? hot.map(([c, s]) => `${CAUSE_KO[c] || c}(${[...s].join(', ')})`).join(', ') : '없음'}`);
}

// 매뉴얼: 이 프로젝트에 지금 적용된 기준·절차·명령을 설정에서 만들어 문서로 둔다 (설정이 바뀌면 다시 만든다)
function cmdManual(args, { quiet = false } = {}) {
  const cfg = config();
  const rules = loadRules();
  const b = (s) => { const x = budgetOf(s, cfg); return x.minutes ? `${x.minutes}분 · ${num(x.tokens)} 토큰` : '기획에서 정함'; };
  const md = `# AI 작업 매뉴얼 (이 프로젝트)\n\n자동 생성: 프레임워크 ${fwVersion()} · 목적 ${cfg.purpose} · 변형 ${cfg.variant} · ${isoNow().slice(0, 10)}. 설정(\`.aif/config.yaml\`)과 규칙에서 만든다. 손으로 고치지 않는다.\n\n## 흐름\n\`\`\`\n/aif-plan <요청>  →  규모·검증 강도 제안, 목표 정의, 사람 승인\n   S·M: 수행 → 검증 자동 (FAIL이면 정해진 횟수까지 고치고 재검증)\n   L:   새 세션에서 /aif-work → 새 세션에서 /aif-verify\n/aif-deliver      →  사람 승인 뒤 전달, 작업 닫기, 기록 문서 생성\n/aif-report       →  리뷰(전달 뒤 자동으로 이어짐), 개선 목록, 승인한 것 반영\n\`\`\`\n\n## 규모\n| 규모 | 언제 | 기대 (실작업·토큰) | 목표 정의 | 검증 |\n|---|---|---|---|---|\n| 탐색 | 원하는 것을 아직 모름 | 사람이 정함 | 상한·끝 조건 | 없음 |\n| S | 한두 문장, 되돌리기 어려운 결정 없음 | ${b('S')} | 카드 3줄, 질문 0~1 | 확인 명령 출력 |\n| M | 기능·화면·보고서 하나 | ${b('M')} | 짧은 목표 문서, 질문 3개까지 | 확인 명령 + 검증자 1명 |\n| L | 여러 모듈·구조 결정 여러 개 | ${b('L')} | 전체 목표 문서 + 인터뷰 | 검증자 전부 + 테스트 품질 |\n\n- 기대를 1.5배 넘으면 멈추고 묻는다 (규모 올리기 / 범위 줄이기 / 계속). 기대는 완료 기준이 아니다.\n- 검증 강도: 가볍게(나만 씀·로컬·되돌리기 쉬움) / 보통 / 엄격(운영·결제·보안). 엄격이면 /code-review와 사람 확인을 더한다.\n\n## 확인 명령\n${Object.entries(cfg.commands || {}).map(([k, v]) => `- ${k}: ${v ? '`' + v + '`' : '(비어 있음 → 그 확인은 "확인 수단 없음")'}`).join('\n')}\n\n## 지키는 규칙 (자동 검사)\n| ID | 내용 | 적용 |\n|---|---|---|\n${rules.filter((r) => !r.applies || !r.applies.purpose || r.applies.purpose.includes(cfg.purpose)).map((r) => `| ${r.id} | ${r.text} | ${r.applies ? Object.entries(r.applies).filter(([k]) => k !== 'purpose').map(([k, v]) => `${k}: ${[].concat(v).join(',')}`).join(' · ') || '전부' : '전부'} |`).join('\n')}\n${(cfg.checks_off || []).length ? `\n끈 규칙: ${cfg.checks_off.join(', ')}\n` : ''}\n## 문서가 남는 곳\n| 무엇 | 어디 | 누가 쓰나 |\n|---|---|---|\n| 작업별 기록·리뷰 | \`docs/aif/tasks/<ID>.md\` | 기록: \`aif close\` (전달 때 자동) · 리뷰: /aif-report |\n| 작업 장부 (모든 수치) | \`docs/aif/ledger.csv\` | \`aif close\` |\n| 일·주·월 통계 | \`docs/aif/stats.md\`, 화면 \`docs/aif/dashboard.html\` | \`aif close\`, \`aif stats\` |\n| 개선 목록 | \`docs/aif/improvements.md\` | \`aif improve\` (리뷰에서) |\n| 이 매뉴얼 | \`docs/aif/MANUAL.md\` | \`aif manual\` |\n| 목표 문서 | 카드 \`.aif/tasks/<ID>/card.md\` (S) · \`docs/spec.md\`·\`docs/question.md\` (M·L) | /aif-plan |\n| 결정 기록 | \`docs/adr/\` | 수행 중 |\n| 원시 기록 (커밋 안 함) | \`.aif/tasks/<ID>/events.jsonl\`, \`.aif/sessions/\` | 훅 |\n`;
  fs.mkdirSync(DOCS(), { recursive: true });
  fs.writeFileSync(DOCS('MANUAL.md'), md);
  if (!quiet) console.log(`매뉴얼: ${rel(DOCS('MANUAL.md'))}`);
}

// ───────────────────────── baseline ─────────────────────────

function cmdBaseline() {
  const out = { created: isoNow(), git: null, sessions: null };
  const log = git(['log', '--format=%ct%x1f%s']);
  if (log) {
    const rows = log.split('\n').filter(Boolean).map((l) => { const [t, s] = l.split('\x1f'); return { t: Number(t), s }; });
    const fix = rows.filter((r) => /^(fix|revert|hotfix)\b/i.test(r.s) || /^Revert "/.test(r.s)).length;
    const gaps = rows.slice(0, -1).map((r, k) => (r.t - rows[k + 1].t) / 3600);
    out.git = { period: { from: rows.length ? new Date(rows[rows.length - 1].t * 1000).toISOString() : null, to: rows.length ? new Date(rows[0].t * 1000).toISOString() : null }, commits: rows.length, fix_revert_ratio: rows.length ? Math.round(fix / rows.length * 100) / 100 : null, median_hours_between_commits: median(gaps) };
  }
  const enc = ROOT.replace(/[\\/:.]/g, '-');
  const sdir = path.join(os.homedir(), '.claude', 'projects', enc);
  if (exists(sdir)) {
    let human = 0, tokens = 0, first = null, last = null, n = 0;
    for (const f of fs.readdirSync(sdir).filter((x) => x.endsWith('.jsonl'))) {
      n++;
      const seen = new Map(); // 같은 요청은 마지막 줄 값
      for (const l of readText(path.join(sdir, f)).split('\n').filter(Boolean)) {
        let o; try { o = JSON.parse(l); } catch { continue; }
        if (o.timestamp) { first = !first || o.timestamp < first ? o.timestamp : first; last = !last || o.timestamp > last ? o.timestamp : last; }
        if (o.type === 'user' && typeof (o.message || {}).content === 'string') human++;
        if (o.type === 'assistant' && o.message && o.message.usage) { const k = o.requestId || o.message.id || Math.random(); const u = o.message.usage; seen.set(k, (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)); }
      }
      for (const v of seen.values()) tokens += v;
    }
    out.sessions = { period: { from: first, to: last }, sessions: n, human_messages: human, tokens, note: '세션 기록은 cleanupPeriodDays(기본 30일)보다 오래된 것이 지워졌을 수 있다' };
  }
  writeJson(P('.aif/baseline.json'), out);
  console.log(JSON.stringify(out, null, 2));
}

// ───────────────────────── doctor ─────────────────────────

function cmdDoctor() {
  const rows = [];
  const ok = (name, pass, note = '') => rows.push({ name, st: pass === true ? 'OK' : pass === 'warn' ? '주의' : '실패', note });
  const [maj] = process.versions.node.split('.').map(Number);
  ok('Node 18 이상', maj >= 18, process.versions.node);
  let cfg = null;
  try { cfg = config(); ok('.aif/config.yaml 읽기', exists(P('.aif/config.yaml'))); } catch (e) { ok('.aif/config.yaml 읽기', false, String(e)); }
  if (cfg) {
    ok('purpose', ['develop', 'analyze'].includes(cfg.purpose), String(cfg.purpose));
    const vs = { develop: ['web', 'app', 'game', 'api'], analyze: ['research', 'data'] }[cfg.purpose] || [];
    ok('variant', vs.includes(cfg.variant), String(cfg.variant));
    const empty = Object.entries(cfg.commands).filter(([, v]) => !v).map(([k]) => k);
    ok('확인 명령(commands)', empty.length ? 'warn' : true, empty.length ? `비어 있음: ${empty.join(', ')} → 해당 확인은 "확인 수단 없음"` : '');
  }
  for (const s of ['plan', 'work', 'verify', 'deliver', 'report']) {
    ok(`스킬 aif-${s}`, exists(P(`.claude/skills/aif-${s}/SKILL.md`)) && exists(P(`.claude/skills/aif-${s}/starter.md`)));
    ok(`오버라이딩 파일 ${s}.md`, exists(P(`.aif/overrides/${s}.md`)));
  }
  for (const f of ['.aif/framework/variant.md', '.aif/framework/starter/CLAUDE.md', '.aif/framework/rules.yaml', '.aif/framework/causes.md', '.aif/plan-questions.md', '.aif/framework/bin/aif.mjs'])
    ok(f, exists(P(f)));
  const st = readJson(P('.claude/settings.json'), null);
  ok('.claude/settings.json 읽기', !!st);
  if (st) {
    const refs = JSON.stringify(st.hooks || {}).match(/\.aif\/framework\/bin\/aif\.mjs/g) || [];
    ok('훅이 aif.mjs를 가리킴', refs.length > 0 && exists(P('.aif/framework/bin/aif.mjs')), `${refs.length}곳`);
  }
  const cm = readText(P('CLAUDE.md'));
  ok('CLAUDE.md 200줄 미만', cm ? cm.split('\n').length < 200 : false, cm ? `${cm.split('\n').length}줄` : '없음');
  ok('CLAUDE.md가 스타터 지시를 가져옴', /@\.aif\/framework\/starter\/CLAUDE\.md/.test(cm));
  const top = git(['rev-parse', '--show-toplevel']);
  const own = !!top && fs.realpathSync(top) === fs.realpathSync(ROOT);
  ok('git 저장소 (이 폴더가 루트)', own, top ? (own ? '' : `상위 저장소 ${top}를 쓰고 있음 → 이 폴더에서 git init`) : '저장소 없음 → git init');
  if (own) ok('git 훅 연결 (core.hooksPath)', git(['config', 'core.hooksPath']) === '.aif/framework/githooks' ? true : 'warn', git(['config', 'core.hooksPath']) || '설정 안 됨');
  // Claude Code 훅이 실제로 기록했는지: 작업이 있는데 세션 ID가 붙은 이벤트가 하나도 없으면 훅이 안 돈 것이다
  const tdirs = exists(P('.aif/tasks')) ? fs.readdirSync(P('.aif/tasks')).filter((x) => x !== '_none') : [];
  const evs = tdirs.flatMap((x) => readEvents(x));
  if (evs.length) {
    const fromHooks = evs.filter((e) => e.session_id).length;
    ok('Claude Code 훅 기록', fromHooks > 0 ? true : false, fromHooks ? `훅 이벤트 ${fromHooks}개` : '작업 기록은 있지만 훅이 보낸 이벤트가 0개 → 훅이 실행되지 않음. claude --debug-file <파일> 로 시작해 "Hooks not running"·설정 오류를 확인');
  }
  const gi = readText(P('.gitignore'));
  ok('.gitignore', ['.aif/sessions/', '.aif/tasks/*/events.jsonl'].every((x) => gi.includes(x)) ? true : 'warn');
  // 고정 항목을 바꾸려는 오버라이딩
  const FIXED = /(검증\s*(을|은)?\s*(생략|건너)|승인\s*(을|은)?\s*(생략|없이)|skip\s+(verify|approval)|기록\s*(을|은)?\s*(끄|생략))/i;
  for (const s of ['plan', 'work', 'verify', 'deliver', 'report']) {
    const t = readText(P(`.aif/overrides/${s}.md`)).replace(/<!--[\s\S]*?-->/g, '');
    if (FIXED.test(t)) ok(`오버라이딩 ${s}.md`, 'warn', '고정 항목(검증·승인·기록)을 바꾸려는 문장이 있음 → 적용되지 않고 보고에 표시됨');
  }
  // Claude Code 버전: 막는 훅의 onFailure는 2.1.295 이상 [확인 공식 Hooks]
  const sess = exists(P('.aif/sessions')) ? fs.readdirSync(P('.aif/sessions')).filter((x) => x !== 'index.json').map((x) => readJson(P('.aif/sessions', x), {})).filter((x) => x.cc_version).sort((a, b) => String(a.harvested_at).localeCompare(String(b.harvested_at))) : [];
  if (sess.length) {
    const v = sess[sess.length - 1].cc_version;
    const n = v.split('.').map(Number);
    const atLeast = (a) => { for (let k = 0; k < 3; k++) { if ((n[k] || 0) !== a[k]) return (n[k] || 0) > a[k]; } return true; };
    ok('Claude Code 버전', atLeast([2, 1, 295]) ? true : 'warn', atLeast([2, 1, 295]) ? v : `${v}: 2.1.295 미만이라 막는 훅이 실패할 때 막지 않고 넘어간다(onFailure 무시). claude update 권장`);
  }
  // 하네스 점검: 여러 작업에서 한 번도 활성화되지 않은 규칙
  const tdir = P('.aif/tasks');
  const ids = exists(tdir) ? fs.readdirSync(tdir).filter((x) => x !== '_none' && exists(path.join(tdir, x, 'analysis.json'))) : [];
  if (ids.length >= 5) {
    const tot = {};
    for (const x of ids) for (const [k, v] of Object.entries(readJson(path.join(tdir, x, 'analysis.json'), {}).activations || {})) tot[k] = (tot[k] || 0) + v;
    const never = Object.entries(tot).filter(([, v]) => v === 0).map(([k]) => k);
    ok(`하네스 점검 (작업 ${ids.length}개)`, never.length ? 'warn' : true, never.length ? `한 번도 해당되지 않은 규칙: ${never.join(', ')}` : '');
  }
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`${r.st.padEnd(3)}  ${r.name.padEnd(w)}  ${r.note}`);
  const fails = rows.filter((r) => r.st === '실패').length;
  console.log(`\n실패 ${fails} · 주의 ${rows.filter((r) => r.st === '주의').length} · 통과 ${rows.filter((r) => r.st === 'OK').length}`);
  process.exitCode = fails ? 1 : 0;
}

// ───────────────────────── new (프로젝트 생성) ─────────────────────────

function mergeSettings(base, frag) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of ['allow', 'ask', 'deny']) {
    const add = ((frag.permissions || {})[k]) || [];
    out.permissions = out.permissions || {};
    out.permissions[k] = [...new Set([...(out.permissions[k] || []), ...add])];
  }
  for (const [ev, groups] of Object.entries(frag.hooks || {})) {
    out.hooks = out.hooks || {};
    out.hooks[ev] = [...(out.hooks[ev] || []), ...groups];
  }
  return out;
}
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); }
  else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}

function cmdNew(args) {
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--purpose' && args[args.indexOf(a) - 1] !== '--variant' && args[args.indexOf(a) - 1] !== '--roles');
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const purpose = flag('purpose', 'develop');
  const variant = flag('variant', purpose === 'develop' ? 'web' : 'research');
  const roles = flag('roles', purpose === 'develop' ? 'dev' : '').split(',').filter(Boolean);
  const FW = path.resolve(path.dirname(SCRIPT), '..', '..');
  if (!exists(path.join(FW, 'core', 'lifecycle.md'))) throw new Error('aif new는 프레임워크 저장소의 core/bin/aif.mjs로 실행해야 합니다.');
  if (!dir) throw new Error('사용법: node core/bin/aif.mjs new <폴더> --purpose develop|analyze --variant <변형> [--roles dev,frontend]');
  const T = path.resolve(dir);
  const S = path.join(FW, 'starters', purpose);
  if (!exists(S)) throw new Error('없는 purpose: ' + purpose);
  if (!exists(path.join(S, 'variants', variant + '.md'))) throw new Error('없는 variant: ' + variant);
  fs.mkdirSync(T, { recursive: true });
  const t = (...a) => path.join(T, ...a);
  const f = (...a) => path.join(FW, ...a);
  const skip = (p) => exists(p);

  if (!skip(t('CLAUDE.md'))) copy(f('core/defaults/project/CLAUDE.md'), t('CLAUDE.md'));
  const settings = mergeSettings(JSON.parse(readText(f('core/defaults/project/settings.json'))), JSON.parse(readText(path.join(S, 'settings.json'))));
  if (!skip(t('.claude/settings.json'))) writeJson(t('.claude/settings.json'), settings);
  else {
    // 이미 있는 설정은 프로젝트 소유다. 프레임워크 훅(aif.mjs를 부르는 것) 중 빠진 것만 더한다
    const curS = readJson(t('.claude/settings.json'), null);
    if (curS) {
      let added = 0;
      for (const [ev, groups] of Object.entries(settings.hooks || {})) {
        for (const g of groups) for (const h of g.hooks || []) {
          if (!JSON.stringify(h).includes('aif.mjs')) continue;
          const sig = JSON.stringify(h.args || h.command);
          const has = ((curS.hooks || {})[ev] || []).some((cg) => (cg.hooks || []).some((ch) => JSON.stringify(ch.args || ch.command) === sig));
          if (has) continue;
          curS.hooks = curS.hooks || {};
          curS.hooks[ev] = curS.hooks[ev] || [];
          let target = curS.hooks[ev].find((cg) => (cg.matcher || null) === (g.matcher || null) && JSON.stringify(cg).includes('aif.mjs'));
          if (!target) { target = { ...(g.matcher ? { matcher: g.matcher } : {}), hooks: [] }; curS.hooks[ev].push(target); }
          target.hooks.push(h); added++;
        }
      }
      let perms = 0;
      for (const k of ['allow', 'deny']) {
        const want = ((settings.permissions || {})[k]) || [];
        curS.permissions = curS.permissions || {};
        const have = new Set(curS.permissions[k] || []);
        const add = want.filter((x) => !have.has(x));
        if (add.length) { curS.permissions[k] = [...(curS.permissions[k] || []), ...add]; perms += add.length; }
      }
      if (added || perms) { writeJson(t('.claude/settings.json'), curS); console.log(`  .claude/settings.json에 빠진 프레임워크 훅 ${added}개, 권한 ${perms}개를 더했습니다.`); }
    }
  }
  for (const s of ['plan', 'work', 'verify', 'deliver', 'report']) {
    copy(f(`core/skills/aif-${s}/SKILL.md`), t(`.claude/skills/aif-${s}/SKILL.md`));
    copy(path.join(S, 'skills', `${s}.md`), t(`.claude/skills/aif-${s}/starter.md`));
    if (!skip(t(`.aif/overrides/${s}.md`))) copy(f(`core/defaults/project/overrides/${s}.md`), t(`.aif/overrides/${s}.md`));
  }
  copy(f('core/defaults/agents/reviewer.md'), t('.claude/agents/reviewer.md'));
  if (purpose === 'develop') {
    const roleMap = { dev: 'dev', frontend: 'frontend', backend: 'backend', qa: 'tests', planner: null };
    for (const r of roles) if (roleMap[r] && exists(f(`starters/develop/roles/templates/rules/${roleMap[r]}.md`))) copy(f(`starters/develop/roles/templates/rules/${roleMap[r]}.md`), t(`.claude/rules/aif/${roleMap[r]}.md`));
  }
  let cfgText = readText(f('core/defaults/project/aif-config.yaml'))
    .replace(/^purpose:\s*\S+/m, `purpose: ${purpose}`)
    .replace(/^variant:\s*\S+/m, `variant: ${variant}`)
    .replace(/^roles:\s*\[[^\]]*\]/m, `roles: [${roles.join(', ')}]`);
  if (!skip(t('.aif/config.yaml'))) { fs.mkdirSync(t('.aif'), { recursive: true }); fs.writeFileSync(t('.aif/config.yaml'), cfgText); }
  const fwDir = t('.aif/framework');
  const oldVer = readText(path.join(fwDir, 'VERSION')).trim();
  const newVer = readText(f('VERSION')).trim();
  if (oldVer && oldVer !== newVer) console.log(`  프레임워크 업데이트: ${oldVer} → ${newVer}`);
  else if (oldVer) console.log(`  프레임워크 파일을 다시 썼습니다 (${newVer})`);
  fs.rmSync(fwDir, { recursive: true, force: true });
  copy(f('core/bin/aif.mjs'), path.join(fwDir, 'bin/aif.mjs'));
  copy(f('core/githooks'), path.join(fwDir, 'githooks'));
  for (const h of fs.readdirSync(path.join(fwDir, 'githooks'))) fs.chmodSync(path.join(fwDir, 'githooks', h), 0o755);
  copy(f('core/feedback/rules.yaml'), path.join(fwDir, 'rules.yaml'));
  copy(f('core/feedback/causes.md'), path.join(fwDir, 'causes.md'));
  copy(path.join(S, 'variants', variant + '.md'), path.join(fwDir, 'variant.md'));
  copy(path.join(S, 'CLAUDE.md'), path.join(fwDir, 'starter/CLAUDE.md'));
  copy(f('core/defaults/templates'), path.join(fwDir, 'templates'));
  copy(path.join(S, 'templates'), path.join(fwDir, 'templates'));
  fs.writeFileSync(path.join(fwDir, 'VERSION'), readText(f('VERSION')).trim() + '\n');
  if (!skip(t('.aif/plan-questions.md'))) fs.writeFileSync(t('.aif/plan-questions.md'), '# 쌓인 기획 질문\n\n지난 작업에서 기획 누락·결정 지연의 원인으로 나온 질문입니다. /aif-plan이 읽습니다. 필요 없는 줄은 지워도 됩니다.\n');
  for (const d of ['docs/adr', 'docs/verify', 'docs/aif/tasks']) { fs.mkdirSync(t(d), { recursive: true }); if (!fs.readdirSync(t(d)).length) fs.writeFileSync(t(d, '.gitkeep'), ''); }
  if (!skip(t('docs/progress.md'))) copy(path.join(fwDir, 'templates/progress.md'), t('docs/progress.md'));
  const gi = readText(t('.gitignore'));
  const need = ['.aif/sessions/', '.aif/tasks/*/events.jsonl', '.aif/tasks/*/ai-candidates.json', '.aif/log-errors.jsonl', '.aif/current.json', '.claude/settings.local.json'];
  const missing = need.filter((x) => !gi.includes(x));
  if (missing.length) fs.writeFileSync(t('.gitignore'), gi.replace(/\s*$/, gi ? '\n' : '') + '# ai-framework\n' + missing.join('\n') + '\n');
  // 이 프로젝트의 매뉴얼(지금 적용된 기준·절차)을 만든다
  try { execFileSync(process.execPath, [path.join(fwDir, 'bin/aif.mjs'), 'manual'], { cwd: T, env: { ...process.env, CLAUDE_PROJECT_DIR: T }, stdio: 'ignore' }); } catch { /* 매뉴얼 실패는 생성을 막지 않는다 */ }
  const g = (a) => { try { return execFileSync('git', a, { cwd: T, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  // 상위 폴더가 git 저장소여도 이 프로젝트는 자기 저장소를 가진다 (상위 저장소 설정을 건드리지 않기 위해)
  const top = g(['rev-parse', '--show-toplevel']);
  const own = top && fs.realpathSync(top) === fs.realpathSync(T);
  if (!own) { if (top) console.log(`  상위 저장소(${top}) 안이라 이 폴더에 별도 저장소를 만듭니다.`); g(['init', '-q']); }
  const okRepo = g(['rev-parse', '--show-toplevel']);
  const hp = okRepo && fs.realpathSync(okRepo) === fs.realpathSync(T) ? g(['config', '--local', 'core.hooksPath']) : 'skip';
  if (hp === 'skip') console.log('  주의: git 저장소를 만들지 못해 git 훅을 연결하지 않았습니다. git이 설치돼 있는지 확인하세요.');
  else if (!hp) g(['config', '--local', 'core.hooksPath', '.aif/framework/githooks']);
  console.log(`생성: ${T}`);
  console.log(`  목적 ${purpose} / 변형 ${variant}${roles.length ? ' / 역할 ' + roles.join(',') : ''}`);
  if (hp && hp !== 'skip' && hp !== '.aif/framework/githooks') console.log(`  주의: 이미 core.hooksPath=${hp} 가 있어 git 훅을 연결하지 않았습니다. 기존 훅에서 aif.mjs git <훅>을 부르세요.`);
  if (oldVer) console.log('  프레임워크 파일이 바뀌었습니다. 작업 변경과 섞이지 않게 먼저 따로 커밋하세요: git add .aif/framework .claude .gitignore && git commit -m "chore: ai-framework ' + newVer + '"');
  console.log('  다음: .aif/config.yaml의 commands·paths를 채우고 → node .aif/framework/bin/aif.mjs doctor → Claude Code에서 /aif-plan <요청>');
}

// ───────────────────────── main ─────────────────────────

const [, , cmd, ...args] = process.argv;
const QUIET_FAIL = new Set(['log', 'harvest']); // 기록은 실패해도 작업을 막지 않는다
try {
  switch (cmd) {
    case 'log': cmdLog(args[0]); break;
    case 'task': cmdTask(args); break;
    case 'harvest': cmdHarvest(args); break;
    case 'check': cmdCheck(); break;
    case 'guard-push': cmdGuardPush(); break;
    case 'git': cmdGit(args); break;
    case 'analyze': cmdAnalyze(args); break;
    case 'report': cmdReport(args); break;
    case 'merge-judgments': cmdMergeJudgments(args); break;
    case 'baseline': cmdBaseline(); break;
    case 'status': cmdStatus(args); break;
    case 'close': cmdClose(args); break;
    case 'stats': cmdStats(args); break;
    case 'improve': cmdImprove(args); break;
    case 'manual': cmdManual(args); break;
    case 'inbox': cmdInbox(); break;
    case 'doctor': cmdDoctor(); break;
    case 'new': cmdNew(args); break;
    case 'yaml': console.log(JSON.stringify(parseYaml(readText(args[0])), null, 2)); break;
    default:
      console.log('aif <log|task|harvest|check|guard-push|git|analyze|merge-judgments|report|status|close|stats|improve|manual|inbox|baseline|doctor|new>');
  }
} catch (e) {
  logError(cmd, e);
  if (QUIET_FAIL.has(cmd) || cmd === 'git') process.exit(0);
  if (cmd === 'check' || cmd === 'guard-push') process.exit(0); // 스크립트 오류로 작업을 막지 않음 (오류는 log-errors에)
  console.error('aif: ' + (e && e.message || e));
  process.exit(1);
}
