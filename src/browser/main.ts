import { app, BrowserWindow, Menu, nativeTheme, Notification, session, type MenuItem } from 'electron';
import { appMenuTemplate, themeMenuId } from './appMenu';
import { readSettings, writeSettings, THEME_MODES, type ThemeMode } from './settings';
import { cleanLabel } from '../shared/label';
import { CONTENT_AREA, createHumanWindow, type HumanWindow } from './humanWindow';
import { createAgentSession, type AgentSession } from './agentSession';
import { DOWNLOADS_FLAG, HIDDEN_FLAG, SHARED_PARTITION, USER_DATA_FLAG } from '../shared/constants';
import { ApprovalQueue, approvalNotice, approvalTimeoutMs } from './gate/approvals';
import { AgentInputGate, AGENT_INPUT_GRACE_MS } from './agentInput';
import { installFormGate } from './gate/formGate';
import { installDownloadGate } from './gate/downloadGate';
import { startUpdater, type Updater } from './updater';
import { join } from 'node:path';
import type { BrowserReply, LauncherToBrowser, WindowInfo } from '../shared/ipc';

const QUARANTINE_DIR_NAME = 'quarantine';

const userDataArg = process.argv.find((a) => a.startsWith(USER_DATA_FLAG));
if (!userDataArg || typeof process.send !== 'function') {
  // 런처 없이 직접 실행하면 CDP 파이프가 없어 에이전트를 붙일 수 없다.
  console.error('agent-browser: 런처(startApp)로 실행해야 한다');
  process.exit(1);
}
app.setPath('userData', userDataArg.slice(USER_DATA_FLAG.length));
const showWindows = !process.argv.includes(HIDDEN_FLAG);

const send = (m: BrowserReply, rid?: number) => process.send?.({ ...m, rid });
let human: HumanWindow | undefined;
/** 앱 안 업데이트(카드 20261123-update-notice). 사람 창이 생긴 뒤 시작한다 */
let updater: Updater | undefined;
const agents = new Map<string, AgentSession>();
/**
 * 승인 요청(R12·R13). 새 요청이 오면 알리고(알림·Dock 배지), 따라 보기가 켜져 있으면 그 세션을 보인다.
 * 답이 없으면 정한 시간 뒤 거부로 끝난다(카드 20261122-approval-attention)
 */
/** 에이전트 입력(CDP Input.*) 중인 세션. 그때만 그 세션 탭의 마우스를 통과시킨다(카드 20261122-agent-input-lock) */
const agentInput = new AgentInputGate(AGENT_INPUT_GRACE_MS);
let badge = 0;
let notices = 0;
/** 알림 대신 Dock을 튀긴 수, 알림이 표시되지 못한 수(P6. Electron 42부터 macOS 알림은 서명된 앱에서만 보이고 아니면 failed가 온다) */
let bounces = 0;
let noticeFailures = 0;
const approvals = new ApprovalQueue((views) => {
  human?.showApprovals(views);
  badge = views.length;
  app.setBadgeCount(badge); // 지원하지 않는 곳(일부 Linux)에서는 false를 돌려줄 뿐이다
}, {
  timeoutMs: approvalTimeoutMs(process.env),
  onAdded: (view) => {
    notices++;
    human?.attention(view.sessionId);
    bounces++;
    app.dock?.bounce('informational'); // 알림이 막혀도 보이는 신호. macOS 밖에서는 dock이 없다
    if (!Notification.isSupported()) return;
    const note = new Notification({ ...approvalNotice(view, labels.get(view.sessionId)), silent: false });
    note.on('click', () => {
      bringHumanToFront();
      human?.showSession(view.sessionId);
    });
    note.on('failed', () => { noticeFailures++; });
    note.show();
  },
});

/** 이 webContents가 어느 세션의 탭인가(사람 창이면 undefined) */
const sessionOfContents = (contentsId: number): string | undefined => {
  for (const a of agents.values()) if (a.contentsIds.has(contentsId)) return a.sessionId;
  return undefined;
};

/** OS 창은 사람 창 하나뿐이다. 세션은 사람 창 안에 있다(spec-embedded-sessions E1) */
const listWindows = (): WindowInfo[] => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => ({ kind: w === human?.win ? 'human' : 'other' }));

