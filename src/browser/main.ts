import { app, session } from 'electron';
import { createHumanWindow, type HumanWindow } from './humanWindow';
import { createAgentWindow, type AgentWindow } from './agentWindow';
import { SHARED_PARTITION } from '../shared/constants';
import { ApprovalQueue } from './gate/approvals';
import { installFormGate } from './gate/formGate';
import { installDownloadGate } from './gate/downloadGate';
import { join } from 'node:path';
import type { BrowserReply, LauncherToBrowser, WindowInfo } from '../shared/ipc';

const USER_DATA_FLAG = '--ab-user-data=';
const HIDDEN_FLAG = '--ab-hidden';
const DOWNLOADS_FLAG = '--ab-downloads=';
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
const agents = new Map<string, AgentWindow>();
const approvals = new ApprovalQueue((views) => human?.showApprovals(views));

/** 이 webContents가 어느 세션의 탭인가(사람 창이면 undefined) */
const sessionOfContents = (contentsId: number): string | undefined => {
  for (const a of agents.values()) if (a.contentsIds.has(contentsId)) return a.sessionId;
  return undefined;
};

const listWindows = (): WindowInfo[] => [
  ...(human && !human.win.isDestroyed() ? [{ kind: 'human' as const }] : []),
  ...[...agents.keys()].map((sessionId) => ({ kind: 'agent' as const, sessionId })),
];

/** 사람 창의 지켜보기 패널에 세션과 탭 URL을 보인다(R11) */
const refreshPanel = () => {
  human?.showSessions([...agents.values()].map((a) => {
    const state = a.tabs.state();
    return { sessionId: a.sessionId, tabs: state.tabs, activeId: state.activeId };
  }));
};

const agentOf = (sessionId: string): AgentWindow => {
  const agent = agents.get(sessionId);
  if (!agent) throw new Error(`없는 세션: ${sessionId}`);
  return agent;
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
    case 'createSession': {
      if (agents.has(m.sessionId)) return { type: 'error', message: `이미 있는 세션: ${m.sessionId}` };
      const agent = createAgentWindow(m.sessionId, showWindows, {
        stateChanged: () => refreshPanel(),
        tabClosing: (contentsId) => approvals.cancelContents(contentsId),
        tabAdded: (sessionId, targetId) => send({ type: 'tabAdded', sessionId, targetId }),
        tabRemoved: (sessionId, targetId) => send({ type: 'tabRemoved', sessionId, targetId }),
      });
      agents.set(m.sessionId, agent);
      agent.win.on('closed', () => {
        agents.delete(m.sessionId);
        send({ type: 'sessionClosed', sessionId: m.sessionId }); // 사람이 창을 닫은 경우도 런처가 세션을 끝낸다(R9)
        refreshPanel();
      });
      const targetId = await agent.ready; // 첫 탭의 tabAdded가 sessionCreated보다 먼저 가게 한다
      return { type: 'sessionCreated', sessionId: m.sessionId, targetId };
    }
    case 'newTab': {
      const agent = agentOf(m.sessionId);
      const targetId = await agent.openTab();
      if (m.url && m.url !== 'about:blank') agent.tabs.navigate(m.url, agent.tabIdOf(targetId));
      return { type: 'tabCreated', targetId };
    }
    case 'closeTab': {
      const agent = agentOf(m.sessionId);
      const tabId = agent.tabIdOf(m.targetId);
      if (tabId === undefined) return { type: 'error', message: '이 세션의 탭이 아니다' };
      agent.tabs.close(tabId);
      return { type: 'done' };
    }
    case 'closeSession': {
      const agent = agents.get(m.sessionId);
      if (agent && !agent.win.isDestroyed()) agent.win.close();
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
process.on('disconnect', () => app.quit());

// 사람 창을 닫으면 앱을 끝낸다. 지켜보기·관문이 사람 창에 있으므로 사람 창 없이 에이전트만 돌게 두지 않는다.
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
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
  });
  human.win.on('closed', () => {
    human = undefined;
    app.quit();
  });
  send({ type: 'ready' });
});
