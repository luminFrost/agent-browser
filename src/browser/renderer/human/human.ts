// 사람 창 UI (주소창·탭 막대). 모듈이 아닌 스크립트로 읽힌다.
interface HumanTabView { id: number; title: string; url: string; loading: boolean }
/** viewing이 있으면 그 세션의 탭을 보는 중이다(읽기 전용, spec-embedded-sessions) */
interface HumanState { tabs: HumanTabView[]; activeId: number | null; canGoBack: boolean; canGoForward: boolean; viewing: string | null; viewingLabel?: string }
interface HumanApprovalView { id: string; sessionId: string; host: string; kind: 'form' | 'download'; detail?: string; expiresAt: number }
interface HumanSessionView { sessionId: string; label?: string; tabs: HumanTabView[]; activeId: number | null }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 전역 Window 확장(preload가 연 humanApi)이라 선언만 있다
interface Window {
  humanApi: {
    command(c: { cmd: string; [k: string]: unknown }): void;
    onState(listener: (s: HumanState) => void): void;
    onSessions(listener: (s: { sessions: HumanSessionView[]; viewing: string | null; follow: boolean }) => void): void;
    onApprovals(listener: (a: HumanApprovalView[]) => void): void;
    onTheme(listener: (mode: string) => void): void;
    onUpdate(listener: (s: { state: string; version?: string; reason?: string }) => void): void;
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
    (viewingEl.querySelector('.label') as HTMLSpanElement).textContent = viewing === null ? '' : `세션 ${s.viewingLabel ?? viewing} 보는 중`;
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
  // 화면 모드(카드 20261123-theme-mode). 값은 main이 가지고 남기며, 메뉴에서 바꿔도 여기로 온다
  const themeEl = byId<HTMLSelectElement>('theme');
  themeEl.addEventListener('change', () => api.command({ cmd: 'theme', mode: themeEl.value }));
  const themeIcon = document.querySelector<HTMLElement>('#theme-button .icon');
  const THEME_ICONS: Record<string, string> = { system: '◐', light: '☀', dark: '☾' };
  const showThemeIcon = () => { if (themeIcon) themeIcon.textContent = THEME_ICONS[themeEl.value] ?? THEME_ICONS.system; };
  themeEl.addEventListener('change', showThemeIcon);
  api.onTheme((mode) => { themeEl.value = mode; showThemeIcon(); });
  // 앱 안 업데이트(카드 20261123-update-notice). 새 버전이 있을 때만 패널 맨 위에 보인다
  const updateEl = byId<HTMLElement>('update');
  const updateText = byId<HTMLElement>('update-text');
  const updateNote = byId<HTMLElement>('update-note');
  const updateBtn = byId<HTMLButtonElement>('update-install');
  updateBtn.addEventListener('click', () => { updateBtn.disabled = true; api.command({ cmd: 'update' }); });
  api.onUpdate((s) => {
    updateEl.hidden = s.state === 'none';
    const v = s.version ?? '';
    updateText.textContent = s.state === 'available' ? `새 버전 ${v}`
      : s.state === 'downloading' ? `새 버전 ${v} 받는 중…`
      : s.state === 'installing' ? `새 버전 ${v} 설치 중… 앱이 다시 켜집니다`
      : s.state === 'failed' ? `업데이트 실패: ${s.reason ?? ''}` : '';
    updateBtn.hidden = !(s.state === 'available' || s.state === 'failed');
    updateBtn.disabled = false;
    updateNote.hidden = !(s.state === 'available' || s.state === 'failed');
  });
  /**
   * 세션 이름 고치기(카드 20261120-session-labels). 패널은 에이전트가 움직일 때마다 다시 그려지므로
   * 고치는 중인 세션과 글자를 따로 쥐고, 다시 그린 뒤 입력칸과 커서를 되살린다
   */
  let editing: { sessionId: string; value: string } | null = null;
  /** 세션 이름 최대 글자 수. src/shared/label.ts의 LABEL_MAX와 같아야 한다(저장할 때 이 길이로 자른다, labels.spec Q1) */
  const LABEL_MAX = 40;
  let lastSessions: { sessions: HumanSessionView[]; viewing: string | null; follow: boolean } | null = null;
  const renderSessions = () => {
    if (!lastSessions) return;
    const { sessions, viewing: shown, follow } = lastSessions;
    followEl.checked = follow;
    emptyEl.hidden = sessions.length > 0;
    if (editing && !sessions.some((x) => x.sessionId === editing!.sessionId)) editing = null; // 고치던 세션이 끝났다
    let editInput: HTMLInputElement | null = null;
    sessionsEl.replaceChildren(...sessions.map((s) => {
      const li = document.createElement('li');
      li.className = 'session' + (s.sessionId === shown ? ' viewing' : '');
      li.dataset.sessionId = s.sessionId;
      const header = document.createElement('header');
      const name = document.createElement('div');
      name.className = 'name';
      if (editing?.sessionId === s.sessionId) {
        const input = document.createElement('input');
        input.className = 'label-edit';
        input.value = editing.value;
        input.maxLength = LABEL_MAX;
        input.setAttribute('aria-label', '세션 이름');
        input.addEventListener('input', () => { if (editing) editing.value = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            api.command({ cmd: 'rename', sessionId: s.sessionId, label: input.value });
            editing = null;
            renderSessions();
          } else if (e.key === 'Escape') {
            editing = null;
            renderSessions();
          }
        });
        name.append(input);
        editInput = input;
      } else {
        if (s.label !== undefined) {
          const label = document.createElement('span');
          label.className = 'label';
          label.textContent = s.label;
          label.title = s.label;
          name.append(label);
        }
        const rename = document.createElement('button');
        rename.className = 'rename';
        rename.type = 'button';
        rename.textContent = '✎';
        rename.title = '이름 바꾸기';
        rename.setAttribute('aria-label', '이름 바꾸기');
        rename.addEventListener('click', () => { editing = { sessionId: s.sessionId, value: s.label ?? '' }; renderSessions(); });
        name.append(rename);
      }
      const id = document.createElement('span');
      id.className = 'id key';
      id.textContent = s.sessionId;
      id.title = s.sessionId;
      name.append(id);
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
      header.append(name, buttons);
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
    if (editInput) {
      const input: HTMLInputElement = editInput;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };
  api.onSessions((payload) => {
    lastSessions = payload;
    renderSessions();
  });

  // 승인 요청(R12·R13): "세션 · 호스트 · 무엇 — 허용/거부"
  const approvalsEl = byId<HTMLUListElement>('approvals');
  const approvalsSection = byId<HTMLElement>('approvals-section');
  const KIND_LABEL = { form: '폼 제출', download: '다운로드' } as const;
  /** 답이 없으면 거부되기까지 남은 시간(1분 단위로 올림, 카드 20261122-approval-attention) */
  const untilDeny = (expiresAt: number) => `${Math.max(1, Math.ceil((expiresAt - Date.now()) / 60_000))}분 뒤 자동 거부`;
  /** 세션 이름(패널 목록에서). 없으면 id */
  const nameOf = (sessionId: string) => lastSessions?.sessions.find((x) => x.sessionId === sessionId)?.label;
  let lastApprovals: HumanApprovalView[] = [];
  const renderApprovals = () => {
    const list = lastApprovals;
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
      const name = nameOf(a.sessionId);
      what.textContent = `세션 ${name ? `${name} (${a.sessionId})` : a.sessionId} · ${a.host} · ${KIND_LABEL[a.kind]}${a.detail ? ` (${a.detail})` : ''}`;
      const left = document.createElement('div');
      left.className = 'expires';
      left.textContent = untilDeny(a.expiresAt);
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      for (const [cls, label, allow] of [['allow', '허용', true], ['deny', '거부', false]] as const) {
        const b = document.createElement('button');
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', () => { b.disabled = true; api.command({ cmd: 'decide', id: a.id, allow }); });
        buttons.append(b);
      }
      li.append(what, left, buttons);
      return li;
    }));
  };
  api.onApprovals((list) => {
    lastApprovals = list;
    renderApprovals();
  });
  // 남은 시간 글자를 고친다(누르던 버튼이 사라지지 않게 글자만 바꾼다)
  setInterval(() => {
    for (const li of approvalsEl.querySelectorAll<HTMLLIElement>('.approval')) {
      const a = lastApprovals.find((x) => x.id === li.dataset.id);
      const el = li.querySelector('.expires');
      if (a && el) el.textContent = untilDeny(a.expiresAt);
    }
  }, 15_000);
}
