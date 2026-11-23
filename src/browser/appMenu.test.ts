// 카드 20261123-theme-toolbar H2: 메뉴 "보기 > 테마"의 이름
import { describe, expect, it } from 'vitest';
import { appMenuTemplate } from './appMenu';

describe('앱 메뉴 보기 > 테마', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform}: 보기 > 테마 > 시스템 설정·라이트·다크(라디오, 지금 값 체크)`, () => {
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'dark', pick: () => undefined }, { check: () => undefined });
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
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'system', pick: () => undefined }, { check: () => { called++; } });
      const items = menu.find((m) => m.label === top)?.submenu as { id?: string; label?: string; click?: () => void }[];
      const item = items.find((i) => i.id === 'update-check');
      expect(item?.label).toBe('업데이트 확인…');
      item?.click?.();
      expect(called).toBe(1);
    });
  }
});
