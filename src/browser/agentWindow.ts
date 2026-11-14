import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { SHARED_PARTITION } from '../shared/constants';

/** 에이전트 창 머리줄 높이(px). renderer/agent/agent.css의 --header-height와 같아야 한다 */
const HEADER_HEIGHT = 36;

export interface AgentWindow {
  sessionId: string;
  win: BrowserWindow;
  tabs: TabStrip;
}

/**
 * 에이전트 세션 하나의 창. 사람 창과 같은 파티션을 써서 로그인을 공유한다.
 * 사람은 보기만 한다(주소창 없음). 탭은 에이전트가 CDP로 만든다.
 */
export function createAgentWindow(sessionId: string, show: boolean): AgentWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show,
    title: `에이전트 세션 ${sessionId}`,
    webPreferences: { preload: join(__dirname, 'preload', 'agent.js'), sandbox: true, contextIsolation: true, additionalArguments: [`--ab-session=${sessionId}`] },
  });
  const tabs = new TabStrip(win, {
    partition: SHARED_PARTITION,
    topInset: HEADER_HEIGHT,
    onChange: (state) => win.webContents.send('agent:state', state),
  });
  win.webContents.on('did-finish-load', () => win.webContents.send('agent:state', tabs.state()));
  win.loadFile(join(__dirname, 'renderer', 'agent', 'index.html')).catch(() => undefined);
  tabs.newTab('about:blank');
  return { sessionId, win, tabs };
}
