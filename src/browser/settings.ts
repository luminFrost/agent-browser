import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 사람이 바꾸는 앱 설정. 프로필 폴더의 settings.json에 남는다(앱을 다시 켜도 그대로) */
export interface Settings {
  /** 에이전트 따라 보기: 에이전트가 움직이면 그 세션을 왼쪽에 보인다(카드 20261120-follow-agents) */
  followAgents: boolean;
}

export const SETTINGS_FILE_NAME = 'settings.json';
export const DEFAULT_SETTINGS: Settings = { followAgents: true };

/** 없거나 읽을 수 없으면 기본값. 모르는 키·잘못된 값은 무시한다 */
export function readSettings(profileDir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(join(profileDir, SETTINGS_FILE_NAME), 'utf8')) as Partial<Settings>;
    return { followAgents: typeof raw.followAgents === 'boolean' ? raw.followAgents : DEFAULT_SETTINGS.followAgents };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 쓰기에 실패해도 앱은 계속 돈다(다음 실행 때 기본값) */
export function writeSettings(profileDir: string, settings: Settings): void {
  try {
    writeFileSync(join(profileDir, SETTINGS_FILE_NAME), JSON.stringify(settings, null, 2));
  } catch {
    // 프로필 폴더에 쓸 수 없으면 이번 실행 동안만 유지한다
  }
}
