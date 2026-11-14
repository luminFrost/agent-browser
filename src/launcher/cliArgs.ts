import { join } from 'node:path';

export interface CliOptions {
  /** 브라우저 프로필(로그인 상태와 제어 파일이 있는 곳) */
  profile: string;
  /** 제어 서버 포트. 0은 빈 포트 */
  controlPort: number;
  /** 창을 띄우지 않는다(테스트용) */
  hidden: boolean;
  /** 막힌 에이전트 명령을 표준 오류로 남긴다 */
  logBlocked: boolean;
}

type Env = Record<string, string | undefined>;

const APP_DIR_NAME = 'agent-browser';
const MAX_PORT = 65_535;

/** OS 관례의 앱 데이터 경로. 이번 범위는 macOS(spec 제약)이고, 다른 OS는 XDG 관례를 따른다 */
export function defaultProfileDir(env: Env, platform: NodeJS.Platform = process.platform): string {
  const home = env.HOME ?? '';
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', APP_DIR_NAME);
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), APP_DIR_NAME);
}

const parsePort = (text: string): number => {
  const port = Number(text);
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) throw new Error(`포트가 올바르지 않다: ${text}`);
  return port;
};

/** 우선순위: 인자 > 환경 변수(AGENT_BROWSER_PROFILE, AGENT_BROWSER_CONTROL_PORT) > 기본값 */
export function parseCliArgs(argv: string[], env: Env): CliOptions {
  const options: CliOptions = {
    profile: env.AGENT_BROWSER_PROFILE ?? defaultProfileDir(env),
    controlPort: env.AGENT_BROWSER_CONTROL_PORT ? parsePort(env.AGENT_BROWSER_CONTROL_PORT) : 0,
    hidden: false,
    logBlocked: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg}에 값이 필요하다`);
      return v;
    };
    if (arg === '--profile') options.profile = value();
    else if (arg === '--control-port') options.controlPort = parsePort(value());
    else if (arg === '--hidden') options.hidden = true;
    else if (arg === '--log-blocked') options.logBlocked = true;
    else throw new Error(`모르는 인자: ${arg}`);
  }
  return options;
}