/** 왼쪽 영역에 보이는 탭을 targetId로 알린다(테스트·진단용) */
const shownTab = (): BrowserReply => {
  if (!human) return { type: 'error', message: '사람 창이 없다' };
  const s = human.shown();
  const focused = s.focusedContentsId;
  const focusedSession = focused === undefined ? null : [...agents.values()].find((a) => a.contentsIds.has(focused))?.sessionId ?? null;
  if (s.view === 'human') return { type: 'shownTab', view: 'human', exposed: s.exposed, content: s.content, focusedSession, focusedUi: s.focusedUi, windowFocused: s.windowFocused, offscreenFocusCount: s.offscreenFocusCount };
  const targetId = s.contentsId === undefined ? undefined : agents.get(s.sessionId)?.targetIds.get(s.contentsId);
  return { type: 'shownTab', view: 'session', sessionId: s.sessionId, ...(targetId ? { targetId } : {}), exposed: s.exposed, content: s.content, focusedSession, focusedUi: s.focusedUi, windowFocused: s.windowFocused, offscreenFocusCount: s.offscreenFocusCount };
};

/** 사람 창의 지켜보기 패널에 세션과 탭 URL을 보인다(R11) */
/** 세션 이름(카드 20261120-session-labels). 런처가 정한 이름으로 시작하고 사람이 패널에서 바꿀 수 있다 */
const labels = new Map<string, string>();

const refreshPanel = () => {
  human?.showSessions([...agents.values()].map((a) => {
    const state = a.tabs.state();
    const label = labels.get(a.sessionId);
    return { sessionId: a.sessionId, tabs: state.tabs, activeId: state.activeId, ...(label !== undefined ? { label } : {}) };
  }));
};

const agentOf = (sessionId: string): AgentSession => {
  const agent = agents.get(sessionId);
  if (!agent) throw new Error(`없는 세션: ${sessionId}`);
  return agent;
};

/**
 * 화면 모드(카드 20261123-theme-mode). nativeTheme.themeSource가 사람 창 UI와 탭 안 웹 페이지의 prefers-color-scheme을
 * 함께 정한다(Chrome의 기기·밝게·어둡게와 같다). 메뉴의 체크와 패널 선택을 같은 값으로 다시 그린다
 */
let theme: ThemeMode = 'system';
const applyTheme = (mode: ThemeMode) => {
  theme = mode;
  nativeTheme.themeSource = mode;
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(process.platform, app.getName(), { current: mode, pick: setTheme })));
  human?.showTheme(mode);
};
/** 사람이 패널이나 메뉴에서 모드를 골랐다. 바로 바꾸고 settings.json에 남긴다 */
const setTheme = (mode: ThemeMode) => {
  if (mode === theme) return;
  applyTheme(mode);
  const dir = app.getPath('userData');
  writeSettings(dir, { ...readSettings(dir), theme: mode });
};

