import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 화면 모드(카드 20261123-theme-mode). Chrome과 같은 셋: system(기기, OS 설정을 따름) · light(밝게) · dark(어둡게).
 * 값은 Electron nativeTheme.themeSource에 그대로 넣는다
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const isThemeMode = (v: unknown): v is ThemeMode => typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v);

/** 사람이 바꾸는 앱 설정. 프로필 폴더의 settings.json에 남는다(앱을 다시 켜도 그대로) */
export interface Settings {
  /** 에이전트 따라 보기: 에이전트가 움직이면 그 세션을 왼쪽에 보인다(카드 20261120-follow-agents) */
  followAgents: boolean;
  /** 화면 모드. 기본은 기기(지금까지의 동작과 같다) */
  theme: ThemeMode;
  /**
   * 앱 안 업데이트 확인(카드 20261123-update-notice, ADR-0010). false면 GitHub에 묻지 않는다.
   * Dock·Finder로 켠 앱은 환경 변수를 받지 않으므로 끄는 법은 이 값이 기본이다
   */
  updateCheck: boolean;
}

export const SETTINGS_FILE_NAME = 'settings.json';
export const DEFAULT_SETTINGS: Settings = { followAgents: true, theme: 'system', updateCheck: true };

/** 없거나 읽을 수 없으면 기본값. 모르는 키·잘못된 값은 무시한다 */
export function readSettings(profileDir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(join(profileDir, SETTINGS_FILE_NAME), 'utf8')) as Partial<Record<keyof Settings, unknown>>;
    return {
      followAgents: typeof raw.followAgents === 'boolean' ? raw.followAgents : DEFAULT_SETTINGS.followAgents,
      theme: isThemeMode(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
      updateCheck: typeof raw.updateCheck === 'boolean' ? raw.updateCheck : DEFAULT_SETTINGS.updateCheck,
    };
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
