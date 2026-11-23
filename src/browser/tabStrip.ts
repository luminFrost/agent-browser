import { WebContentsView, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeAddress } from '../shared/url';
import type { TabStripState } from '../shared/tabState';

const ERROR_PAGE = join(__dirname, 'renderer', 'error.html');
const ERROR_PAGE_URL = pathToFileURL(ERROR_PAGE).href;
/** 사용자가 이동을 멈추거나 다른 이동으로 덮인 경우. 오류 페이지를 띄우지 않는다 */
const ERR_ABORTED = -3;

interface Tab {
  id: number;
  view: WebContentsView;
  /** 내용 webContents id. 페이지가 스스로 닫히면 view.webContents가 먼저 사라지므로 미리 적어 둔다 */
  contentsId: number;
  /** 마지막으로 불러오기에 실패한 주소. 오류 페이지를 보이는 동안 주소창에 쓴다 */
  failedUrl?: string;
  /** 오류 페이지를 보이는 동안 탭 제목(차단됨 / 페이지를 열 수 없음) */
  failedTitle?: string;
}

export interface TabStripOptions {
  partition: string;
  /** 탭 내용 위에 남길 높이(px). 창 UI(주소창·탭 막대) 자리 */
  topInset: number;
  /** 탭 내용 오른쪽에 남길 너비(px). 사람 창의 지켜보기 패널 자리 */
  rightInset?: number;
  onChange(state: TabStripState): void;
  /** 탭이 생겼을 때(내용 webContents) */
  onTabCreated?(contents: Electron.WebContents): void;
  /** 탭이 닫히기 직전(내용 webContents id) */
  onTabClosing?(contentsId: number): void;
  /** 이 주소로 이동·팝업을 허용하는가(에이전트 세션 탭: 웹 주소만, ADR-0006). 없으면 모두 허용 */
  allowNavigation?(url: string): boolean;
  /** 처음에 화면에 보이는가(기본 true). 사람 창 안의 세션 탭 묶음은 false로 시작한다 */
  shown?: boolean;
  /**
   * 묶음이 화면에 보이지 않아도 활성 탭을 숨기지 않고 계속 그리며, 늦추지(throttle) 않는다(에이전트 탭).
   * 숨긴 페이지는 그리지 않아 에이전트의 클릭·스크린샷이 멈춘다. 그래서 보이게 둔 채(parkedView) 사람 창이
   * 창 구석으로 옮겨 둔다(onLayout, spec-embedded-sessions E4, ADR-0009).
   */
  keepPainting?: boolean;
  /** 탭 배치가 바뀐 뒤(사람 창이 탭의 위아래 순서와 비켜 둔 탭의 자리를 다시 정한다) */
  onLayout?(): void;
  /** 창 크기가 바뀌면 스스로 다시 놓는다(기본 true). false면 창 주인이 relayout을 부른다 */
  followResize?: boolean;
  /** 탭이 키보드 포커스를 받았다(창 주인이 보이지 않는 탭에서 포커스를 되찾는다) */
  onTabFocus?(view: WebContentsView): void;
}

/** 오류 페이지 문구와 탭 제목. 앱이 막은 경우(관문 거부) 다른 문구를 쓴다(탭 제목도 본문과 맞춘다, 카드 20261123-qa-followups Q4) */
const ERR_BLOCKED_BY_CLIENT = -20;
const FAILED_TITLE = '페이지를 열 수 없음';
const describeFailure = (code: number, description: string) =>
  code === ERR_BLOCKED_BY_CLIENT
    ? { heading: '차단되었습니다', error: '사람이 폼 제출을 거부했습니다', title: '차단됨' }
    : { heading: '페이지를 열 수 없습니다', error: description, title: FAILED_TITLE };

let nextTabId = 1;


/**
 * 한 창 안의 탭 묶음. 탭마다 WebContentsView 하나. 사람 탭과 세션마다의 에이전트 탭이 같은 사람 창 안에서 따로 쓴다.
 * 활성 탭(activeId)은 묶음 주인이 정한다. 보는 탭(displayId)은 사람이 세션을 볼 때 활성 탭과 다르게 고를 수 있다.
 */
export class TabStrip {
  private readonly tabs: Tab[] = [];
  private activeId: number | null = null;
  /** 사람이 고른 보는 탭. 없으면 활성 탭을 본다. 활성 탭이 바뀌면 지운다(주인을 따라간다) */
  private displayId: number | null = null;
  private shown: boolean;
  private readonly onResize = () => this.layout();

