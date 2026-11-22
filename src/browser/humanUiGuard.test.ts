import { describe, expect, it } from 'vitest';
import { isHumanUiUrl } from './humanUiGuard';

const UI = 'file:///Applications/Agent%20Browser.app/Contents/Resources/app.asar/dist/browser/renderer/human/index.html';

describe('사람 창 UI 주소 확인 (카드 20261122-human-ui-guard G3·G4)', () => {
  it('UI 파일 주소면 참(조각·쿼리는 무시)', () => {
    expect(isHumanUiUrl(UI, UI)).toBe(true);
    expect(isHumanUiUrl(`${UI}#x`, UI)).toBe(true);
  });
  it('바깥 페이지·다른 파일·빈 주소는 거짓', () => {
    expect(isHumanUiUrl('http://127.0.0.1:1/a', UI)).toBe(false);
    expect(isHumanUiUrl('file:///tmp/evil/renderer/human/index.html', UI)).toBe(false);
    expect(isHumanUiUrl('', UI)).toBe(false);
    expect(isHumanUiUrl(undefined, UI)).toBe(false);
  });
});
