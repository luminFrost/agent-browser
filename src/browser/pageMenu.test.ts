// 카드 20261127-page-devtools D3·D4: 페이지 오른쪽 클릭 메뉴(F-BR-07)와 검사(F-BR-06·F-HW-13)
import { describe, expect, it } from 'vitest';
import { canOpenInNewTab, pageContextMenu, viewingContextMenu, INSPECT_ACCELERATOR, type PageMenuActions, type PageMenuParams } from './pageMenu';

const NONE: PageMenuParams = {
  linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false,
  editFlags: { canUndo: false, canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
};
const calls: string[] = [];
const actions: PageMenuActions = {
  openInNewTab: (url) => calls.push(`open ${url}`),
  copyText: (text) => calls.push(`copy ${text}`),
  back: () => calls.push('back'),
  forward: () => calls.push('forward'),
  reload: () => calls.push('reload'),
  inspect: () => calls.push('inspect'),
};
const NAV = { canGoBack: true, canGoForward: false };
type Item = { label?: string; type?: string; role?: string; enabled?: boolean; accelerator?: string; click?: () => void };
const labels = (items: Item[]) => items.map((i) => (i.type === 'separator' ? '-' : i.label));
const item = (items: Item[], label: string) => items.find((i) => i.label === label) as Item;

describe('내 탭 오른쪽 클릭 메뉴 (D3)', () => {
  it('링크: 새 탭에서 열기·주소 복사, 끝에 구분선과 검사', () => {
    calls.length = 0;
    const m = pageContextMenu({ ...NONE, linkURL: 'https://example.com/a' }, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['링크를 새 탭에서 열기', '링크 주소 복사', '-', '검사']);
    item(m, '링크를 새 탭에서 열기').click?.();
    item(m, '링크 주소 복사').click?.();
    item(m, '검사').click?.();
    expect(calls).toEqual(['open https://example.com/a', 'copy https://example.com/a', 'inspect']);
  });

  it('이미지: 새 탭에서 열기·주소 복사', () => {
    calls.length = 0;
    const m = pageContextMenu({ ...NONE, mediaType: 'image', srcURL: 'https://example.com/i.png' }, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['이미지를 새 탭에서 열기', '이미지 주소 복사', '-', '검사']);
    item(m, '이미지 주소 복사').click?.();
    expect(calls).toEqual(['copy https://example.com/i.png']);
  });

  it('링크인 이미지는 둘 다 보인다', () => {
    const m = pageContextMenu({ ...NONE, linkURL: 'https://example.com/a', mediaType: 'image', srcURL: 'https://example.com/i.png' }, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['링크를 새 탭에서 열기', '링크 주소 복사', '-', '이미지를 새 탭에서 열기', '이미지 주소 복사', '-', '검사']);
  });

  it('선택한 글자: 복사(copy 역할)', () => {
    const m = pageContextMenu({ ...NONE, selectionText: '안녕', editFlags: { ...NONE.editFlags, canCopy: true } }, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['복사', '-', '검사']);
    expect(item(m, '복사').role).toBe('copy');
  });

  it('입력 칸: 실행 취소·잘라내기·복사·붙여넣기·모두 선택, editFlags대로 켜고 끈다', () => {
    const m = pageContextMenu({ ...NONE, isEditable: true, editFlags: { canUndo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: false } }, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['실행 취소', '-', '잘라내기', '복사', '붙여넣기', '-', '모두 선택', '-', '검사']);
    expect(m.filter((i) => i.role).map((i) => [i.role, i.enabled])).toEqual([
      ['undo', false], ['cut', true], ['copy', true], ['paste', true], ['selectAll', false],
    ]);
  });

  it('그 밖: 뒤로·앞으로·새로고침(갈 수 없으면 꺼짐)', () => {
    calls.length = 0;
    const m = pageContextMenu(NONE, NAV, actions) as Item[];
    expect(labels(m)).toEqual(['뒤로', '앞으로', '새로고침', '-', '검사']);
    expect([item(m, '뒤로').enabled, item(m, '앞으로').enabled, item(m, '새로고침').enabled]).toEqual([true, false, true]);
    item(m, '뒤로').click?.();
    item(m, '새로고침').click?.();
    expect(calls).toEqual(['back', 'reload']);
  });

  it('새 탭에서 열기는 http·https·data·blob만. 다른 주소면 꺼진다(복사는 된다)', () => {
    for (const ok of ['http://a.test/', 'https://a.test/', 'data:text/plain,hi', 'blob:https://a.test/x']) expect(canOpenInNewTab(ok)).toBe(true);
    for (const no of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings', 'mailto:a@b.c', 'about:blank', '']) expect(canOpenInNewTab(no)).toBe(false);
    const m = pageContextMenu({ ...NONE, linkURL: 'javascript:alert(1)' }, NAV, actions) as Item[];
    expect([item(m, '링크를 새 탭에서 열기').enabled, item(m, '링크 주소 복사').enabled]).toEqual([false, true]);
  });

  it('검사의 단축키는 ⌥⌘I', () => {
    const m = pageContextMenu(NONE, NAV, actions) as Item[];
    expect(item(m, '검사').accelerator).toBe(INSPECT_ACCELERATOR);
    expect(INSPECT_ACCELERATOR).toBe('Alt+CmdOrCtrl+I');
  });
});

describe('세션을 보는 중 오른쪽 클릭 메뉴 (D4)', () => {
  it('검사 하나만', () => {
    calls.length = 0;
    const m = viewingContextMenu(() => calls.push('inspect')) as Item[];
    expect(labels(m)).toEqual(['검사']);
    m[0].click?.();
    expect(calls).toEqual(['inspect']);
  });
});
