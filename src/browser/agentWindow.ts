import { BrowserWindow, type WebContents } from 'electron';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { targetIdOf } from './targetId';
import { SHARED_PARTITION } from '../shared/constants';
import type { TabStripState } from '../shared/tabState';

/** 에이전트 창 머리줄 높이(px). renderer/agent/agent.css의 --header-height와 같아야 한다 */
const HEADER_HEIGHT = 36;

export interface AgentWindow {
  sessionId: string;
  win: BrowserWindow;
  tabs: TabStrip;
  /** 이 창의 탭 webContents id → CDP targetId */
  targetIds: Map<number, string>;
  /** 첫 탭의 targetId를 알린 뒤 그 targetId로 풀린다 */
  ready: Promise<string>;
  /** 새 탭을 만들고, 소유권을 알린 뒤 targetId를 돌려준다 */
  openTab(): Promise<string>;
  /** targetId로 탭 찾기(이 창의 탭이 아니면 undefined) */
  tabIdOf(targetId: string): number | undefined;
}

export interface AgentWindowEvents {
  /** 탭 상태가 바뀜(지켜보기 패널용) */
  stateChanged(sessionId: string, state: TabStripState): void;
  tabAdded(sessionId: string, targetId: string): void;
  tabRemoved(sessionId: string, targetId: string): void;
}

/**
 * 에이전트 세션 하나의 창. 사람 창과 같은 파티션을 써서 로그인을 공유한다.
 * 사람은 보기만 한다(주소창 없음). 탭은 에이전트가 CDP로 만든다.
 */
export function createAgentWindow(sessionId: string, show: boolean, events: AgentWindowEvents): AgentWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show,
    title: `에이전트 세션 ${sessionId}`,
    webPreferences: { preload: join(__dirname, 'preload', 'agent.js'), sandbox: true, contextIsolation: true, additionalArguments: [`--ab-session=${sessionId}`] },
  });
  const targetIds = new Map<number, string>();
  /** webContents id → 소유권 알림이 끝나면 풀리는 약속 */
  const announced = new Map<number, Promise<string | undefined>>();

  const announce = (contents: WebContents) => {
    const p = targetIdOf(contents).then((targetId) => {
      if (contents.isDestroyed()) return undefined;
      targetIds.set(contents.id, targetId);
      events.tabAdded(sessionId, targetId);
      return targetId;
    }).catch(() => undefined);
    announced.set(contents.id, p);
  };

  const tabs = new TabStrip(win, {
    partition: SHARED_PARTITION,
    topInset: HEADER_HEIGHT,
    onChange: (state) => {
      win.webContents.send('agent:state', state);
      events.stateChanged(sessionId, state);
    },
    onTabCreated: announce,
    onTabClosing: (contents) => {
      const targetId = targetIds.get(contents.id);
      if (!targetId) return;
      targetIds.delete(contents.id);
      events.tabRemoved(sessionId, targetId);
    },
  });
  win.webContents.on('did-finish-load', () => win.webContents.send('agent:state', tabs.state()));
  win.on('close', () => tabs.destroy()); // 창을 닫으면 탭마다 tabRemoved를 알린다
  win.loadFile(join(__dirname, 'renderer', 'agent', 'index.html')).catch(() => undefined);
  const openTab = async () => {
    const id = tabs.newTab('about:blank');
    const contents = tabs.contentsOf(id);
    const targetId = contents ? await announced.get(contents.id) : undefined;
    if (!targetId) throw new Error('새 탭의 targetId를 알아내지 못했다');
    return targetId;
  };
  const tabIdOf = (targetId: string) => {
    for (const [contentsId, t] of targetIds) if (t === targetId) return tabs.idOfContents(contentsId);
    return undefined;
  };
  const ready = openTab();
  return { sessionId, win, tabs, targetIds, ready, openTab, tabIdOf };
}
