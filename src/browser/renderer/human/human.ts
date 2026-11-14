// 사람 창 UI (주소창·탭 막대). 모듈이 아닌 스크립트로 읽힌다.
interface HumanTabView { id: number; title: string; url: string; loading: boolean }
interface HumanState { tabs: HumanTabView[]; activeId: number | null; canGoBack: boolean; canGoForward: boolean }
interface HumanSessionView { sessionId: string; tabs: HumanTabView[]; activeId: number | null }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 전역 Window 확장(preload가 연 humanApi)이라 선언만 있다
interface Window {
  humanApi: {
    command(c: { cmd: string; [k: string]: unknown }): void;
    onState(listener: (s: HumanState) => void): void;
    onSessions(listener: (s: HumanSessionView[]) => void): void;
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

  byId<HTMLFormElement>('nav').addEventListener('submit', (e) => {
    e.preventDefault();
    api.command({ cmd: 'navigate', input: address.value });
    address.blur();
  });
  back.addEventListener('click', () => api.command({ cmd: 'back' }));
  forward.addEventListener('click', () => api.command({ cmd: 'forward' }));
  byId('reload').addEventListener('click', () => api.command({ cmd: 'reload' }));
  byId('new-tab').addEventListener('click', () => api.command({ cmd: 'newTab' }));

  api.onState((s) => {
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
    if (document.activeElement !== address) address.value = active?.url ?? '';
    loading.hidden = !active?.loading;
    back.disabled = !s.canGoBack;
    forward.disabled = !s.canGoForward;
  });

  // 지켜보기 패널(R11): 세션마다 탭 URL과 멈추기 버튼
  const sessionsEl = byId<HTMLUListElement>('sessions');
  const emptyEl = byId<HTMLParagraphElement>('sessions-empty');
  api.onSessions((sessions) => {
    emptyEl.hidden = sessions.length > 0;
    sessionsEl.replaceChildren(...sessions.map((s) => {
      const li = document.createElement('li');
      li.className = 'session';
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
      header.append(id, stop);
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
}
