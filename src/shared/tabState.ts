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
  | { cmd: 'decide'; id: string; allow: boolean }
  /** 사람 창 UI의 화면 크기가 바뀌었다. 창 내용 높이는 resize 이벤트 없이 바뀔 수 있다(Linux 메뉴 막대) */
  | { cmd: 'relayout' }
  /** 에이전트 따라 보기를 켜거나 끈다(카드 20261120-follow-agents) */
  | { cmd: 'follow'; on: boolean }
  /** 세션 이름을 바꾼다(카드 20261120-session-labels). 빈 이름이면 바꾸지 않는다 */
  | { cmd: 'rename'; sessionId: string; label: string }
  /** 화면 모드를 바꾼다(카드 20261123-theme-mode). 모르는 값이면 무시한다 */
  | { cmd: 'theme'; mode: string }
  /** 앱 안 업데이트: 새 버전을 받아 바꿔 깔고 앱을 다시 켠다(카드 20261123-update-notice) */
  | { cmd: 'update' };

/** 사람 창 머리(탭 막대·주소창)에 보일 상태. viewing이 있으면 그 세션의 탭을 보는 중이다(읽기 전용) */
export interface HumanToolbarState extends TabStripState {
  viewing: string | null;
  /** 보는 세션의 이름(없으면 키만 보인다) */
  viewingLabel?: string;
}

/** 지켜보기 패널에 보이는 세션 하나(R11) */
export interface SessionView {
  sessionId: string;
  /** 세션 이름(카드 20261120-session-labels). 없으면 키만 보인다 */
  label?: string;
  tabs: TabView[];
  activeId: number | null;
}
