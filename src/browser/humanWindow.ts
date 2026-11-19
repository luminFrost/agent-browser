import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { SHARED_PARTITION } from '../shared/constants';
import type { HumanCommand, HumanToolbarState, SessionView } from '../shared/tabState';
import type { ApprovalView } from '../shared/approval';
import type { ContentArea } from './agentSession';
import type { Rect } from '../shared/ipc';

/** 주소창 + 탭 막대 높이(px). renderer/human/human.css의 --toolbar-height와 같아야 한다 */
const TOOLBAR_HEIGHT = 76;
/** 지켜보기 패널 너비(px). renderer/human/human.css의 --panel-width와 같아야 한다 */
const PANEL_WIDTH = 280;
/** 탭 내용이 들어가는 자리. 사람 탭과 세션 탭이 같은 자리를 쓴다 */
export const CONTENT_AREA: ContentArea = { topInset: TOOLBAR_HEIGHT, rightInset: PANEL_WIDTH };

/** 왼쪽 영역에 지금 보이는 것 */
export type Shown = ({ view: 'human'; contentsId?: number } | { view: 'session'; sessionId: string; contentsId?: number }) & {
  /** 비켜 둔 세션 탭이 창 안에 드러난 자리(E4 진단용) */
  exposed: Rect[];
  /** 창 내용 크기 */
  content: { width: number; height: number };
};

export interface HumanWindow {
  win: BrowserWindow;
  tabs: TabStrip;
  /** 지켜보기 패널을 다시 그린다 */
  showSessions(sessions: SessionView[]): void;
  /** 승인 요청 목록을 다시 그린다 */
  showApprovals(approvals: ApprovalView[]): void;
  /** 세션의 탭 묶음을 보기 대상으로 등록한다 */
  addSession(sessionId: string, tabs: TabStrip): void;
  /** 세션이 끝났다. 그 세션을 보는 중이었다면 내 탭으로 돌아간다(E6) */
  removeSession(sessionId: string): void;
  /** 세션의 탭 상태가 바뀌었다. 그 세션을 보는 중이면 머리를 다시 그린다(E2) */
  sessionChanged(sessionId: string): void;
  shown(): Shown;
  /** 탭의 위아래 순서와 비켜 둔 세션 탭의 자리를 다시 정한다(탭 배치가 바뀐 뒤 부른다) */
  restack(): void;
}

export interface HumanWindowEvents {
  /** 사람이 패널에서 멈추기를 눌렀다 */
  stopSession(sessionId: string): void;
  /** 사람이 승인 요청에 답했다 */
  decide(id: string, allow: boolean): void;
}

