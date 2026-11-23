// 카드 20261123-theme-toolbar H2: 메뉴 "보기 > 테마"의 이름
import { describe, expect, it } from 'vitest';
import { appMenuTemplate } from './appMenu';

describe('앱 메뉴 보기 > 테마', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform}: 보기 > 테마 > 시스템 설정·라이트·다크(라디오, 지금 값 체크)`, () => {
      const menu = appMenuTemplate(platform, 'Agent Browser', { current: 'dark', pick: () => undefined });
      const view = menu.find((m) => m.label === '보기');
      const theme = (view?.submenu as { label?: string; submenu?: unknown }[]).find((m) => m.label === '테마');
      const items = theme?.submenu as { label: string; type: string; checked: boolean }[];
      expect(items.map((i) => [i.label, i.type, i.checked])).toEqual([['시스템 설정', 'radio', false], ['라이트', 'radio', false], ['다크', 'radio', true]]);
    });
  }
});
