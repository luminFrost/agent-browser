// 앱 안 업데이트 알림(카드 20261123-update-notice, ADR-0010).
// 묶은 앱이 GitHub 최신 Release를 묻고, 새 버전이면 패널에 알린다. 사람이 누르면 dmg를 받아 설치 스크립트에 넘긴다.

/** 다시 묻는 간격: 1시간(GitHub 인증 없는 한도 시간당 60회의 1/60. 카드 20261123-update-check-now C2) */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** 메뉴 "업데이트 확인…"의 최신·실패 문구를 보이는 시간 */
export const UPDATE_NOTICE_MS = 5_000;
/** 켜진 뒤 처음 묻기까지 기다림: 창·세션이 먼저 뜨게 */
export const UPDATE_FIRST_CHECK_DELAY_MS = 3_000;
/** 묻기·받기 응답을 기다리는 한도 */
export const UPDATE_FETCH_TIMEOUT_MS = 20_000;
/** 받은 dmg를 두는 임시 폴더 이름 */
export const UPDATE_DOWNLOAD_DIR = 'agent-browser-update';

/** 새 버전 정보 */
export interface UpdateInfo { version: string; dmgName: string; dmgUrl: string; pageUrl?: string }

/** 패널과 진단에 보이는 상태 */
export type UpdateState =
  | { state: 'none' }
  /** 메뉴로 물었더니 지금이 최신(잠시 보이고 사라진다) */
  | { state: 'latest'; version: string }
  /** 메뉴로 묻기가 실패(잠시 보이고 사라진다) */
  | { state: 'checkFailed' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'failed'; version: string; reason: string };

/** dmg 이름: package.json build.dmg.artifactName(`Agent-Browser-${version}-${arch}.${ext}`)과 같은 규칙. 앱은 arm64만 낸다 */
export const dmgAssetName = (version: string) => `Agent-Browser-${version}-arm64.dmg`;

const parse = (v: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())?.slice(1).map(Number);
/** a > b면 양수, 같으면 0, a < b면 음수. 형식이 아니면 NaN */
export function compareVersions(a: string, b: string): number {
  const x = parse(a); const y = parse(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** package.json `repository`(문자열 또는 {url})에서 GitHub API latest 주소를 만든다. GitHub가 아니면 undefined */
export function latestReleaseApi(repository: unknown): string | undefined {
  const raw = typeof repository === 'string' ? repository : (repository as { url?: unknown } | undefined)?.url;
  if (typeof raw !== 'string') return undefined;
  const m = /^github:([\w.-]+)\/([\w.-]+)$/.exec(raw) ?? /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(raw);
  return m ? `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest` : undefined;
}

/** GitHub Release 응답 → 지금보다 높고 그 버전 dmg가 있으면 업데이트 정보 */
export function parseRelease(body: unknown, current: string): UpdateInfo | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const r = body as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || !Array.isArray(r.assets)) return undefined;
  const version = r.tag_name.replace(/^v/, '');
  if (!(compareVersions(version, current) > 0)) return undefined;
  const dmgName = dmgAssetName(version);
  const asset = (r.assets as { name?: unknown; browser_download_url?: unknown }[]).find((a) => a?.name === dmgName);
  if (!asset || typeof asset.browser_download_url !== 'string') return undefined;
  return { version, dmgName, dmgUrl: asset.browser_download_url, ...(typeof r.html_url === 'string' ? { pageUrl: r.html_url } : {}) };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** 묻기 결과: 새 버전 / 새로 깔 것 없음 / 묻기 실패(연결·HTTP·JSON 아님) */
export type UpdateQuery = { result: 'new'; info: UpdateInfo } | { result: 'latest' } | { result: 'failed' };

/** 최신 Release를 묻는다. 실패는 던지지 않고 결과로 돌려준다(메뉴 "업데이트 확인…"이 실패를 알린다) */
export async function queryUpdate(url: string, current: string, fetchFn: Fetch): Promise<UpdateQuery> {
  try {
    const res = await fetchFn(url, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(UPDATE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return { result: 'failed' };
    const info = parseRelease(await res.json(), current);
    return info ? { result: 'new', info } : { result: 'latest' };
  } catch {
    return { result: 'failed' };
  }
}

/** 최신 Release를 묻는다. 실패(연결·HTTP·형식)는 조용히 undefined(회사망이 막아도 앱은 그대로, ADR-0010 1) */
export async function checkForUpdate(url: string, current: string, fetchFn: Fetch): Promise<UpdateInfo | undefined> {
  const q = await queryUpdate(url, current, fetchFn);
  return q.result === 'new' ? q.info : undefined;
}

/** 실행 파일 경로(…/X.app/Contents/MacOS/X)에서 앱 묶음 경로. 묶음 안이 아니면 실행 파일 경로 그대로 */
export function appBundlePath(execPath: string): string {
  const i = execPath.indexOf('.app/Contents/');
  return i >= 0 ? execPath.slice(0, i + '.app'.length) : execPath;
}
