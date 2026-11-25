// 카드 20261123-theme-toolbar H2: 메뉴 "보기 > 테마"의 이름
import { describe, expect, it } from 'vitest';
import { appMenuTemplate, type BookmarkMenu } from './appMenu';

const NO_BOOKMARKS: BookmarkMenu = { nodes: [], open: () => undefined };

describe('앱 메뉴 보기 > 테마', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform}: 보기 > 테마 > 시스템 설정·라이트·다크(라디오, 지금 값 체크)`, () => {
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'dark', pick: () => undefined }, { check: () => undefined }, { run: () => undefined }, NO_BOOKMARKS);
      const view = menu.find((m) => m.label === '보기');
      const theme = (view?.submenu as { label?: string; submenu?: unknown }[]).find((m) => m.label === '테마');
      const items = theme?.submenu as { label: string; type: string; checked: boolean }[];
      expect(items.map((i) => [i.label, i.type, i.checked])).toEqual([['시스템 설정', 'radio', false], ['라이트', 'radio', false], ['다크', 'radio', true]]);
    });
  }
});

// 카드 20261123-update-check-now C1: 켜져 있는 동안 나온 새 버전을 바로 확인
describe('앱 메뉴 업데이트 확인', () => {
  for (const [platform, top] of [['darwin', 'Agent Browser'], ['linux', '파일']] as const) {
    it(`${platform}: ${top} 메뉴에 "업데이트 확인…"이 있고 누르면 check를 부른다`, () => {
      let called = 0;
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'system', pick: () => undefined }, { check: () => { called++; } }, { run: () => undefined }, NO_BOOKMARKS);
      const items = menu.find((m) => m.label === top)?.submenu as { id?: string; label?: string; click?: () => void }[];
      const item = items.find((i) => i.id === 'update-check');
      expect(item?.label).toBe('업데이트 확인…');
      item?.click?.();
      expect(called).toBe(1);
    });
  }
});

// 카드 20261125-tab-usability K2: Chrome과 같은 탭 단축키
describe('앱 메뉴 탭 단축키', () => {
  const expected: [string, string, string][] = [
    ['new-tab', 'CmdOrCtrl+T', 'newTab'], ['reopen-tab', 'CmdOrCtrl+Shift+T', 'reopenTab'], ['duplicate-tab', 'CmdOrCtrl+Shift+K', 'duplicateTab'],
    ['close-tab', 'CmdOrCtrl+W', 'closeTab'], ['focus-address', 'CmdOrCtrl+L', 'focusAddress'], ['reload', 'CmdOrCtrl+R', 'reload'],
    ['back', 'CmdOrCtrl+[', 'back'], ['forward', 'CmdOrCtrl+]', 'forward'], ['next-tab', 'Ctrl+Tab', 'nextTab'], ['prev-tab', 'Ctrl+Shift+Tab', 'prevTab'],
    ['select-tab-1', 'CmdOrCtrl+1', 'selectTab:1'], ['select-tab-8', 'CmdOrCtrl+8', 'selectTab:8'], ['select-tab-last', 'CmdOrCtrl+9', 'selectTab:last'],
  ];
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform}: 항목마다 단축키가 있고 누르면 그 동작을 부른다. 창 닫기는 ⇧⌘W`, () => {
      const ran: string[] = [];
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'system', pick: () => undefined }, { check: () => undefined },
        { run: (a) => { ran.push(typeof a === 'string' ? a : `selectTab:${a.selectTab}`); } }, NO_BOOKMARKS);
      const all = menu.flatMap((m) => (m.submenu as { id?: string; accelerator?: string; role?: string; click?: () => void }[]));
      for (const [id, accel, action] of expected) {
        const item = all.find((i) => i.id === id);
        expect(item?.accelerator, id).toBe(accel);
        item?.click?.();
        expect(ran.at(-1), id).toBe(action);
      }
      // ⌘W는 탭 닫기 하나만 쓴다(창 닫기와 겹치지 않게)
      expect(all.filter((i) => i.accelerator === 'CmdOrCtrl+W').map((i) => i.id)).toEqual(['close-tab']);
      expect(all.find((i) => i.role === 'close')?.accelerator).toBe('CmdOrCtrl+Shift+W');
    });
  }
});

// 카드 20261125-bookmarks B1·B3: 메뉴 "북마크"
describe('앱 메뉴 북마크', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform}: 이 페이지 북마크 ⌘D, Chrome 북마크 가져오기…, 아래에 북마크 목록(폴더는 하위 메뉴)`, () => {
      const ran: string[] = [];
      const opened: string[] = [];
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'system', pick: () => undefined }, { check: () => undefined },
        { run: (a) => { ran.push(String(a)); } },
        { nodes: [{ id: 'a', title: 'A', url: 'https://a.test/' }, { id: 'f', title: '일', children: [{ id: 'b', title: 'B', url: 'https://b.test/' }] }], open: (id) => { opened.push(id); } });
      const items = menu.find((m) => m.label === '북마크')?.submenu as { id?: string; label?: string; accelerator?: string; click?: () => void; submenu?: unknown }[];
      const toggle = items.find((i) => i.id === 'toggle-bookmark');
      expect([toggle?.label, toggle?.accelerator]).toEqual(['이 페이지 북마크', 'CmdOrCtrl+D']);
      toggle?.click?.();
      items.find((i) => i.id === 'import-chrome-bookmarks')?.click?.();
      expect(ran).toEqual(['toggleBookmark', 'importChromeBookmarks']);
      expect(items.find((i) => i.id === 'import-chrome-bookmarks')?.label).toBe('Chrome 북마크 가져오기…');
      items.find((i) => i.id === 'bookmark-a')?.click?.();
      const folder = items.find((i) => i.label === '일');
      (folder?.submenu as { id?: string; click?: () => void }[]).find((i) => i.id === 'bookmark-b')?.click?.();
      expect(opened).toEqual(['a', 'b']);
    });
  }
});
