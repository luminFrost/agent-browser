import type { MenuItemConstructorOptions } from 'electron';
import { THEME_MODES, type ThemeMode } from './settings';

/** 화면 모드 이름(카드 20261123-theme-mode). 주소창 줄 테마 버튼(선택 목록)과 같은 글자 */
export const THEME_LABELS: Record<ThemeMode, string> = { system: '시스템 설정', light: '라이트', dark: '다크' };
/** 메뉴 "보기 > 테마"의 모드 항목 id */
export const themeMenuId = (mode: ThemeMode) => `theme-${mode}`;

/** 메뉴의 화면 모드: 지금 값과 고를 때 부를 곳 */
export interface ThemeMenu { current: ThemeMode; pick(mode: ThemeMode): void }
/** 메뉴 "업데이트 확인…"을 누를 때 부를 곳(카드 20261123-update-check-now) */
export interface UpdateMenu { check(): void }
/** 메뉴 "업데이트 확인…" 항목 id */
export const UPDATE_CHECK_MENU_ID = 'update-check';

/**
 * 앱 메뉴(카드 20261123-qa-followups Q5, DOC-03-UI UI-F6). 정하지 않으면 Electron 기본 메뉴가 붙어
 * 다시 로드·개발자 도구로 사람 창 UI를 다시 불러오거나 열 수 있다. 종료·편집(복사·붙여넣기 단축키)·보기(화면 모드)·창만 둔다.
 */
export function appMenuTemplate(platform: NodeJS.Platform, appName: string, theme: ThemeMenu, update: UpdateMenu): MenuItemConstructorOptions[] {
  const checkUpdate: MenuItemConstructorOptions = { id: UPDATE_CHECK_MENU_ID, label: '업데이트 확인…', click: () => update.check() };
  const edit: MenuItemConstructorOptions = {
    label: '편집',
    submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  };
  const view: MenuItemConstructorOptions = {
    label: '보기',
    submenu: [{
      label: '테마',
      submenu: THEME_MODES.map((mode) => ({
        id: themeMenuId(mode), label: THEME_LABELS[mode], type: 'radio' as const, checked: theme.current === mode, click: () => theme.pick(mode),
      })),
    }],
  };
  if (platform === 'darwin') {
    return [
      { label: appName, submenu: [{ role: 'about' }, checkUpdate, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      edit,
      view,
      { label: '창', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }] },
    ];
  }
  return [
    { label: '파일', submenu: [checkUpdate, { type: 'separator' }, { role: 'quit' }] },
    edit,
    view,
    { label: '창', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
}