export function createHumanWindow(show: boolean, events: HumanWindowEvents): HumanWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show,
    title: 'agent-browser',
    webPreferences: { preload: join(__dirname, 'preload', 'human.js'), sandbox: true, contextIsolation: true },
  });
  /** 보기 대상 세션의 탭 묶음(세션 id → 묶음) */
  const sessions = new Map<string, TabStrip>();
  /** 왼쪽 영역에 보는 세션. null이면 내 탭 */
  let viewing: string | null = null;

  const toolbarState = (): HumanToolbarState => {
    const strip = viewing === null ? undefined : sessions.get(viewing);
    return strip ? { ...strip.viewState(), viewing } : { ...tabs.state(), viewing: null };
  };
  const sendToolbar = () => { if (!win.isDestroyed()) win.webContents.send('human:state', toolbarState()); };

  /**
   * 보이지 않는 세션의 활성 탭은 숨기면 그리지 않아 에이전트의 클릭·스크린샷이 멈춘다(E4). 다른 탭 view에 완전히 덮여도
   * 그리지 않는다(Chromium이 가려진 화면을 그리지 않는다). 그래서 크기는 그대로 두고 창 오른쪽 아래 구석 바깥으로 비켜 둔다:
   * k번째 탭은 왼쪽 위 1px만 창 안(x = 너비-1-k, y = 높이-1)에 들어오고, 나머지는 창 오른쪽·아래 바깥이라 보이지도
   * 입력을 받지도 않는다. 드러나는 점이 페이지의 왼쪽 위라, 에이전트가 화면 크기를 줄여도(emulate) 그 안에 있다.
   * 더 왼쪽에 놓인 탭일수록 아래에 깔아 탭마다 자기 점이 드러나게 한다. 드러난 점은 덮지 않는다: 무엇으로든(View 포함)
   * 덮으면 다시 그리지 않는다(ADR-0009). 창 내용 높이가 resize 이벤트 없이 바뀌는 경우(Linux 메뉴 막대)는 사람 창 UI가
   * 자기 화면 크기 변화를 relayout으로 알려 다시 놓는다.
   */
  let exposed: Rect[] = [];
  // tabs는 아래에서 만든다. TabStrip 생성자는 배치하지 않으므로 restack이 처음 불릴 때는 이미 있다
  const restack = () => {
    if (win.isDestroyed()) return;
    const { width, height } = win.getContentBounds();
    const parked = [...sessions.values()].map((strip) => strip.parkedView()).filter((v) => v !== undefined);
    // 비켜 둘 탭 수가 지켜보기 패널 너비를 넘으면 드러난 자리가 보는 탭에 덮인다. 그 수까지만 그리기를 보장한다
    const count = Math.min(parked.length, CONTENT_AREA.rightInset);
    exposed = [];
    for (let k = parked.length - 1; k >= 0; k--) {
      const view = parked[k];
      const { width: w, height: h } = view.getBounds();
      const x = width - 1 - Math.min(k, count - 1);
      view.setBounds({ x, y: height - 1, width: w, height: h });
      win.contentView.addChildView(view); // 이미 있으면 맨 위로 옮긴다: 왼쪽(k가 큰) 탭부터 올려 오른쪽 탭이 위에 온다
      // 오른쪽 열들은 위에 놓인(k가 작은) 탭이 덮으므로, 드러난 것은 자기 왼쪽 위 한 점이다
      exposed.unshift({ x, y: height - 1, width: Math.min(w, 1), height: Math.min(h, 1) });
    }
    const shownView = viewing === null ? tabs.shownView() : sessions.get(viewing)?.shownView();
    if (shownView) win.contentView.addChildView(shownView);
  };
  // 세션 탭 묶음은 창 크기를 스스로 따르지 않는다(세션마다 리스너가 쌓이지 않게). 사람 창이 한 번 받아 모두 다시 놓는다
  const onResize = () => { for (const strip of sessions.values()) strip.relayout(); };
  const relayoutAll = () => {
    tabs.relayout();
    onResize();
  };
  win.on('resize', onResize);

  const tabs = new TabStrip(win, {
    partition: SHARED_PARTITION,
    ...CONTENT_AREA,
    onChange: () => { if (viewing === null) sendToolbar(); },
    onLayout: restack,
  });

  let lastSessions: SessionView[] = [];
  const sendSessions = () => { if (!win.isDestroyed()) win.webContents.send('human:sessions', { sessions: lastSessions, viewing }); };

  /** 보기 대상을 바꾼다. 없는 세션이면 무시한다 */
  const setViewing = (sessionId: string | null) => {
    if (sessionId !== null && !sessions.has(sessionId)) return;
    if (viewing !== null) sessions.get(viewing)?.setShown(false);
    viewing = sessionId;
    if (sessionId === null) tabs.setShown(true);
    else {
      tabs.setShown(false);
      sessions.get(sessionId)?.setShown(true);
    }
    restack();
    sendToolbar();
    sendSessions();
  };

  const onCommand = (event: Electron.IpcMainEvent, c: HumanCommand) => {
    if (event.sender !== win.webContents) return; // 사람 창 UI가 보낸 것만 받는다
    switch (c.cmd) {
      case 'stopSession': return events.stopSession(c.sessionId);
      case 'decide': return events.decide(c.id, c.allow);
      case 'view': return setViewing(c.sessionId);
      case 'relayout': return relayoutAll();
    }
    if (viewing !== null) {
      // 세션을 보는 중에는 읽기 전용이다(E3). 탭 막대에서 보는 탭을 고르는 것만 된다. 주인의 활성 탭은 바꾸지 않는다.
      if (c.cmd === 'activate') sessions.get(viewing)?.display(c.id);
      return;
    }
    switch (c.cmd) {
      case 'navigate': return tabs.navigate(c.input);
      case 'back': return tabs.back();
      case 'forward': return tabs.forward();
      case 'reload': return tabs.reload();
      case 'newTab': return void tabs.newTab();
      case 'activate': return tabs.activate(c.id);
      case 'close': return tabs.close(c.id);
    }
  };
  ipcMain.on('human:command', onCommand);
  const showSessions = (list: SessionView[]) => {
    lastSessions = list;
    sendSessions();
  };
  let lastApprovals: ApprovalView[] = [];
  const showApprovals = (approvals: ApprovalView[]) => {
    lastApprovals = approvals;
    if (!win.isDestroyed()) win.webContents.send('human:approvals', approvals);
  };
  win.webContents.on('did-finish-load', () => {
    sendToolbar();
    sendSessions();
    win.webContents.send('human:approvals', lastApprovals);
  });
  win.on('closed', () => ipcMain.off('human:command', onCommand));

  win.loadFile(join(__dirname, 'renderer', 'human', 'index.html')).catch(() => undefined);
  tabs.newTab();
  return {
    win,
    tabs,
    showSessions,
    showApprovals,
    addSession: (sessionId, strip) => {
      sessions.set(sessionId, strip);
      restack(); // 첫 탭은 등록 전에 생겨 비켜 두지 못했다
    },
    removeSession: (sessionId) => {
      if (viewing === sessionId) setViewing(null);
      sessions.delete(sessionId);
      restack(); // 남은 세션의 탭이 한 칸씩 당겨진다
    },
    sessionChanged: (sessionId) => { if (viewing === sessionId) sendToolbar(); },
    shown: () => {
      const { width, height } = win.getContentBounds();
      const content = { width, height };
      if (viewing === null) return { view: 'human', contentsId: tabs.shownContentsId(), exposed, content };
      return { view: 'session', sessionId: viewing, contentsId: sessions.get(viewing)?.shownContentsId(), exposed, content };
    },
    restack,
  };
}
