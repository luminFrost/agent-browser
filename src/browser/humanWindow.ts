import { BrowserWindow, ipcMain, nativeTheme, type WebContentsView } from 'electron';
import { pathToFileURL } from 'node:url';
import { isHumanUiUrl } from './humanUiGuard';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { SHARED_PARTITION } from '../shared/constants';
import type { HumanCommand, HumanToolbarState, SessionView } from '../shared/tabState';
import type { ApprovalView } from '../shared/approval';
import type { ContentArea } from './agentSession';
import type { Rect } from '../shared/ipc';
import { isThemeMode, type ThemeMode } from './settings';
import type { UpdateState } from './update';
import type { TabAction } from './appMenu';
import type { BookmarkNode } from './bookmarks';

/** 어두운 모드 탭 막대 색(Chrome Google Grey 900). human.css의 --frame 어두운 값과 같다 */
export const DARK_FRAME_COLOR = '#202124';

/** 탭 막대 + 주소창 줄 + 북마크 막대 높이(px). renderer/human/human.css의 --toolbar-height와 같아야 한다 */
const TOOLBAR_HEIGHT = 118;
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
  /** 마지막으로 키보드 포커스를 받은 webContents id(E3 진단용) */
  focusedContentsId?: number;
  /** 키보드 포커스가 창 UI(주소창·패널)에 있다(E3 진단용) */
  focusedUi: boolean;
  /** 사람 창이 OS에서 앞(포커스)에 있다(E3 진단용) */
  windowFocused: boolean;
  /** 화면에 없는 탭이 포커스를 받은 횟수(E3 진단용) */
  offscreenFocusCount: number;
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
  /** 이 세션에 사람이 볼 일이 생겼다(승인 요청). 따라 보기가 켜져 있으면 보인다 */
  attention(sessionId: string): void;
  /** 이 세션을 왼쪽에 보인다(승인 알림을 눌렀을 때) */
  showSession(sessionId: string): void;
  /** 세션 탭이 키보드 포커스를 받았다. 화면에 보이는 탭이 아니면 포커스를 사람이 보는 쪽으로 돌려준다 */
  tabFocused(view: WebContentsView): void;
  /** 키보드 포커스를 창 UI로 돌린다(에이전트 탭이 사람 키를 막았을 때) */
  focusUi(): void;
  /** 주소창 줄 테마 버튼에 지금 화면 모드를 보인다(카드 20261123-theme-mode) */
  showTheme(mode: ThemeMode): void;
  /** 메뉴·단축키의 탭 동작(카드 20261125-tab-usability K2) */
  runTab(action: TabAction): void;
  /** 북마크 막대를 다시 그린다(카드 20261125-bookmarks) */
  showBookmarks(nodes: BookmarkNode[]): void;
  /** 북마크할 지금 페이지(내 탭을 보는 중일 때만). 빈 탭이면 없다 */
  activePage(): { url: string; title: string } | undefined;
  /** 주소를 내 탭에 연다(세션을 보는 중이면 내 탭으로 돌아와서). newTab이면 새 탭 */
  openUrl(url: string, newTab: boolean): void;
  /** 패널에 잠시 알림을 보인다(북마크 파일 결과) */
  toast(text: string): void;
  /** 패널 맨 위 업데이트 줄(카드 20261123-update-notice) */
  showUpdate(state: UpdateState): void;
}

export interface HumanWindowEvents {
  /** 사람이 패널에서 멈추기를 눌렀다 */
  stopSession(sessionId: string): void;
  /** 사람이 승인 요청에 답했다 */
  decide(id: string, allow: boolean): void;
  /** 사람이 패널에서 세션 이름을 바꿨다 */
  renameSession(sessionId: string, label: string): void;
  /** 사람이 패널에서 화면 모드를 골랐다 */
  setTheme(mode: ThemeMode): void;
  /** 사람이 업데이트를 눌렀다 */
  installUpdate(): void;
  /** 북마크 별표를 눌렀다 */
  toggleBookmark(): void;
  /** 북마크 막대 항목을 눌렀다 */
  openBookmark(id: string, newTab: boolean): void;
  /** 북마크 막대 폴더를 눌렀거나 오른쪽 클릭했다 */
  bookmarkPopup(id: string, x: number, y: number): void;
}

