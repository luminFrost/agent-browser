// 붙이기 명령의 판단(spec-claude-attach). 파일·HTTP·시계는 밖에서 받아 시험한다. 실제 연결은 cli.ts가 한다.
import { basename } from 'node:path';
import { cleanLabel } from '../shared/label';

/** 앱을 켠 뒤 제어 서버가 응답하기를 기다리는 최대 시간 */
export const APP_READY_WAIT_MS = 15_000;
/** 기다리는 동안 다시 보는 간격 */
export const READY_POLL_MS = 200;

export interface ControlInfo { port: number; token: string }

/** 세션 이름 환경 변수(카드 20261120-session-labels) */
export const LABEL_ENV = 'AGENT_BROWSER_LABEL';

/**
 * 세션 이름: AGENT_BROWSER_LABEL이 있으면 그것, 없으면 Claude Code가 MCP 서버에 넘겨주는 프로젝트 폴더(CLAUDE_PROJECT_DIR)의
 * 이름, 그것도 없으면 실행 폴더 이름. Claude Code 문서는 MCP 서버의 실행 폴더가 프로젝트 폴더라고 보장하지 않는다
 */
export function sessionLabel(env: Record<string, string | undefined>, cwd: string): string | undefined {
  const projectDir = env.CLAUDE_PROJECT_DIR;
  return cleanLabel(env[LABEL_ENV]) ?? (projectDir ? cleanLabel(basename(projectDir)) : undefined) ?? cleanLabel(basename(cwd));
}

/** 붙잡은 세션: 연결이 열려 있는 동안만 산다(끊기면 런처가 그 세션을 끝낸다) */
export interface HeldSession {
  id: string;
  browserUrl: string;
  /** 연결을 끊는다 → 런처가 세션을 닫는다 */
  close(): void;
  /** 런처 쪽에서 끊으면(사람이 패널에서 멈춤·앱 종료) 풀린다 */
  closed: Promise<void>;
}

export interface AttachDeps {
  /** 제어 파일(포트·토큰). 없거나 읽을 수 없으면 undefined */
  readControl(): ControlInfo | undefined;
  /** POST /sessions?hold=1. 제어 서버에 닿지 않으면 'unreachable' */
  openSession(control: ControlInfo): Promise<HeldSession | 'unreachable'>;
  /** 앱을 켠다(더블클릭과 같은 시작 프로세스) */
  startApp(): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}

async function tryOpen(deps: AttachDeps): Promise<HeldSession | undefined> {
  const control = deps.readControl();
  if (!control) return undefined;
  const r = await deps.openSession(control);
  return r === 'unreachable' ? undefined : r;
}

/** 켜진 앱에 붙는다. 꺼져 있으면(제어 파일이 없거나 남은 파일의 포트가 닫힘) 한 번 켜고 15초까지 기다린다 */
export async function connect(deps: AttachDeps): Promise<HeldSession> {
  const first = await tryOpen(deps);
  if (first) return first;
  deps.startApp();
  const until = deps.now() + APP_READY_WAIT_MS;
  while (deps.now() < until) {
    await deps.sleep(READY_POLL_MS);
    const s = await tryOpen(deps);
    if (s) return s;
  }
  throw new Error(`Agent Browser를 ${APP_READY_WAIT_MS / 1000}초 안에 켜지 못했다. 앱을 직접 열어 본 뒤 다시 시도해 주세요.`);
}

/**
 * 함께 넣은 chrome-devtools-mcp에 줄 인자.
 * 회사 밖으로 보내지 않는다(A7): Google 사용 통계와 CrUX(방문 URL 조회)를 끈다
 */
export const mcpArgs = (browserUrl: string): string[] =>
  ['--browserUrl', browserUrl, '--no-usage-statistics', '--no-performance-crux'];

/**
 * 이 브라우저를 쓰는 Claude가 알아야 할 것(spec-company-setup B5).
 * 붙이기 명령이 MCP initialize 응답의 instructions 앞에 붙인다. 사실만 적는다(앱 동작은 docs/spec.md·ADR-0005)
 */
export const AGENT_BROWSER_GUIDE = [
  'agent-browser: 이 MCP 서버는 사람이 쓰는 Agent Browser 앱 안의, 이 세션 전용 탭 묶음 하나에 붙어 있다. 이 탭들은 따로 창을 띄우지 않고 사람 창 안에 있다.',
  '- 보이는 탭은 이 세션 전용 탭뿐이다. 사람의 탭이나 다른 Claude 세션의 탭은 보이지 않고 다룰 수 없다.',
  '- 이 탭들은 사람의 회사 계정 로그인(쿠키)을 함께 쓴다. 사람이 오른쪽 패널에서 이 세션을 골라 지켜볼 수 있고, 여기서 한 행동은 실제 계정에서 일어난다.',
  '- 폼 제출(POST)과 다운로드는 사람이 사람 창에서 허용해야 진행된다. 그동안 도구가 기다리거나 시간이 걸릴 수 있다. 거부되면 다시 시도하지 말고 사람에게 알린다.',
  '- 이 허용 창은 보조 장치다. 페이지 이동으로 일어나는 POST만 묻고, 페이지 스크립트의 fetch·XHR·sendBeacon 요청은 묻지 않는다. 실제 계정에 영향을 주는 행동(보내기, 결제, 삭제, 설정 변경)인지는 스스로 판단하고, 확실하지 않으면 먼저 사람에게 묻는다.',
  '- 탭을 여러 개 쓸 수 있다. 여러 URL을 함께 다루거나 비교할 때는 한 탭에서 차례로 이동하지 말고 new_page로 URL마다 탭을 열고, select_page로 오가며, 다 쓴 탭은 close_page로 닫는다. 사람은 패널에서 이 탭들을 함께 본다.',
  '- 브라우저 전체에 닿는 도구는 막혀 있다: resize_page, 성능 트레이스, lighthouse, 힙 스냅샷, 화면 녹화. 화면 크기는 emulate로 바꾼다.',
  '- 도구가 연결 끊김 오류를 내면 사람이 패널에서 이 세션을 멈췄거나 앱이 꺼진 것이다. 사람에게 Claude Code에서 /mcp로 agent-browser를 다시 연결해 달라고 부탁한다.',
].join('\n');

/** 클라이언트가 보낸 줄이 initialize 요청이면 그 id */
export function initializeId(line: string): number | string | undefined {
  try {
    const m = JSON.parse(line) as { id?: number | string; method?: string };
    return m.method === 'initialize' ? m.id : undefined;
  } catch {
    return undefined;
  }
}

/** 서버가 보낸 줄이 initialize 응답이면 instructions 앞에 안내를 붙인다. 그 밖의 줄은 그대로 */
export function withGuide(line: string, initIds: ReadonlySet<number | string>): string {
  let m: { id?: number | string; result?: { instructions?: string } };
  try { m = JSON.parse(line) as typeof m; } catch { return line; }
  if (m.id === undefined || !initIds.has(m.id) || !m.result) return line;
  const original = m.result.instructions;
  m.result.instructions = original ? `${AGENT_BROWSER_GUIDE}\n\n${original}` : AGENT_BROWSER_GUIDE;
  return JSON.stringify(m);
}
