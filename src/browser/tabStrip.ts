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
  /** 마지막으로 불러오기에 실패한 주소. 오류 페이지를 보이는 동안 주소창에 쓴다 */
  failedUrl?: string;
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
  /** 탭이 닫히기 직전 */
  onTabClosing?(contents: Electron.WebContents): void;
}

/** 오류 페이지 문구. 앱이 막은 경우(관문 거부) 다른 문구를 쓴다 */
const ERR_BLOCKED_BY_CLIENT = -20;
const describeFailure = (code: number, description: string) =>
  code === ERR_BLOCKED_BY_CLIENT
    ? { heading: '차단되었습니다', error: '사람이 폼 제출을 거부했습니다' }
    : { heading: '페이지를 열 수 없습니다', error: description };

let nextTabId = 1;

/** 한 창 안의 탭 묶음. 탭마다 WebContentsView 하나. 사람 창과 에이전트 창이 같이 쓴다 */
export class TabStrip {
  private readonly tabs: Tab[] = [];
  private activeId: number | null = null;

  constructor(private readonly win: BrowserWindow, private readonly options: TabStripOptions) {
    win.on('resize', () => this.layout());
  }

  get webContentsIds(): number[] {
    return this.tabs.map((t) => t.view.webContents.id);
  }

  newTab(url?: string): number {
    const view = new WebContentsView({ webPreferences: { partition: this.options.partition, sandbox: true, contextIsolation: true } });
    const id = this.adopt(view);
    if (url) this.navigate(url);
    return id;
  }

  /** 탭의 내용 webContents id로 찾기(런처 명령은 targetId → webContents id로 온다) */
  idOfContents(contentsId: number): number | undefined {
    return this.tabs.find((t) => t.view.webContents.id === contentsId)?.id;
  }

  contentsOf(id: number): Electron.WebContents | undefined {
    return this.find(id)?.view.webContents;
  }

  private adopt(view: WebContentsView): number {
    const tab: Tab = { id: nextTabId++, view };
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
    this.layout();
    this.emit();
  }

  close(id: number): void {
    const tab = this.find(id);
    if (!tab) return;
    this.options.onTabClosing?.(tab.view.webContents);
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    if (this.activeId === id) this.activeId = this.tabs.at(-1)?.id ?? null;
    this.layout();
    this.emit();
  }

  navigate(input: string, id = this.activeId): void {
    const url = normalizeAddress(input);
    const tab = id === null ? undefined : this.find(id);
    if (!url || !tab) return;
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
        title: this.isErrorPage(t) ? '페이지를 열 수 없음' : t.view.webContents.getTitle(),
        url: this.displayUrl(t),
        loading: t.view.webContents.isLoading(),
      })),
      activeId: this.activeId,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
    };
  }

  destroy(): void {
    for (const t of [...this.tabs]) this.close(t.id);
  }

  private find(id: number) { return this.tabs.find((t) => t.id === id); }
  private active() { return this.activeId === null ? undefined : this.find(this.activeId); }
  private isErrorPage(t: Tab) { return t.view.webContents.getURL().startsWith(ERROR_PAGE_URL); }
  private displayUrl(t: Tab) { return this.isErrorPage(t) ? (t.failedUrl ?? '') : t.view.webContents.getURL(); }
  private emit() { if (!this.win.isDestroyed()) this.options.onChange(this.state()); }

  private layout(): void {
    if (this.win.isDestroyed()) return;
    const { width, height } = this.win.getContentBounds();
    const top = this.options.topInset;
    for (const t of this.tabs) {
      t.view.setBounds({ x: 0, y: top, width: Math.max(0, width - (this.options.rightInset ?? 0)), height: Math.max(0, height - top) });
      t.view.setVisible(t.id === this.activeId);
    }
  }

  private watch(tab: Tab): void {
    const wc = tab.view.webContents;
    // 팝업(window.open, target=_blank)은 새 창이 아니라 같은 창의 새 탭으로 연다.
    // createWindow로 Electron이 만든 webContents를 그대로 받아 opener 관계를 잇는다.
    wc.setWindowOpenHandler(() => ({
      action: 'allow',
      createWindow: (options) => {
        // Electron은 opener와 이어진 webContents를 options.webContents로 넘긴다(타입 정의에는 없다)
        const opened = (options as { webContents?: Electron.WebContents }).webContents;
        const view = new WebContentsView({ webContents: opened, webPreferences: { partition: this.options.partition, sandbox: true, contextIsolation: true } } as Electron.WebContentsViewConstructorOptions);
        this.adopt(view);
        return view.webContents;
      },
    }));
    const update = () => this.emit();
    wc.on('did-start-loading', update);
    wc.on('did-stop-loading', update);
    wc.on('page-title-updated', update);
    wc.on('did-navigate', update);
    wc.on('did-navigate-in-page', update);
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.url.startsWith(ERROR_PAGE_URL)) tab.failedUrl = undefined;
    });
    wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED || validatedURL.startsWith(ERROR_PAGE_URL)) return;
      tab.failedUrl = validatedURL;
      wc.loadFile(ERROR_PAGE, { query: { url: validatedURL, ...describeFailure(code, description) } }).catch(() => undefined);
      update();
    });
  }
}
