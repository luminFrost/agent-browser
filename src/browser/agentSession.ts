import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { TabStrip } from './tabStrip';
import { targetIdOf } from './targetId';
import { SHARED_PARTITION } from '../shared/constants';
import { isAgentNavigable } from '../shared/url';
import type { TabStripState } from '../shared/tabState';

export interface AgentSession {
  sessionId: string;
  tabs: TabStrip;
  /** 이 세션의 탭 webContents id → CDP targetId */
  targetIds: Map<number, string>;
  /** 이 세션의 탭 webContents id. 탭이 생기는 즉시 들어간다(관문 판별용, targetId 알림을 기다리지 않는다) */
  contentsIds: Set<number>;
  /** 첫 탭의 targetId를 알린 뒤 그 targetId로 풀린다 */
  ready: Promise<string>;
  /** 새 탭을 만들고, 소유권을 알린 뒤 targetId를 돌려준다 */
  openTab(): Promise<string>;
  /** targetId로 탭 찾기(이 세션의 탭이 아니면 undefined) */
  tabIdOf(targetId: string): number | undefined;
  /** 세션을 끝낸다: 탭을 모두 닫고(탭마다 tabRemoved) closed를 알린다. 두 번 불러도 한 번만 한다 */
  close(): void;
}

export interface AgentSessionEvents {
  /** 탭 상태가 바뀜(지켜보기 패널·보는 화면용) */
  stateChanged(sessionId: string, state: TabStripState): void;
  /** 탭이 닫히기 직전(관문의 기다리는 요청 취소용) */
  tabClosing(contentsId: number): void;
  tabAdded(sessionId: string, targetId: string): void;
  tabRemoved(sessionId: string, targetId: string): void;
  /** 세션이 끝났다(close) */
  closed(sessionId: string): void;
  /** 탭 배치가 바뀌었다(사람 창이 보는 탭을 다시 맨 위로 올린다) */
  layoutChanged(): void;
  /** 탭이 키보드 포커스를 받았다 */
  tabFocused(view: WebContentsView): void;
  /** 지금 이 세션의 에이전트 입력(CDP Input.*)이 진행 중인가. 아니면 탭의 마우스 입력은 사람 것이라 막는다 */
  agentInputActive(sessionId: string): boolean;
  /** 사람 키 입력을 막았다(키보드 포커스를 사람 쪽으로 돌린다) */
  humanKeyBlocked(sessionId: string): void;
}

/** 세션 탭이 들어갈 사람 창의 자리(주소창 아래, 지켜보기 패널 왼쪽) */
export interface ContentArea {
  topInset: number;
  rightInset: number;
}

/**
 * 에이전트 세션 하나의 탭 묶음. 따로 창을 띄우지 않고 사람 창 안에 두며, 사람이 패널에서 고를 때만 보인다
 * (spec-embedded-sessions, ADR-0009). 사람 창과 같은 파티션을 써서 로그인을 공유한다. 탭은 에이전트가 CDP로 만든다.
 */
export function createAgentSession(sessionId: string, host: BrowserWindow, area: ContentArea, events: AgentSessionEvents): AgentSession {
  const targetIds = new Map<number, string>();
  const contentsIds = new Set<number>();
  /** webContents id → 소유권 알림이 끝나면 풀리는 약속 */
  const announced = new Map<number, Promise<string | undefined>>();

  const announce = (contents: WebContents) => {
    contentsIds.add(contents.id);
    // 에이전트 탭은 사람이 조작하지 않는다(보는 중 읽기 전용, 구석 1px 점). 카드 20261122-agent-input-lock
    // 마우스: CDP 입력도 같은 길로 오므로 에이전트 입력 중에만 통과시킨다. 키: CDP 키 입력은 이 이벤트를 거치지 않아 늘 막는다
    contents.on('before-mouse-event', (event) => { if (!events.agentInputActive(sessionId)) event.preventDefault(); });
    contents.on('before-input-event', (event) => { event.preventDefault(); events.humanKeyBlocked(sessionId); });
    const p = targetIdOf(contents).then((targetId) => {
      if (contents.isDestroyed()) return undefined;
      targetIds.set(contents.id, targetId);
      events.tabAdded(sessionId, targetId);
      return targetId;
    }).catch(() => undefined);
    announced.set(contents.id, p);
  };

  const tabs = new TabStrip(host, {
    partition: SHARED_PARTITION,
    topInset: area.topInset,
    rightInset: area.rightInset,
    shown: false,
    keepPainting: true, // 사람이 다른 세션이나 내 탭을 보는 동안에도 에이전트가 조작할 수 있게(E4)
    onChange: (state) => events.stateChanged(sessionId, state),
    onTabCreated: announce,
    onLayout: () => events.layoutChanged(),
    followResize: false, // 사람 창이 크기 변화를 한 번 받아 모든 세션을 다시 놓는다
    onTabFocus: (view) => events.tabFocused(view),
    allowNavigation: isAgentNavigable,
    onTabClosing: (contentsId) => {
      contentsIds.delete(contentsId);
      events.tabClosing(contentsId);
      const targetId = targetIds.get(contentsId);
      if (!targetId) return;
      targetIds.delete(contentsId);
      events.tabRemoved(sessionId, targetId);
    },
  });
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
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    tabs.destroy(); // 탭마다 tabRemoved를 알린다
    events.closed(sessionId);
  };
  const ready = openTab();
  return { sessionId, tabs, targetIds, contentsIds, ready, openTab, tabIdOf, close };
}
