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
  | { cmd: 'stopSession'; sessionId: string };

/** 지켜보기 패널에 보이는 세션 하나(R11) */
export interface SessionView {
  sessionId: string;
  tabs: TabView[];
  activeId: number | null;
}
