import { contextBridge, ipcRenderer } from 'electron';
import type { HumanCommand, HumanToolbarState, SessionView } from '../../shared/tabState';
import type { ApprovalView } from '../../shared/approval';

// 샌드박스 preload: 사람 창 UI가 쓸 수 있는 명령만 연다. UI 파일이 아닌 페이지(이 자리에 다른 페이지가 들어온 경우)에는
// 열지 않는다(카드 20261122-human-ui-guard G4). main도 보낸 프레임 주소를 다시 본다
const isHumanUi = location.protocol === 'file:' && location.pathname.endsWith('/renderer/human/index.html');
if (isHumanUi) contextBridge.exposeInMainWorld('humanApi', {
  command: (c: HumanCommand) => ipcRenderer.send('human:command', c),
  onState: (listener: (s: HumanToolbarState) => void) => {
    ipcRenderer.on('human:state', (_e, s: HumanToolbarState) => listener(s));
  },
  onSessions: (listener: (s: { sessions: SessionView[]; viewing: string | null; follow: boolean }) => void) => {
    ipcRenderer.on('human:sessions', (_e, s: { sessions: SessionView[]; viewing: string | null; follow: boolean }) => listener(s));
  },
  onApprovals: (listener: (a: ApprovalView[]) => void) => {
    ipcRenderer.on('human:approvals', (_e, a: ApprovalView[]) => listener(a));
  },
});
