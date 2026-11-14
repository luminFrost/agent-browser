import { describe, it, expect } from 'vitest';
import { parseCliArgs, defaultProfileDir } from './cliArgs';

describe('실행 인자', () => {
  const env = { HOME: '/Users/me' };

  it('기본값: 프로필은 OS 관례 경로, 제어 포트는 빈 포트(0), 창은 보인다', () => {
    expect(parseCliArgs([], env)).toEqual({ profile: defaultProfileDir(env, 'darwin'), controlPort: 0, hidden: false, logBlocked: false });
    expect(defaultProfileDir(env, 'darwin')).toBe('/Users/me/Library/Application Support/agent-browser');
  });

  it('인자가 환경 변수보다, 환경 변수가 기본값보다 앞선다', () => {
    const withEnv = { ...env, AGENT_BROWSER_PROFILE: '/tmp/p', AGENT_BROWSER_CONTROL_PORT: '9333' };
    expect(parseCliArgs([], withEnv)).toMatchObject({ profile: '/tmp/p', controlPort: 9333 });
    expect(parseCliArgs(['--profile', '/x', '--control-port', '9444', '--hidden', '--log-blocked'], withEnv)).toEqual({ profile: '/x', controlPort: 9444, hidden: true, logBlocked: true });
  });

  it('잘못된 포트나 모르는 인자는 오류', () => {
    expect(() => parseCliArgs(['--control-port', 'abc'], env)).toThrow(/포트/);
    expect(() => parseCliArgs(['--control-port', '70000'], env)).toThrow(/포트/);
    expect(() => parseCliArgs(['--nope'], env)).toThrow(/모르는 인자/);
    expect(() => parseCliArgs(['--profile'], env)).toThrow(/값/);
  });
});
