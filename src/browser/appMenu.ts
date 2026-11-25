import type { MenuItemConstructorOptions } from 'electron';
import { THEME_MODES, type ThemeMode } from './settings';
import { isFolder, type BookmarkNode } from './bookmarks';

/** 화면 모드 이름(카드 20261123-theme-mode). 주소창 줄 테마 버튼(선택 목록)과 같은 글자 */
export const THEME_LABELS: Record<ThemeMode, string> = { system: '시스템 설정', light: '라이트', dark: '다크' };
/** 메뉴 "보기 > 테마"의 모드 항목 id */
export const themeMenuId = (mode: ThemeMode) => `theme-${mode}`;

/** 메뉴의 화면 모드: 지금 값과 고를 때 부를 곳 */
export interface ThemeMenu { current: ThemeMode; pick(mode: ThemeMode): void }
/** 메뉴 "업데이트 확인…"을 누를 때 부를 곳(카드 20261123-update-check-now) */
export interface UpdateMenu { check(): void }
/** 탭 단축키 동작(카드 20261125-tab-usability K2). selectTab은 1~8번째 또는 마지막 */
export type TabAction = 'newTab' | 'reopenTab' | 'duplicateTab' | 'closeTab' | 'focusAddress' | 'reload' | 'back' | 'forward'
  | 'nextTab' | 'prevTab' | 'toggleBookmark' | 'importChromeBookmarks' | { selectTab: number | 'last' };
/** 메뉴의 탭 동작을 부를 곳(사람 창) */
export interface TabMenu { run(action: TabAction): void }
/** 메뉴 "북마크" 아래 목록과 고를 때 부를 곳(카드 20261125-bookmarks) */
export interface BookmarkMenu { nodes: BookmarkNode[]; open(id: string): void }
/** 북마크 메뉴 항목 id(시험·진단이 누른다) */
export const bookmarkMenuId = (id: string) => `bookmark-${id}`;
/** 북마크 목록 → 메뉴 항목(폴더는 하위 메뉴). 앱 메뉴 "북마크"와 북마크 막대의 폴더 메뉴가 같이 쓴다 */
export function bookmarkMenuItems(nodes: BookmarkNode[], open: (id: string) => void): MenuItemConstructorOptions[] {
  return nodes.map((n) => (isFolder(n)
    ? { label: n.title || '(이름 없음)', submenu: n.children.length ? bookmarkMenuItems(n.children, open) : [{ label: '(비어 있음)', enabled: false }] }
    : { id: bookmarkMenuId(n.id), label: n.title || n.url, click: () => open(n.id) }));
}
/** 숫자로 고르는 탭 수(⌘1~⌘8). ⌘9는 마지막 탭(Chrome과 같다) */
const NUMBERED_TABS = 8;
/** 메뉴 "업데이트 확인…" 항목 id */
export const UPDATE_CHECK_MENU_ID = 'update-check';

/**
 * 앱 메뉴(카드 20261123-qa-followups Q5, DOC-03-UI UI-F6). 정하지 않으면 Electron 기본 메뉴가 붙어
 * 다시 로드·개발자 도구로 사람 창 UI를 다시 불러오거나 열 수 있다. 종료·편집(복사·붙여넣기 단축키)·보기(화면 모드)·창만 둔다.
 */
export function appMenuTemplate(
  platform: NodeJS.Platform, appName: string, theme: ThemeMenu, update: UpdateMenu, tabs: TabMenu, bookmarks: BookmarkMenu,
): MenuItemConstructorOptions[] {
  const act = (id: string, label: string, accelerator: string, action: TabAction): MenuItemConstructorOptions => ({ id, label, accelerator, click: () => tabs.run(action) });
  // 파일: 탭을 열고 닫는다(Chrome의 파일 메뉴와 같은 자리·단축키)
  const tabFile: MenuItemConstructorOptions[] = [
    act('new-tab', '새 탭', 'CmdOrCtrl+T', 'newTab'),
    act('reopen-tab', '닫은 탭 다시 열기', 'CmdOrCtrl+Shift+T', 'reopenTab'),
    act('duplicate-tab', '탭 복제', 'CmdOrCtrl+Shift+K', 'duplicateTab'),
    act('focus-address', '주소창으로', 'CmdOrCtrl+L', 'focusAddress'),
    { type: 'separator' },
    act('close-tab', '탭 닫기', 'CmdOrCtrl+W', 'closeTab'),
  ];
  const tabMenu: MenuItemConstructorOptions = {
    label: '탭',
    submenu: [
      act('next-tab', '다음 탭', 'Ctrl+Tab', 'nextTab'),
      act('prev-tab', '이전 탭', 'Ctrl+Shift+Tab', 'prevTab'),
      { type: 'separator' },
      ...Array.from({ length: NUMBERED_TABS }, (_, i) => act(`select-tab-${i + 1}`, `${i + 1}번째 탭`, `CmdOrCtrl+${i + 1}`, { selectTab: i + 1 })),
      act('select-tab-last', '마지막 탭', `CmdOrCtrl+${NUMBERED_TABS + 1}`, { selectTab: 'last' }),
    ],
  };
  const bookmarkItems = (nodes: BookmarkNode[]) => bookmarkMenuItems(nodes, bookmarks.open);
  const bookmarkMenu: MenuItemConstructorOptions = {
    label: '북마크',
    submenu: [
      act('toggle-bookmark', '이 페이지 북마크', 'CmdOrCtrl+D', 'toggleBookmark'),
      { id: 'import-chrome-bookmarks', label: 'Chrome 북마크 가져오기…', click: () => tabs.run('importChromeBookmarks') },
      ...(bookmarks.nodes.length ? [{ type: 'separator' as const }, ...bookmarkItems(bookmarks.nodes)] : []),
    ],
  };
  // 창 닫기는 ⇧⌘W(⌘W는 탭 닫기)
  const closeWindow: MenuItemConstructorOptions = { role: 'close', label: '창 닫기', accelerator: 'CmdOrCtrl+Shift+W' };
  const checkUpdate: MenuItemConstructorOptions = { id: UPDATE_CHECK_MENU_ID, label: '업데이트 확인…', click: () => update.check() };
  const edit: MenuItemConstructorOptions = {
    label: '편집',
    submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  };
  const view: MenuItemConstructorOptions = {
    label: '보기',
    submenu: [
      act('reload', '새로고침', 'CmdOrCtrl+R', 'reload'),
      act('back', '뒤로', 'CmdOrCtrl+[', 'back'),
      act('forward', '앞으로', 'CmdOrCtrl+]', 'forward'),
      { type: 'separator' },
      {
      label: '테마',
      submenu: THEME_MODES.map((mode) => ({
        id: themeMenuId(mode), label: THEME_LABELS[mode], type: 'radio' as const, checked: theme.current === mode, click: () => theme.pick(mode),
      })),
    }],
  };
  if (platform === 'darwin') {
    return [
      { label: appName, submenu: [{ role: 'about' }, checkUpdate, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { label: '파일', submenu: tabFile },
      edit,
      view,
      bookmarkMenu,
      tabMenu,
      { label: '창', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, closeWindow] },
    ];
  }
  return [
    { label: '파일', submenu: [...tabFile, { type: 'separator' }, checkUpdate, { type: 'separator' }, { role: 'quit' }] },
    edit,
    view,
    bookmarkMenu,
    tabMenu,
    { label: '창', submenu: [{ role: 'minimize' }, closeWindow] },
  ];
}
