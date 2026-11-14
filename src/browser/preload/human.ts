import { contextBridge, ipcRenderer } from 'electron';
import type { HumanCommand, SessionView, TabStripState } from '../../shared/tabState';
import type { ApprovalView } from '../../shared/approval';

// 샌드박스 preload: 사람 창 UI가 쓸 수 있는 명령만 연다.
contextBridge.exposeInMainWorld('humanApi', {
  command: (c: HumanCommand) => ipcRenderer.send('human:command', c),
  onState: (listener: (s: TabStripState) => void) => {
    ipcRenderer.on('human:state', (_e, s: TabStripState) => listener(s));
  },
  onSessions: (listener: (s: SessionView[]) => void) => {
    ipcRenderer.on('human:sessions', (_e, s: SessionView[]) => listener(s));
  },
  onApprovals: (listener: (a: ApprovalView[]) => void) => {
    ipcRenderer.on('human:approvals', (_e, a: ApprovalView[]) => listener(a));
  },
});
