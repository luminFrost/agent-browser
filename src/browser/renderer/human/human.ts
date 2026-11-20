// 사람 창 UI (주소창·탭 막대). 모듈이 아닌 스크립트로 읽힌다.
interface HumanTabView { id: number; title: string; url: string; loading: boolean }
/** viewing이 있으면 그 세션의 탭을 보는 중이다(읽기 전용, spec-embedded-sessions) */
interface HumanState { tabs: HumanTabView[]; activeId: number | null; canGoBack: boolean; canGoForward: boolean; viewing: string | null }
interface HumanApprovalView { id: string; sessionId: string; host: string; kind: 'form' | 'download'; detail?: string }
interface HumanSessionView { sessionId: string; tabs: HumanTabView[]; activeId: number | null }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 전역 Window 확장(preload가 연 humanApi)이라 선언만 있다
interface Window {
  humanApi: {
    command(c: { cmd: string; [k: string]: unknown }): void;
    onState(listener: (s: HumanState) => void): void;
    onSessions(listener: (s: { sessions: HumanSessionView[]; viewing: string | null; follow: boolean }) => void): void;
    onApprovals(listener: (a: HumanApprovalView[]) => void): void;
  };
}

{
  const api = window.humanApi;
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const address = byId<HTMLInputElement>('address');
  const tabsEl = byId<HTMLDivElement>('tabs');
  const loading = byId<HTMLSpanElement>('loading');
  const back = byId<HTMLButtonElement>('back');
  const forward = byId<HTMLButtonElement>('forward');
  const reload = byId<HTMLButtonElement>('reload');
  const newTab = byId<HTMLButtonElement>('new-tab');
  const viewingEl = byId<HTMLDivElement>('viewing');
  const viewEmpty = byId<HTMLParagraphElement>('view-empty');
  let viewing: string | null = null;

  byId<HTMLFormElement>('nav').addEventListener('submit', (e) => {
    e.preventDefault();
    if (viewing !== null) return; // 세션을 보는 중에는 이동하지 않는다(main도 막는다)
    api.command({ cmd: 'navigate', input: address.value });
    address.blur();
  });
  back.addEventListener('click', () => api.command({ cmd: 'back' }));
  forward.addEventListener('click', () => api.command({ cmd: 'forward' }));
  reload.addEventListener('click', () => api.command({ cmd: 'reload' }));
  newTab.addEventListener('click', () => api.command({ cmd: 'newTab' }));
  // 이 화면 크기 = 창 내용 크기. resize 이벤트 없이 바뀌는 때(Linux 메뉴 막대)가 있어 여기서 알린다(ADR-0009)
  window.addEventListener('resize', () => api.command({ cmd: 'relayout' }));
  api.command({ cmd: 'relayout' });
  viewingEl.querySelector('.back-to-own')?.addEventListener('click', () => api.command({ cmd: 'view', sessionId: null }));

  api.onState((s) => {
    // 보기 대상이 바뀌면(세션 ↔ 내 탭) 주소창에 남은 값·포커스를 버린다. 끝난 세션 주소로 내 탭이 이동하지 않게
    const switched = viewing !== s.viewing;
    viewing = s.viewing;
    if (switched) address.blur();
    document.body.classList.toggle('viewing', viewing !== null);
    viewingEl.hidden = viewing === null;
    (viewingEl.querySelector('.label') as HTMLSpanElement).textContent = viewing === null ? '' : `세션 ${viewing} 보는 중`;
    address.readOnly = viewing !== null;
    reload.disabled = viewing !== null;
    newTab.disabled = viewing !== null;
    viewEmpty.hidden = viewing === null || s.tabs.length > 0;
    tabsEl.replaceChildren(...s.tabs.map((t) => {
      const el = document.createElement('div');
      el.className = 'tab' + (t.id === s.activeId ? ' active' : '');
      el.dataset.id = String(t.id);
      el.dataset.title = t.title;
      el.title = t.url;
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = t.title || t.url || '새 탭';
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = '×';
      close.title = '탭 닫기';
      close.addEventListener('click', (e) => { e.stopPropagation(); api.command({ cmd: 'close', id: t.id }); });
      el.append(title, close);
      el.addEventListener('click', () => api.command({ cmd: 'activate', id: t.id }));
      return el;
    }));
    const active = s.tabs.find((t) => t.id === s.activeId);
    if (switched || viewing !== null || document.activeElement !== address) address.value = active?.url ?? '';
    loading.hidden = !active?.loading;
    back.disabled = !s.canGoBack;
    forward.disabled = !s.canGoForward;
  });

  // 지켜보기 패널(R11): 세션마다 탭 URL과 멈추기 버튼
  const sessionsEl = byId<HTMLUListElement>('sessions');
  const emptyEl = byId<HTMLParagraphElement>('sessions-empty');
  // 에이전트 따라 보기 스위치(카드 20261120-follow-agents). 값은 main이 가지고 남긴다
  const followEl = byId<HTMLInputElement>('follow');
  followEl.addEventListener('change', () => api.command({ cmd: 'follow', on: followEl.checked }));
  api.onSessions(({ sessions, viewing: shown, follow }) => {
    followEl.checked = follow;
    emptyEl.hidden = sessions.length > 0;
    sessionsEl.replaceChildren(...sessions.map((s) => {
      const li = document.createElement('li');
      li.className = 'session' + (s.sessionId === shown ? ' viewing' : '');
      li.dataset.sessionId = s.sessionId;
      const header = document.createElement('header');
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = s.sessionId;
      id.title = s.sessionId;
      const stop = document.createElement('button');
      stop.className = 'stop';
      stop.textContent = '멈추기';
      stop.addEventListener('click', () => { stop.disabled = true; api.command({ cmd: 'stopSession', sessionId: s.sessionId }); });
      // 보기: 왼쪽 영역에 이 세션의 탭을 보인다. 보는 중이면 내 탭으로 돌아간다
      const view = document.createElement('button');
      view.className = 'view';
      view.textContent = s.sessionId === shown ? '보는 중' : '보기';
      view.addEventListener('click', () => api.command({ cmd: 'view', sessionId: s.sessionId === shown ? null : s.sessionId }));
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      buttons.append(view, stop);
      header.append(id, buttons);
      const urls = document.createElement('ul');
      urls.append(...s.tabs.map((t) => {
        const u = document.createElement('li');
        u.className = 'tab-url' + (t.id === s.activeId ? ' active' : '');
        u.textContent = t.url || 'about:blank';
        return u;
      }));
      li.append(header, urls);
      return li;
    }));
  });

  // 승인 요청(R12·R13): "세션 · 호스트 · 무엇 — 허용/거부"
  const approvalsEl = byId<HTMLUListElement>('approvals');
  const approvalsSection = byId<HTMLElement>('approvals-section');
  const KIND_LABEL = { form: '폼 제출', download: '다운로드' } as const;
  api.onApprovals((list) => {
    approvalsSection.hidden = list.length === 0;
    approvalsEl.replaceChildren(...list.map((a) => {
      const li = document.createElement('li');
      li.className = 'approval';
      li.dataset.id = a.id;
      li.dataset.sessionId = a.sessionId;
      li.dataset.host = a.host;
      li.dataset.kind = a.kind;
      const what = document.createElement('div');
      what.className = 'what';
      what.textContent = `세션 ${a.sessionId} · ${a.host} · ${KIND_LABEL[a.kind]}${a.detail ? ` (${a.detail})` : ''}`;
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      for (const [cls, label, allow] of [['allow', '허용', true], ['deny', '거부', false]] as const) {
        const b = document.createElement('button');
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', () => { b.disabled = true; api.command({ cmd: 'decide', id: a.id, allow }); });
        buttons.append(b);
      }
      li.append(what, buttons);
      return li;
    }));
  });
}