/** 따라 보기 설정을 읽고 남기는 곳(프로필의 settings.json) */
export interface FollowStore { initial: boolean; save(on: boolean): void }

export function createHumanWindow(show: boolean, events: HumanWindowEvents, followStore: FollowStore): HumanWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show,
    title: 'agent-browser',
    // 창이 처음 그려질 때 흰 바탕이 번쩍이지 않게 UI 바탕색을 맞춘다(어두운 모드 탭 막대 = Chrome grey-900)
    ...(nativeTheme.shouldUseDarkColors ? { backgroundColor: DARK_FRAME_COLOR } : {}),
    webPreferences: { preload: join(__dirname, 'preload', 'human.js'), sandbox: true, contextIsolation: true },
  });
  /**
   * 사람 창 UI 지키기(카드 20261122-human-ui-guard): 이 페이지는 승인·멈추기 명령을 보낼 수 있다.
   * 페이지 스스로의 이동(스크립트, 링크·파일 끌어다 놓기)과 새 창을 막고, 명령은 UI 파일에서 온 것만 받는다
   */
  const uiPath = join(__dirname, 'renderer', 'human', 'index.html');
  const uiUrl = pathToFileURL(uiPath).href;
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-redirect', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  /** 보기 대상 세션의 탭 묶음(세션 id → 묶음) */
  const sessions = new Map<string, TabStrip>();
  /** 왼쪽 영역에 보는 세션. null이면 내 탭 */
  let viewing: string | null = null;

  const toolbarState = (): HumanToolbarState => {
    const strip = viewing === null ? undefined : sessions.get(viewing);
    const viewingLabel = lastSessions.find((x) => x.sessionId === viewing)?.label;
    return strip ? { ...strip.viewState(), viewing, ...(viewingLabel !== undefined ? { viewingLabel } : {}) } : { ...tabs.state(), viewing: null };
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
    const shownView = currentShownView();
    if (shownView) win.contentView.addChildView(shownView);
    checkFocusAfterLayout();
  };
  /**
   * 키보드 포커스: 보이지 않는 세션 탭이 포커스를 받으면(탭이 생길 때, 에이전트의 Page.bringToFront 등) 사람의 키 입력이
   * 화면에 없는 에이전트 페이지로 조용히 들어간다(비밀번호 등). 예전에는 에이전트 창이 앞으로 나와 알아챘다.
   * 그래서 화면에 보이는 탭(없으면 창 UI)으로 포커스를 바로 돌려준다. 에이전트의 CDP 입력은 포커스 없이도 들어간다.
   */
  let focusedContentsId: number | undefined;
  /** 사람이 마지막으로 쓴 자리: 창 UI(주소창·패널) 또는 그때 화면에 보이던 탭. 포커스를 되돌릴 곳이다 */
  let humanFocus: Electron.WebContents | undefined;
  const currentShownView = () => (viewing === null ? tabs.shownView() : sessions.get(viewing)?.shownView());
  /** 되돌릴 곳: 사람이 쓰던 자리가 창 UI거나 지금 보이는 탭이면 그곳, 아니면 창 UI(페이지 입력칸에 엉뚱하게 들어가지 않게) */
  const restoreTarget = () => {
    const shown = currentShownView()?.webContents;
    if (humanFocus && !humanFocus.isDestroyed() && (humanFocus === win.webContents || humanFocus === shown)) return humanFocus;
    return win.webContents;
  };
  /** 창이 앞에 없을 때 미뤄 둔 되돌림. 사람이 이 창으로 돌아오면 한다 */
  let restorePending = false;
  let restoreScheduled = false;
  /** 화면에 없는 탭이 포커스를 받은 횟수(E3 진단용: 시험이 그 상황이 실제로 일어났는지 본다) */
  let offscreenFocusCount = 0;
  /** 포커스가 창 UI도, 화면에 보이는 탭도 아닌 곳에 있다 */
  const needsRestore = () =>
    focusedContentsId !== undefined && focusedContentsId !== win.webContents.id && focusedContentsId !== currentShownView()?.webContents.id;
  const restoreFocus = () => {
    // webContents.focus()는 macOS·Linux에서 창까지 앞으로 끌어온다. 사람이 다른 앱을 쓰는 중이면 그 입력을 빼앗으므로 미룬다
    if (!win.isFocused()) { restorePending = true; return; }
    restorePending = false;
    if (restoreScheduled) return; // 같은 틱에 여러 번 불려도 한 번만
    restoreScheduled = true;
    // focus 이벤트 처리 중에 되돌리면 Chromium이 그 뒤에 에이전트 탭 활성화를 마저 해서 되돌림이 사라진다. 한 틱 뒤에 한다.
    // 되돌릴지와 어디로 돌릴지는 그때 다시 정한다(그 사이 사람이 보이는 탭을 눌렀으면 건드리지 않는다)
    setImmediate(() => {
      restoreScheduled = false;
      if (win.isDestroyed() || !needsRestore()) return;
      const target = restoreTarget();
      target.focus();
      focusedContentsId = target.id; // OS 포커스가 없으면(테스트 화면) focus 이벤트가 오지 않아 여기서 적는다
    });
  };
  /** 탭(사람 탭이든 세션 탭이든)이 포커스를 받았다. 화면에 보이는 탭이 아니면 사람이 쓰던 자리로 돌려준다 */
  const tabFocused = (view: WebContentsView) => {
    if (win.isDestroyed()) return;
    focusedContentsId = view.webContents.id;
    if (view === currentShownView()) { humanFocus = view.webContents; return; }
    offscreenFocusCount++;
    restoreFocus();
  };
  /** 보이는 탭이 바뀌었는데 포커스가 이제 화면에 없는 탭에 남아 있으면 돌려준다(에이전트의 activateTarget 등) */
  const checkFocusAfterLayout = () => { if (needsRestore()) restoreFocus(); };
  win.on('focus', () => { if (restorePending) restoreFocus(); });
  win.webContents.on('focus', () => {
    focusedContentsId = win.webContents.id;
    humanFocus = win.webContents;
  });

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
    onTabFocus: tabFocused, // 세션을 보는 동안 숨은 사람 탭(window.open 등)도 같다
  });

  let lastSessions: SessionView[] = [];
  /**
   * 에이전트 따라 보기(카드 20261120-follow-agents): 켜져 있으면 새 세션이 생기거나, 어떤 세션의 활성 탭이 바뀌거나
   * 그 주소가 바뀔 때 그 세션을 왼쪽에 보인다. 제목·로딩만 바뀐 것으로는 옮기지 않는다(세션마다 마지막 "활성 탭·주소"를 기억).
   */
  let follow = followStore.initial;
  const lastMove = new Map<string, string>();
  const moveOf = (strip: TabStrip) => {
    const s = strip.state();
    return `${s.activeId}|${s.tabs.find((t) => t.id === s.activeId)?.url ?? ''}`;
  };
  const sendSessions = () => { if (!win.isDestroyed()) win.webContents.send('human:sessions', { sessions: lastSessions, viewing, follow }); };
  const setFollow = (on: boolean) => {
    if (follow === on) return;
    follow = on;
    followStore.save(on);
    sendSessions();
  };

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
    // 사람 창 UI가 보낸 것만 받는다: 그 webContents이고, 보낸 프레임이 UI 파일이어야 한다
    if (event.sender !== win.webContents || !isHumanUiUrl(event.senderFrame?.url, uiUrl)) return;
    switch (c.cmd) {
      case 'stopSession': return events.stopSession(c.sessionId);
      case 'decide': return events.decide(c.id, c.allow);
      case 'view':
        // 사람이 "내 탭으로"(또는 보던 세션의 보기를 다시 눌러) 내 화면을 고르면 따라 보기를 끈다(F4)
        if (c.sessionId === null) setFollow(false);
        return setViewing(c.sessionId);
      case 'relayout': return relayoutAll();
      case 'follow': return setFollow(c.on);
      case 'rename': return events.renameSession(c.sessionId, c.label);
      case 'theme': return isThemeMode(c.mode) ? events.setTheme(c.mode) : undefined;
      case 'update': return events.installUpdate();
      case 'toggleBookmark': return events.toggleBookmark();
      case 'openBookmark': return events.openBookmark(c.id, c.newTab);
      case 'bookmarkPopup': return events.bookmarkPopup(c.id, c.x, c.y);
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
      case 'newTab': return runTab('newTab'); // 새 탭이면 주소창에 커서(⌘T와 같다)
      case 'activate': return tabs.activate(c.id);
      case 'close': return tabs.close(c.id);
    }
  };
  ipcMain.on('human:command', onCommand);
  /** 주소창에 커서를 두고 글자를 모두 고른다(⌘L, 새 탭) */
  const focusAddress = () => {
    if (win.isDestroyed()) return;
    win.webContents.focus();
    win.webContents.send('human:focusAddress');
  };
  let lastBookmarks: BookmarkNode[] = [];
  const showBookmarks = (nodes: BookmarkNode[]) => {
    lastBookmarks = nodes;
    if (!win.isDestroyed()) win.webContents.send('human:bookmarks', nodes);
  };
  const activePage = () => {
    if (viewing !== null) return undefined;
    const s = tabs.state();
    const t = s.tabs.find((x) => x.id === s.activeId);
    if (!t || !t.url || t.url === 'about:blank') return undefined;
    return { url: t.url, title: t.title };
  };
  const openUrl = (url: string, newTab: boolean) => {
    if (viewing !== null) { setFollow(false); setViewing(null); }
    if (newTab || tabs.state().activeId === null) tabs.newTab(url);
    else tabs.navigate(url);
  };
  const toast = (text: string) => { if (!win.isDestroyed()) win.webContents.send('human:toast', text); };
  const runTab = (a: TabAction) => {
    // 새 탭·닫은 탭 다시 열기는 세션을 보는 중이어도 내 탭으로 돌아와서 한다(Chrome에서 새 탭은 언제나 된다)
    if (a === 'newTab' || a === 'reopenTab') {
      if (viewing !== null) { setFollow(false); setViewing(null); }
      if (a === 'newTab') { tabs.newTab(); focusAddress(); } else tabs.reopenClosed();
      return;
    }
    if (a === 'focusAddress') return focusAddress();
    // 세션을 보는 중에는 읽기 전용이다(E3): 나머지 탭 동작은 내 탭에도 그 세션에도 하지 않는다
    if (viewing !== null) return;
    if (typeof a === 'object') return tabs.activateNth(a.selectTab);
    switch (a) {
      case 'duplicateTab': return void tabs.duplicate();
      case 'closeTab': { const id = tabs.state().activeId; return id === null ? undefined : tabs.close(id); }
      case 'reload': return tabs.reload();
      case 'back': return tabs.back();
      case 'forward': return tabs.forward();
      case 'nextTab': return tabs.activateRelative(1);
      case 'prevTab': return tabs.activateRelative(-1);
    }
  };
  const showSessions = (list: SessionView[]) => {
    lastSessions = list;
    sendSessions();
    if (viewing !== null) sendToolbar(); // 보는 세션의 이름이 바뀌었을 수 있다
  };
  let lastApprovals: ApprovalView[] = [];
  /** 지금 보는 세션이 승인을 기다리면 따라 보기가 다른 세션으로 옮기지 않는다(사람이 답할 화면을 빼앗지 않게) */
  const holdForApproval = () => viewing !== null && lastApprovals.some((a) => a.sessionId === viewing);
  const showApprovals = (approvals: ApprovalView[]) => {
    lastApprovals = approvals;
    if (!win.isDestroyed()) win.webContents.send('human:approvals', approvals);
  };
  let lastTheme: ThemeMode | undefined;
  let lastUpdate: UpdateState = { state: 'none' };
  const showUpdate = (s: UpdateState) => {
    lastUpdate = s;
    if (!win.isDestroyed()) win.webContents.send('human:update', s);
  };
  const showTheme = (mode: ThemeMode) => {
    lastTheme = mode;
    if (!win.isDestroyed()) win.webContents.send('human:theme', mode);
  };
  win.webContents.on('did-finish-load', () => {
    sendToolbar();
    sendSessions();
    win.webContents.send('human:approvals', lastApprovals);
    if (lastTheme) win.webContents.send('human:theme', lastTheme);
    win.webContents.send('human:update', lastUpdate);
    win.webContents.send('human:bookmarks', lastBookmarks);
  });
  win.on('closed', () => ipcMain.off('human:command', onCommand));

  win.loadFile(uiPath).catch(() => undefined);
  tabs.newTab();
  return {
    win,
    tabs,
    showSessions,
    showApprovals,
    showTheme,
    showUpdate,
    runTab,
    showBookmarks,
    activePage,
    openUrl,
    toast,
    addSession: (sessionId, strip) => {
      sessions.set(sessionId, strip);
      lastMove.set(sessionId, moveOf(strip));
      restack(); // 첫 탭은 등록 전에 생겨 비켜 두지 못했다
      if (follow && !holdForApproval()) setViewing(sessionId);
    },
    removeSession: (sessionId) => {
      if (viewing === sessionId) setViewing(null);
      sessions.delete(sessionId);
      lastMove.delete(sessionId);
      restack(); // 남은 세션의 탭이 한 칸씩 당겨진다
    },
    sessionChanged: (sessionId) => {
      const strip = sessions.get(sessionId);
      if (strip) {
        const move = moveOf(strip);
        const moved = lastMove.get(sessionId) !== move;
        lastMove.set(sessionId, move);
        if (follow && moved && viewing !== sessionId && !holdForApproval()) return setViewing(sessionId);
      }
      if (viewing === sessionId) sendToolbar();
    },
    shown: () => {
      const { width, height } = win.getContentBounds();
      const content = { width, height };
      // 되돌림을 미뤄 둔 동안은 사람이 돌아왔을 때 키 입력이 갈 곳을 보인다
      const effective = restorePending && needsRestore() ? restoreTarget().id : focusedContentsId;
      const focusedUi = effective === win.webContents.id;
      if (viewing === null) return { view: 'human', contentsId: tabs.shownContentsId(), exposed, content, focusedContentsId: effective, focusedUi, windowFocused: win.isFocused(), offscreenFocusCount };
      return { view: 'session', sessionId: viewing, contentsId: sessions.get(viewing)?.shownContentsId(), exposed, content, focusedContentsId: effective, focusedUi, windowFocused: win.isFocused(), offscreenFocusCount };
    },
    restack,
    tabFocused,
    focusUi: () => {
      humanFocus = win.webContents;
      setImmediate(() => { if (!win.isDestroyed()) win.webContents.focus(); }); // 키 이벤트 안에서 바로 옮기면 먹히지 않는다(ADR-0009 3-1)
    },
    // 지금 보는 세션이 승인을 기다리면 다른 세션의 새 요청으로 화면을 옮기지 않는다(답할 화면을 빼앗지 않게, 카드 20261123-qa-followups Q2).
    // 새 요청은 승인 줄·알림·Dock으로 알린다
    attention: (sessionId) => { if (follow && sessions.has(sessionId) && (viewing === sessionId || !holdForApproval())) setViewing(sessionId); },
    showSession: (sessionId) => { if (sessions.has(sessionId)) setViewing(sessionId); },
  };
}
