import type { MenuItemConstructorOptions } from 'electron';

/**
 * 페이지 오른쪽 클릭 메뉴(F-BR-07)와 검사(F-BR-06·F-HW-13). 카드 20261127-page-devtools D3·D4, DOC-02-FS 15-2.
 * Chrome 메뉴를 다 옮기지 않고 꼭 쓰는 것만 둔다(2차 범위 P-12).
 */

/** 개발자도구·검사 단축키(Chrome과 같다) */
export const INSPECT_ACCELERATOR = 'Alt+CmdOrCtrl+I';

/** webContents 'context-menu' 이벤트의 필요한 값 */
export interface PageMenuParams {
  linkURL: string;
  srcURL: string;
  mediaType: string;
  selectionText: string;
  isEditable: boolean;
  editFlags: { canUndo: boolean; canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}

export interface PageMenuActions {
  /** 주소를 지금 탭 바로 오른쪽 새 탭에 연다(활성 탭은 그대로) */
  openInNewTab(url: string): void;
  copyText(text: string): void;
  back(): void;
  forward(): void;
  reload(): void;
  /** 오른쪽 클릭한 자리를 개발자도구로 연다 */
  inspect(): void;
}

/** 새 탭에서 열 수 있는 주소: 웹 페이지와 그 페이지가 만든 data·blob만(javascript·file·chrome 등은 끈다) */
export const canOpenInNewTab = (url: string): boolean => /^(https?:|data:|blob:)/i.test(url);

const separator: MenuItemConstructorOptions = { type: 'separator' };
const inspectItem = (inspect: () => void): MenuItemConstructorOptions => ({ label: '검사', accelerator: INSPECT_ACCELERATOR, click: inspect });

/** 내 탭의 오른쪽 클릭 메뉴: 링크·이미지·선택한 글자·입력 칸·그 밖, 늘 끝에 검사 */
export function pageContextMenu(p: PageMenuParams, nav: { canGoBack: boolean; canGoForward: boolean }, a: PageMenuActions): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = [];
  const addressItems = (url: string, open: string, copy: string): MenuItemConstructorOptions[] => [
    { label: open, enabled: canOpenInNewTab(url), click: () => a.openInNewTab(url) },
    { label: copy, enabled: true, click: () => a.copyText(url) },
  ];
  if (p.linkURL) groups.push(addressItems(p.linkURL, '링크를 새 탭에서 열기', '링크 주소 복사'));
  if (p.mediaType === 'image' && p.srcURL) groups.push(addressItems(p.srcURL, '이미지를 새 탭에서 열기', '이미지 주소 복사'));
  const f = p.editFlags;
  if (p.isEditable) {
    groups.push([{ role: 'undo', label: '실행 취소', enabled: f.canUndo }]);
    groups.push([
      { role: 'cut', label: '잘라내기', enabled: f.canCut },
      { role: 'copy', label: '복사', enabled: f.canCopy },
      { role: 'paste', label: '붙여넣기', enabled: f.canPaste },
    ]);
    groups.push([{ role: 'selectAll', label: '모두 선택', enabled: f.canSelectAll }]);
  } else if (p.selectionText) {
    groups.push([{ role: 'copy', label: '복사', enabled: f.canCopy }]);
  }
  if (groups.length === 0) {
    groups.push([
      { label: '뒤로', enabled: nav.canGoBack, click: a.back },
      { label: '앞으로', enabled: nav.canGoForward, click: a.forward },
      { label: '새로고침', enabled: true, click: a.reload },
    ]);
  }
  groups.push([inspectItem(a.inspect)]);
  return groups.flatMap((g, i) => (i === 0 ? g : [separator, ...g]));
}

/** 세션을 보는 중(읽기 전용)의 오른쪽 클릭 메뉴: 검사 하나(D-6) */
export const viewingContextMenu = (inspect: () => void): MenuItemConstructorOptions[] => [inspectItem(inspect)];