const handle = async (m: LauncherToBrowser): Promise<BrowserReply | undefined> => {
  switch (m.type) {
    case 'quit':
      // 로그인(쿠키)을 잃지 않게 디스크에 쓰고 끝낸다(R2: 다시 켜도 유지)
      await session.fromPartition(SHARED_PARTITION).cookies.flushStore().catch(() => undefined);
      app.quit();
      return undefined;
    case 'listWindows':
      return { type: 'windows', windows: listWindows() };
    case 'listSessions':
      return { type: 'sessions', sessionIds: [...agents.keys()] };
    case 'shownTab':
      return shownTab();
    case 'attention':
      return { type: 'attention', badge, notices, bounces, noticeFailures };
    case 'menu': {
      // 앱 메뉴에 든 항목의 역할(시험·진단용, 카드 20261123-qa-followups Q5)
      const roles: string[] = [];
      const walk = (items: MenuItem[]) => { for (const i of items) { if (i.role) roles.push(String(i.role).toLowerCase()); if (i.submenu) walk(i.submenu.items); } };
      walk(Menu.getApplicationMenu()?.items ?? []);
      return { type: 'menu', roles };
    }
    case 'theme': {
      const menu = Menu.getApplicationMenu();
      const menuChecked = THEME_MODES.find((mode) => menu?.getMenuItemById(themeMenuId(mode))?.checked) ?? null;
      return { type: 'theme', source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors, menuChecked };
    }
    case 'update': {
      const s = updater?.state() ?? { state: 'none' };
      return { type: 'update', ...s };
    }
    case 'clickMenu': {
      const item = Menu.getApplicationMenu()?.getMenuItemById(m.id);
      if (!item) return { type: 'error', message: `없는 메뉴 항목: ${m.id}` };
      item.click();
      return { type: 'done' };
    }
    case 'agentInput':
      if (m.on) agentInput.begin(m.sessionId, m.inputId); else agentInput.end(m.sessionId, m.inputId);
      return { type: 'done' };
    case 'simulateHumanInput': {
      // 시험용: OS 입력과 같은 경로(sendInputEvent)로 사람 입력을 흉내 낸다. 에이전트(CDP)는 이 명령을 쓸 수 없다(런처 ipc 전용)
      const agent = agentOf(m.sessionId);
      const view = agent.tabs.shownView() ?? agent.tabs.parkedView();
      if (!view) return { type: 'error', message: '이 세션에 보이거나 비켜 둔 탭이 없다' };
      const c = view.webContents;
      c.sendInputEvent({ type: 'mouseMove', x: m.x, y: m.y });
      c.sendInputEvent({ type: 'mouseDown', x: m.x, y: m.y, button: 'left', clickCount: 1 });
      c.sendInputEvent({ type: 'mouseUp', x: m.x, y: m.y, button: 'left', clickCount: 1 });
      for (const ch of m.text) {
        c.sendInputEvent({ type: 'keyDown', keyCode: ch });
        c.sendInputEvent({ type: 'char', keyCode: ch });
        c.sendInputEvent({ type: 'keyUp', keyCode: ch });
      }
      return { type: 'done' };
    }
    case 'focus':
      bringHumanToFront();
      return { type: 'done' };
    case 'createSession': {
      if (agents.has(m.sessionId)) return { type: 'error', message: `이미 있는 세션: ${m.sessionId}` };
      if (!human || human.win.isDestroyed()) return { type: 'error', message: '사람 창이 없다' };
      if (m.label !== undefined) labels.set(m.sessionId, m.label);
      const host = human;
      // 세션마다 창을 띄우지 않고 사람 창 안에 탭 묶음을 둔다(spec-embedded-sessions, ADR-0009)
      const agent = createAgentSession(m.sessionId, host.win, CONTENT_AREA, {
        stateChanged: (sessionId) => { refreshPanel(); host.sessionChanged(sessionId); },
        tabClosing: (contentsId) => approvals.cancelContents(contentsId),
        tabAdded: (sessionId, targetId) => send({ type: 'tabAdded', sessionId, targetId }),
        tabRemoved: (sessionId, targetId) => send({ type: 'tabRemoved', sessionId, targetId }),
        closed: (sessionId) => {
          agents.delete(sessionId);
          agentInput.clear(sessionId);
          labels.delete(sessionId);
          host.removeSession(sessionId);
          send({ type: 'sessionClosed', sessionId }); // 사람이 패널에서 멈춘 경우도 런처가 세션을 끝낸다(R9)
          refreshPanel();
        },
        layoutChanged: () => host.restack(),
        tabFocused: (view) => host.tabFocused(view),
        agentInputActive: (sessionId) => agentInput.allows(sessionId),
        humanKeyBlocked: () => host.focusUi(),
      });
      agents.set(m.sessionId, agent);
      host.addSession(m.sessionId, agent.tabs);
      refreshPanel();
      const targetId = await agent.ready; // 첫 탭의 tabAdded가 sessionCreated보다 먼저 가게 한다
      return { type: 'sessionCreated', sessionId: m.sessionId, targetId };
    }
    case 'newTab': {
      const agent = agentOf(m.sessionId);
      const targetId = await agent.openTab(); // 이동은 런처가 범위에 반영한 뒤 navigateTab으로 한다
      return { type: 'tabCreated', targetId };
    }
    case 'navigateTab': {
      const agent = agentOf(m.sessionId);
      const tabId = agent.tabIdOf(m.targetId);
      if (tabId === undefined) return { type: 'error', message: '이 세션의 탭이 아니다' };
      agent.tabs.navigate(m.url, tabId);
      return { type: 'done' };
    }
    case 'closeTab': {
      const agent = agentOf(m.sessionId);
      const tabId = agent.tabIdOf(m.targetId);
      if (tabId === undefined) return { type: 'error', message: '이 세션의 탭이 아니다' };
      agent.tabs.close(tabId);
      return { type: 'done' };
    }
    case 'closeSession': {
      agents.get(m.sessionId)?.close();
      return { type: 'done' };
    }
    case 'activateTab': {
      const agent = agentOf(m.sessionId);
      const tabId = agent.tabIdOf(m.targetId);
      if (tabId === undefined) return { type: 'error', message: '이 세션의 탭이 아니다' };
      agent.tabs.activate(tabId);
      return { type: 'done' };
    }
  }
};