  constructor(private readonly win: BrowserWindow, private readonly options: TabStripOptions) {
    this.shown = options.shown ?? true;
    if (options.followResize !== false) win.on('resize', this.onResize);
  }

  /** 창 크기가 바뀌었을 때 창 주인이 부른다(followResize: false) */
  relayout(): void {
    this.layout();
  }

  /** 이 묶음을 왼쪽 영역에 보일지 정한다. 다시 보일 때는 활성 탭부터 보인다(E2) */
  setShown(shown: boolean): void {
    this.shown = shown;
    if (!shown) this.displayId = null;
    this.layout();
  }

  /** 보는 탭을 고른다(활성 탭은 바꾸지 않는다) */
  display(id: number): void {
    if (!this.find(id)) return;
    this.displayId = id === this.activeId ? null : id;
    this.layout();
    this.emit();
  }

  /** 화면에 보이는 탭의 webContents id. 묶음이 보이지 않거나 탭이 없으면 undefined */
  shownContentsId(): number | undefined {
    const id = this.displayedId();
    return this.shown && id !== null ? this.find(id)?.contentsId : undefined;
  }

  /** 보는 사람용 상태: 활성 자리에 보는 탭을, 이동 버튼은 모두 끈다(읽기 전용) */
  viewState(): TabStripState {
    return { ...this.state(), activeId: this.displayedId(), canGoBack: false, canGoForward: false };
  }

  get webContentsIds(): number[] {
    return this.tabs.map((t) => t.contentsId);
  }

  /** 화면에 보이는 탭의 view(사람 창이 맨 위로 올린다) */
  shownView(): WebContentsView | undefined {
    const id = this.displayedId();
    return this.shown && id !== null ? this.find(id)?.view : undefined;
  }

  /** keepPainting일 때 화면에 보이지 않지만 그리고 있어야 하는 활성 탭의 view(사람 창이 구석으로 옮긴다) */
  parkedView(): WebContentsView | undefined {
    if (!this.options.keepPainting || this.activeId === null) return undefined;
    if (this.shown && this.displayedId() === this.activeId) return undefined;
    return this.find(this.activeId)?.view;
  }

  newTab(url?: string): number {
    const view = new WebContentsView({ webPreferences: this.webPreferences() });
    const id = this.adopt(view);
    if (url) this.navigate(url);
    return id;
  }

  /** 탭의 내용 webContents id로 찾기(런처 명령은 targetId → webContents id로 온다) */
  idOfContents(contentsId: number): number | undefined {
    return this.tabs.find((t) => t.contentsId === contentsId)?.id;
  }

  contentsOf(id: number): Electron.WebContents | undefined {
    return this.find(id)?.view.webContents;
  }

  private adopt(view: WebContentsView): number {
    const tab: Tab = { id: nextTabId++, view, contentsId: view.webContents.id };
    this.tabs.push(tab);
    this.win.contentView.addChildView(view);
    this.watch(tab);
    this.options.onTabCreated?.(view.webContents);
    this.activate(tab.id);
    return tab.id;
  }

  activate(id: number): void {
    if (!this.find(id)) return;
    this.activeId = id;
    this.displayId = null;
    this.layout();
    this.emit();
  }

  close(id: number): void {
    const tab = this.find(id);
    if (!tab) return;
    const contents = tab.view.webContents;
    this.forget(tab);
    if (contents && !contents.isDestroyed()) contents.close();
  }

  /** 탭을 목록에서 뺀다. 앱이 닫을 때와 페이지가 스스로 닫혔을 때(window.close) 같은 길로 간다 */
  private forget(tab: Tab): void {
    if (!this.tabs.includes(tab)) return;
    this.options.onTabClosing?.(tab.contentsId);
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    if (!this.win.isDestroyed()) this.win.contentView.removeChildView(tab.view);
    if (this.activeId === tab.id) this.activeId = this.tabs.at(-1)?.id ?? null;
    if (this.displayId === tab.id) this.displayId = null;
    this.layout();
    this.emit();
  }

  navigate(input: string, id = this.activeId): void {
    const url = normalizeAddress(input);
    const tab = id === null ? undefined : this.find(id);
    if (!url || !tab || this.options.allowNavigation?.(url) === false) return;
    tab.view.webContents.loadURL(url).catch(() => undefined); // 실패는 did-fail-load에서 다룬다
  }

