import type { MenuItemConstructorOptions } from 'electron';

/**
 * 앱 메뉴(카드 20261123-qa-followups Q5, DOC-03-UI UI-F6). 정하지 않으면 Electron 기본 메뉴가 붙어
 * 다시 로드·개발자 도구로 사람 창 UI를 다시 불러오거나 열 수 있다. 종료·편집(복사·붙여넣기 단축키)·창만 둔다.
 */
export function appMenuTemplate(platform: NodeJS.Platform, appName: string): MenuItemConstructorOptions[] {
  const edit: MenuItemConstructorOptions = {
    label: '편집',
    submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  };
  if (platform === 'darwin') {
    return [
      { label: appName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      edit,
      { label: '창', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }] },
    ];
  }
  return [
    { label: '파일', submenu: [{ role: 'quit' }] },
    edit,
    { label: '창', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
}
