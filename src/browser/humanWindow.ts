import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { TabStrip } from './tabStrip';
import { SHARED_PARTITION } from '../shared/constants';
import type { HumanCommand } from '../shared/tabState';

/** 주소창 + 탭 막대 높이(px). renderer/human/human.css의 --toolbar-height와 같아야 한다 */
const TOOLBAR_HEIGHT = 76;

export interface HumanWindow {
  win: BrowserWindow;
  tabs: TabStrip;
}

export function createHumanWindow(show: boolean): HumanWindow {
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
    }
  };
  ipcMain.on('human:command', onCommand);
  win.webContents.on('did-finish-load', () => win.webContents.send('human:state', tabs.state()));
  win.on('closed', () => ipcMain.off('human:command', onCommand));

  win.loadFile(join(__dirname, 'renderer', 'human', 'index.html')).catch(() => undefined);
  tabs.newTab();
  return { win, tabs };
}