process.on('message', (m: LauncherToBrowser) => {
  handle(m).then(
    (reply) => { if (reply) send(reply, m.rid); },
    (e: unknown) => send({ type: 'error', message: e instanceof Error ? e.message : String(e) }, m.rid),
  );
});
// 런처가 죽으면 같이 끝난다. 에이전트가 붙을 길이 없는 브라우저를 남기지 않는다.
// 준비 전에는 app.quit()이 듣지 않아(카드 20261122-start-signal) 바로 끝낸다
process.on('disconnect', () => (app.isReady() ? app.quit() : app.exit(0)));

// 사람 창을 닫으면 앱을 끝낸다. 지켜보기·관문이 사람 창에 있으므로 사람 창 없이 에이전트만 돌게 두지 않는다.
app.on('window-all-closed', () => app.quit());

/** 앱을 다시 열면(Dock·Finder → activate, 두 번째 실행 → 런처의 focus) 사람 창을 앞으로 가져온다 */
const bringHumanToFront = () => {
  if (!human || human.win.isDestroyed() || !showWindows) return;
  if (human.win.isMinimized()) human.win.restore();
  human.win.show();
  app.focus({ steal: true });
};
app.on('activate', bringHumanToFront);

app.whenReady().then(() => {
  applyTheme(readSettings(app.getPath('userData')).theme);
  const shared = session.fromPartition(SHARED_PARTITION);
  // 사이트의 권한 요청(카메라·위치·알림 등)은 기본적으로 거부한다(spec 제약).
  shared.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  shared.setPermissionCheckHandler(() => false);
  installFormGate(shared, sessionOfContents, approvals);
  installDownloadGate(shared, {
    sessionOf: sessionOfContents,
    isHuman: (contentsId) => human?.tabs.webContentsIds.includes(contentsId) ?? false,
  }, approvals, {
    downloadsDir: process.argv.find((a) => a.startsWith(DOWNLOADS_FLAG))?.slice(DOWNLOADS_FLAG.length) ?? app.getPath('downloads'),
    quarantineDir: join(app.getPath('userData'), QUARANTINE_DIR_NAME),
  });

  human = createHumanWindow(showWindows, {
    stopSession: (sessionId) => send({ type: 'stopRequested', sessionId }),
    decide: (id, allow) => approvals.decide(id, allow),
    renameSession: (sessionId, raw) => {
      const label = cleanLabel(raw);
      if (!agents.has(sessionId) || label === undefined) return; // 빈 이름이면 그대로 둔다
      labels.set(sessionId, label);
      send({ type: 'sessionLabel', sessionId, label });
      refreshPanel();
    },
    setTheme,
    installUpdate: () => updater?.install(),
  }, {
    initial: readSettings(app.getPath('userData')).followAgents,
    save: (on) => writeSettings(app.getPath('userData'), { ...readSettings(app.getPath('userData')), followAgents: on }),
  });
  human.showTheme(theme);
  // 업데이트를 누르면 설치 스크립트를 띄운 뒤 끝난다. 끝내기 전에 쿠키를 디스크에 쓴다(quit 명령과 같다)
  updater = startUpdater(readSettings(app.getPath('userData')).updateCheck, (s) => human?.showUpdate(s), () => {
    void session.fromPartition(SHARED_PARTITION).cookies.flushStore().catch(() => undefined).then(() => app.quit());
  });
  human.win.on('closed', () => {
    human = undefined;
    app.quit();
  });
  send({ type: 'ready' });
});
