import { contextBridge, ipcRenderer } from 'electron';
import type { TabStripState } from '../../shared/tabState';

const SESSION_FLAG = '--ab-session=';
const sessionId = process.argv.find((a) => a.startsWith(SESSION_FLAG))?.slice(SESSION_FLAG.length) ?? '';

// 에이전트 창 머리줄은 보기 전용이다. 명령을 보내는 API는 열지 않는다.
contextBridge.exposeInMainWorld('agentApi', {
  sessionId,
  onState: (listener: (s: TabStripState) => void) => {
    ipcRenderer.on('agent:state', (_e, s: TabStripState) => listener(s));
  },
});
