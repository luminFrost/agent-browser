// 사람 창 UI (주소창·탭 막대). 모듈이 아닌 스크립트로 읽힌다.
interface HumanTabView { id: number; title: string; url: string; loading: boolean; favicon?: string }
/** viewing이 있으면 그 세션의 탭을 보는 중이다(읽기 전용, spec-embedded-sessions) */
interface HumanState { tabs: HumanTabView[]; activeId: number | null; canGoBack: boolean; canGoForward: boolean; viewing: string | null; viewingLabel?: string; zoom: number }
interface HumanApprovalView { id: string; sessionId: string; host: string; kind: 'form' | 'download'; detail?: string; expiresAt: number }
/** 북마크(카드 20261125-bookmarks): 링크는 url, 폴더는 children */
interface HumanBookmark { id: string; title: string; url?: string; icon?: string; children?: HumanBookmark[] }
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
    onFocusAddress(listener: () => void): void;
    onBookmarks(listener: (nodes: HumanBookmark[]) => void): void;
    onToast(listener: (text: string) => void): void;
    onBookmarkPrompt(listener: (p: { mode: 'newFolder' } | { mode: 'rename'; id: string; title: string }) => void): void;
    onFind(listener: (f: { open: boolean; focus?: boolean; active?: number; matches?: number }) => void): void;
    onZoomNotice(listener: (percent: number) => void): void;
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
  api.onFocusAddress(() => { if (address.readOnly) return; address.focus(); address.select(); });
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
      if (t.favicon) el.dataset.favicon = t.favicon;
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
    activeUrl = viewing === null ? (active?.url ?? '') : '';
    showStar();
    // 배율(Z1): 100%가 아니면 돋보기. 세션을 보는 중에는 숨긴다
    zoomBtn.hidden = viewing !== null || s.zoom === 100;
    zoomBtn.title = `배율 ${s.zoom}% · 누르면 100% (⌘0)`;
    if (zoomBtn.hidden) zoomNotice.hidden = true;
  });

  // 확대·축소(카드 20261128-find-zoom Z1, SCR-14)
  const zoomBtn = byId<HTMLButtonElement>('zoom-button');
  const zoomNotice = byId<HTMLDivElement>('zoom-notice');
  /** "125% · 재설정"을 보이는 시간(main의 ZOOM_NOTICE_MS와 같은 값, DOC-03-UI SCR-14) */
  const ZOOM_NOTICE_MS = 2000;
  let zoomTimer: number | undefined;
  zoomBtn.addEventListener('click', () => api.command({ cmd: 'zoomReset' }));
  zoomNotice.querySelector('.reset')?.addEventListener('click', () => api.command({ cmd: 'zoomReset' }));
  api.onZoomNotice((percent) => {
    (zoomNotice.querySelector('.pct') as HTMLSpanElement).textContent = `${percent}%`;
    zoomNotice.hidden = false;
    // 돋보기 아래(100%로 돌아와 돋보기가 숨으면 별 아래). 머리 안에 머문다
    const anchor = (zoomBtn.hidden ? byId<HTMLButtonElement>('bookmark-star') : zoomBtn).getBoundingClientRect();
    zoomNotice.style.top = `${anchor.bottom + 2}px`;
    zoomNotice.style.left = `${Math.max(8, anchor.right - zoomNotice.offsetWidth)}px`;
    clearTimeout(zoomTimer);
    zoomTimer = window.setTimeout(() => { zoomNotice.hidden = true; }, ZOOM_NOTICE_MS);
  });

  // 페이지 안 찾기(카드 20261128-find-zoom F1·F2, SCR-13). 찾기·결과는 main이 내 탭에 한다
  const findForm = byId<HTMLFormElement>('find');
  const findText = byId<HTMLInputElement>('find-text');
  const findCount = byId<HTMLSpanElement>('find-count');
  const findNow = (next: boolean, forward = true) => api.command({ cmd: 'find', text: findText.value, forward, next });
  const showCount = (active?: number, matches?: number) => {
    const empty = findText.value === '' || matches === undefined;
    findCount.hidden = empty;
    findCount.textContent = empty ? '' : `${matches === 0 ? 0 : (active ?? 0)}/${matches}`;
    findForm.classList.toggle('none', !empty && matches === 0);
  };
  findText.addEventListener('input', () => { showCount(); findNow(false); });
  findText.addEventListener('keydown', (e) => {
    // 한글 입력 조합 중의 Enter는 글자를 끝내는 것이지 다음 찾기가 아니다
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); if (findText.value !== '') findNow(true, !e.shiftKey); }
    if (e.key === 'Escape') { e.preventDefault(); api.command({ cmd: 'findClose' }); }
  });
  findForm.addEventListener('submit', (e) => e.preventDefault());
  byId<HTMLButtonElement>('find-next').addEventListener('click', () => { if (findText.value !== '') findNow(true, true); });
  byId<HTMLButtonElement>('find-prev').addEventListener('click', () => { if (findText.value !== '') findNow(true, false); });
  byId<HTMLButtonElement>('find-close').addEventListener('click', () => api.command({ cmd: 'findClose' }));
  api.onFind((f) => {
    if (!f.open) {
      findForm.hidden = true;
      findText.value = '';
      showCount();
      if (document.activeElement === findText) findText.blur();
      return;
    }
    findForm.hidden = false;
    if (f.focus) { findText.focus(); findText.select(); }
    if (f.matches !== undefined) showCount(f.active, f.matches);
    else if (findText.value === '') showCount();
  });

  // 북마크(카드 20261125-bookmarks): 별표는 지금 페이지가 북마크에 있는지, 막대는 맨 위 단계 항목
  const star = byId<HTMLButtonElement>('bookmark-star');
  const barEl = byId<HTMLDivElement>('bookmarks');
  const barEmpty = byId<HTMLSpanElement>('bookmarks-empty');
  let bookmarkList: HumanBookmark[] = [];
  let activeUrl = '';
  const hasUrl = (nodes: HumanBookmark[], url: string): boolean => nodes.some((n) => n.url === url || (n.children ? hasUrl(n.children, url) : false));
  const showStar = () => {
    const on = activeUrl !== '' && hasUrl(bookmarkList, activeUrl);
    star.textContent = on ? '★' : '☆';
    star.setAttribute('aria-pressed', String(on));
    star.title = on ? '북마크 지우기 (⌘D)' : '이 페이지 북마크 (⌘D)';
    star.disabled = activeUrl === '' || activeUrl === 'about:blank';
  };
  star.addEventListener('click', () => api.command({ cmd: 'toggleBookmark' }));
  /** 폴더 메뉴·오른쪽 클릭 메뉴는 main이 그 자리에 띄운다(창 안 좌표) */
  const popup = (id: string | null, el: HTMLElement, at?: MouseEvent) => {
    const r = el.getBoundingClientRect();
    api.command({ cmd: 'bookmarkPopup', id, x: at ? at.clientX : r.left, y: at ? at.clientY : r.bottom, context: !!at });
  };
  // 막대의 빈 곳 오른쪽 클릭: 새 폴더(카드 20261127-bookmark-folders G2)
  barEl.addEventListener('contextmenu', (e) => { if (e.target === barEl || e.target === itemsEl || e.target === barEmpty) { e.preventDefault(); popup(null, barEl, e); } });
  // 이름 칸(새 폴더·이름 바꾸기). Enter로 정하고 Esc·다른 곳 누르기로 취소
  const nameInput = byId<HTMLInputElement>('bookmark-name');
  const itemsEl = byId<HTMLSpanElement>('bookmark-items');
  let naming: { mode: 'newFolder' } | { mode: 'rename'; id: string; title: string } | null = null;
  const endNaming = (save: boolean) => {
    if (!naming) return;
    const p = naming;
    naming = null;
    nameInput.hidden = true;
    if (!save) return;
    if (p.mode === 'newFolder') api.command({ cmd: 'bookmarkNewFolder', title: nameInput.value });
    else api.command({ cmd: 'bookmarkRename', id: p.id, title: nameInput.value });
  };
  nameInput.addEventListener('keydown', (e) => {
    // 한글 입력 조합 중의 Enter는 글자를 끝내는 것이지 정하기가 아니다
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); endNaming(true); }
    if (e.key === 'Escape') { e.preventDefault(); endNaming(false); }
  });
  nameInput.addEventListener('blur', () => endNaming(false));
  api.onBookmarkPrompt((p) => {
    naming = p;
    nameInput.placeholder = p.mode === 'newFolder' ? '새 폴더 이름' : '새 이름';
    nameInput.value = p.mode === 'rename' ? p.title : '';
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
  });
  api.onBookmarks((nodes) => {
    bookmarkList = nodes;
    barEmpty.hidden = nodes.length > 0;
    // 이름 칸은 다시 그리지 않는다(이름을 넣는 중에 목록이 바뀌어도 칸이 그대로 남는다)
    itemsEl.replaceChildren(barEmpty, ...nodes.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bookmark' + (n.children ? ' folder' : '');
      b.dataset.id = n.id;
      // 사이트 아이콘(없으면 기본 지구 모양, 폴더는 CSS의 폴더 모양) + 이름(G1)
      if (!n.children) {
        const icon = document.createElement(n.icon ? 'img' : 'span');
        icon.className = 'favicon' + (n.icon ? '' : ' default');
        if (n.icon) { (icon as HTMLImageElement).src = n.icon; (icon as HTMLImageElement).alt = ''; }
        b.append(icon);
      }
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = n.title || n.url || '';
      b.append(label);
      // 마우스를 올리면 이름과 주소(G3)
      b.title = n.url ? `${n.title}\n${n.url}` : n.title;
      if (n.children) b.addEventListener('click', () => popup(n.id, b));
      else {
        b.addEventListener('click', (e) => api.command({ cmd: 'openBookmark', id: n.id, newTab: e.metaKey || e.ctrlKey }));
        // 가운데 클릭은 새 탭(Chrome과 같다)
        b.addEventListener('auxclick', (e) => { if (e.button === 1) api.command({ cmd: 'openBookmark', id: n.id, newTab: true }); });
      }
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); popup(n.id, b, e); });
      return b;
    }));
    showStar();
  });
  // 패널 알림(북마크 파일 결과). 잠시 보이고 사라진다
  const toastEl = byId<HTMLDivElement>('toast');
  const TOAST_MS = 5000;
  let toastTimer: number | undefined;
  api.onToast((text) => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, TOAST_MS);
  });


  // 지켜보기 패널(R11): 세션마다 탭 URL과 멈추기 버튼
  const sessionsEl = byId<HTMLUListElement>('sessions');
  const emptyEl = byId<HTMLParagraphElement>('sessions-empty');
  // 에이전트 따라 보기 스위치(카드 20261120-follow-agents). 값은 main이 가지고 남긴다
  const followEl = byId<HTMLInputElement>('follow');
  followEl.addEventListener('change', () => api.command({ cmd: 'follow', on: followEl.checked }));
  // 화면 모드(카드 20261123-theme-mode). 값은 main이 가지고 남기며, 메뉴에서 바꿔도 여기로 온다
  // 셀렉트 대신 버튼 + 앱 메뉴(카드 20261127-bookmark-folders G4: 듀얼 모니터에서 셀렉트 목록이 다른 화면에 떴다)
  const themeBtn = byId<HTMLButtonElement>('theme-button');
  const themeIcon = themeBtn.querySelector<HTMLElement>('.icon');
  const THEME_ICONS: Record<string, string> = { system: '◐', light: '☀', dark: '☾' };
  themeBtn.addEventListener('click', () => { const r = themeBtn.getBoundingClientRect(); api.command({ cmd: 'themeMenu', x: r.left, y: r.bottom }); });
  api.onTheme((mode) => { themeBtn.dataset.mode = mode; if (themeIcon) themeIcon.textContent = THEME_ICONS[mode] ?? THEME_ICONS.system; });
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
      : s.state === 'failed' ? `업데이트 실패: ${s.reason ?? ''}`
      : s.state === 'latest' ? `최신 버전입니다 (${v})`
      : s.state === 'checkFailed' ? '업데이트를 확인하지 못했습니다' : '';
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
