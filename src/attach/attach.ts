// 붙이기 명령의 판단(spec-claude-attach). 파일·HTTP·시계는 밖에서 받아 시험한다. 실제 연결은 cli.ts가 한다.

/** 앱을 켠 뒤 제어 서버가 응답하기를 기다리는 최대 시간 */
export const APP_READY_WAIT_MS = 15_000;
/** 기다리는 동안 다시 보는 간격 */
export const READY_POLL_MS = 200;

export interface ControlInfo { port: number; token: string }

/** 붙잡은 세션: 연결이 열려 있는 동안만 산다(끊기면 런처가 그 창을 닫는다) */
export interface HeldSession {
  id: string;
  browserUrl: string;
  /** 연결을 끊는다 → 런처가 세션을 닫는다 */
  close(): void;
  /** 런처 쪽에서 끊으면(사람이 창을 닫음·앱 종료) 풀린다 */
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
