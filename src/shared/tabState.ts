export interface TabView {
  id: number;
  title: string;
  /** 주소창에 보일 주소. 오류 페이지라면 실패한 주소 */
  url: string;
  loading: boolean;
}

export interface TabStripState {
  tabs: TabView[];
  activeId: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

export type HumanCommand =
  | { cmd: 'navigate'; input: string }
  | { cmd: 'back' }
  | { cmd: 'forward' }
  | { cmd: 'reload' }
  | { cmd: 'newTab' }
  | { cmd: 'activate'; id: number }
  | { cmd: 'close'; id: number }
  | { cmd: 'stopSession'; sessionId: string }
  /** 왼쪽 영역에 볼 대상: 세션 id 또는 null(내 탭) */
  | { cmd: 'view'; sessionId: string | null }
  | { cmd: 'decide'; id: string; allow: boolean };

/** 사람 창 머리(탭 막대·주소창)에 보일 상태. viewing이 있으면 그 세션의 탭을 보는 중이다(읽기 전용) */
export interface HumanToolbarState extends TabStripState {
  viewing: string | null;
}

/** 지켜보기 패널에 보이는 세션 하나(R11) */
export interface SessionView {
  sessionId: string;
  tabs: TabView[];
  activeId: number | null;
}
