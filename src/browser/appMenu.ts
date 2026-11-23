import type { MenuItemConstructorOptions } from 'electron';
import { THEME_MODES, type ThemeMode } from './settings';

/** 화면 모드 이름(카드 20261123-theme-mode). 패널의 "모양" 선택과 같은 글자 */
export const THEME_LABELS: Record<ThemeMode, string> = { system: '기기', light: '밝게', dark: '어둡게' };
/** 메뉴 "보기 > 모양"의 모드 항목 id */
export const themeMenuId = (mode: ThemeMode) => `theme-${mode}`;

/** 메뉴의 화면 모드: 지금 값과 고를 때 부를 곳 */
export interface ThemeMenu { current: ThemeMode; pick(mode: ThemeMode): void }

/**
 * 앱 메뉴(카드 20261123-qa-followups Q5, DOC-03-UI UI-F6). 정하지 않으면 Electron 기본 메뉴가 붙어
 * 다시 로드·개발자 도구로 사람 창 UI를 다시 불러오거나 열 수 있다. 종료·편집(복사·붙여넣기 단축키)·보기(화면 모드)·창만 둔다.
 */
export function appMenuTemplate(platform: NodeJS.Platform, appName: string, theme: ThemeMenu): MenuItemConstructorOptions[] {
  const edit: MenuItemConstructorOptions = {
    label: '편집',
    submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  };
  const view: MenuItemConstructorOptions = {
    label: '보기',
    submenu: [{
      label: '모양',
      submenu: THEME_MODES.map((mode) => ({
        id: themeMenuId(mode), label: THEME_LABELS[mode], type: 'radio' as const, checked: theme.current === mode, click: () => theme.pick(mode),
      })),
    }],
  };
  if (platform === 'darwin') {
    return [
      { label: appName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      edit,
      view,
      { label: '창', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }] },
    ];
  }
  return [
    { label: '파일', submenu: [{ role: 'quit' }] },
    edit,
    view,
    { label: '창', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
}
