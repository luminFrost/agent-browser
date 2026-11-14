import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { SHARED_PARTITION } from '../shared/constants';
import type { HumanCommand, SessionView } from '../shared/tabState';
import type { ApprovalView } from '../shared/approval';

/** 주소창 + 탭 막대 높이(px). renderer/human/human.css의 --toolbar-height와 같아야 한다 */
const TOOLBAR_HEIGHT = 76;
/** 지켜보기 패널 너비(px). renderer/human/human.css의 --panel-width와 같아야 한다 */
const PANEL_WIDTH = 280;

export interface HumanWindow {
  win: BrowserWindow;
  tabs: TabStrip;
  /** 지켜보기 패널을 다시 그린다 */
  showSessions(sessions: SessionView[]): void;
  /** 승인 요청 목록을 다시 그린다 */
  showApprovals(approvals: ApprovalView[]): void;
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
  const tabs = new TabStrip(win, {
    partition: SHARED_PARTITION,
    topInset: TOOLBAR_HEIGHT,
    rightInset: PANEL_WIDTH,
    onChange: (state) => win.webContents.send('human:state', state),
  });

  const onCommand = (event: Electron.IpcMainEvent, c: HumanCommand) => {
    if (event.sender !== win.webContents) return; // 사람 창 UI가 보낸 것만 받는다
    switch (c.cmd) {
      case 'navigate': return tabs.navigate(c.input);
      case 'back': return tabs.back();
      case 'forward': return tabs.forward();
      case 'reload': return tabs.reload();
      case 'newTab': return void tabs.newTab();
      case 'activate': return tabs.activate(c.id);
      case 'close': return tabs.close(c.id);
      case 'stopSession': return events.stopSession(c.sessionId);
      case 'decide': return events.decide(c.id, c.allow);
    }
  };
  ipcMain.on('human:command', onCommand);
  let lastSessions: SessionView[] = [];
  const showSessions = (sessions: SessionView[]) => {
    lastSessions = sessions;
    if (!win.isDestroyed()) win.webContents.send('human:sessions', sessions);
  };
  let lastApprovals: ApprovalView[] = [];
  const showApprovals = (approvals: ApprovalView[]) => {
    lastApprovals = approvals;
    if (!win.isDestroyed()) win.webContents.send('human:approvals', approvals);
  };
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('human:state', tabs.state());
    win.webContents.send('human:sessions', lastSessions);
    win.webContents.send('human:approvals', lastApprovals);
  });
  win.on('closed', () => ipcMain.off('human:command', onCommand));

  win.loadFile(join(__dirname, 'renderer', 'human', 'index.html')).catch(() => undefined);
  tabs.newTab();
  return { win, tabs, showSessions, showApprovals };
}