  back(): void { this.active()?.view.webContents.navigationHistory.goBack(); }
  forward(): void { this.active()?.view.webContents.navigationHistory.goForward(); }
  reload(): void {
    const tab = this.active();
    if (!tab) return;
    if (tab.failedUrl && this.isErrorPage(tab)) this.navigate(tab.failedUrl);
    else tab.view.webContents.reload();
  }

  state(): TabStripState {
    const active = this.active();
    const history = active?.view.webContents.navigationHistory;
    return {
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: this.isErrorPage(t) ? (t.failedTitle ?? FAILED_TITLE) : t.view.webContents.getTitle(),
        url: this.displayUrl(t),
        loading: t.view.webContents.isLoading(),
      })),
      activeId: this.activeId,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
    };
  }

  /** 탭을 모두 닫고 창 크기 감시를 푼다(창보다 먼저 끝나는 세션 묶음이 감시를 남기지 않게) */
  destroy(): void {
    for (const t of [...this.tabs]) this.close(t.id);
    this.win.off('resize', this.onResize);
  }

  private webPreferences(): Electron.WebPreferences {
    return { partition: this.options.partition, sandbox: true, contextIsolation: true, backgroundThrottling: !this.options.keepPainting };
  }

  private find(id: number) { return this.tabs.find((t) => t.id === id); }
  private displayedId() { return this.displayId ?? this.activeId; }
  private active() { return this.activeId === null ? undefined : this.find(this.activeId); }
  private isErrorPage(t: Tab) { return t.view.webContents.getURL().startsWith(ERROR_PAGE_URL); }
  private displayUrl(t: Tab) { return this.isErrorPage(t) ? (t.failedUrl ?? '') : t.view.webContents.getURL(); }
  private emit() { if (!this.win.isDestroyed()) this.options.onChange(this.state()); }

  /**
   * 묶음이 보이면 보는 탭을 보인다. keepPainting이면 활성 탭도 보이게 둔다(parkedView, 사람 창이 구석으로 옮긴다).
   * 나머지는 숨긴다. 모든 탭이 같은 크기다.
   */
  private layout(): void {
    if (this.win.isDestroyed()) return;
    const { width, height } = this.win.getContentBounds();
    const top = this.options.topInset;
    const onScreen = this.shown ? this.displayedId() : null;
    for (const t of this.tabs) {
      t.view.setBounds({ x: 0, y: top, width: Math.max(0, width - (this.options.rightInset ?? 0)), height: Math.max(0, height - top) });
      t.view.setVisible(t.id === onScreen || (this.options.keepPainting === true && t.id === this.activeId));
    }
    this.options.onLayout?.();
  }

  private watch(tab: Tab): void {
    const wc = tab.view.webContents;
    wc.once('destroyed', () => this.forget(tab)); // 팝업의 window.close() 등
    // 팝업(window.open, target=_blank)은 새 창이 아니라 같은 창의 새 탭으로 연다.
    // createWindow로 Electron이 만든 webContents를 그대로 받아 opener 관계를 잇는다.
    const allowed = (url: string) => this.options.allowNavigation?.(url) !== false;
    const guard = (event: { preventDefault(): void; url: string }) => { if (!allowed(event.url)) event.preventDefault(); };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
    wc.on('will-frame-navigate', guard);
    wc.setWindowOpenHandler(({ url }) => (!allowed(url) ? { action: 'deny' } : {
      action: 'allow',
      createWindow: (options) => {
        // Electron은 opener와 이어진 webContents를 options.webContents로 넘긴다(타입 정의에는 없다)
        const opened = (options as { webContents?: Electron.WebContents }).webContents;
        const view = new WebContentsView({ webContents: opened, webPreferences: this.webPreferences() } as Electron.WebContentsViewConstructorOptions);
        this.adopt(view);
        return view.webContents;
      },
    }));
    wc.on('focus', () => this.options.onTabFocus?.(tab.view));
    const update = () => this.emit();
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('page-title-updated', update);
    wc.on('did-navigate', update);
    wc.on('did-navigate-in-page', update);
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.url.startsWith(ERROR_PAGE_URL)) { tab.failedUrl = undefined; tab.failedTitle = undefined; }
    });
    wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED || validatedURL.startsWith(ERROR_PAGE_URL)) return;
      const failure = describeFailure(code, description);
      tab.failedUrl = validatedURL;
      tab.failedTitle = failure.title;
      wc.loadFile(ERROR_PAGE, { query: { url: validatedURL, ...failure } }).catch(() => undefined);
      update();
    });
  }
}
