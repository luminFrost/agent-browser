// 앱 안 업데이트의 Electron 쪽(카드 20261123-update-notice, ADR-0010): 언제 묻고, 받고, 설치 스크립트를 띄우는가
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  appBundlePath, checkForUpdate, latestReleaseApi, queryUpdate, UPDATE_CHECK_INTERVAL_MS, UPDATE_DOWNLOAD_DIR, UPDATE_FIRST_CHECK_DELAY_MS, UPDATE_NOTICE_MS,
  type UpdateInfo, type UpdateState,
} from './update';

/** dmg 받기 한도(약 120MB, 느린 회사망) */
const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** 묶은 앱의 Resources에 들어가는 설치 스크립트 이름(package.json build.extraResources) */
const INSTALLER_NAME = 'update-mac.sh';

/**
 * package.json: 묶은 앱은 Resources/app/package.json, 개발은 저장소 맨 위. 둘 다 dist/browser에서 두 단계 위다.
 * app.getVersion()은 개발 실행에서 Electron 버전을 돌려주므로 쓰지 않는다
 */
function readPackage(): { version?: string; repository?: unknown } {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string; repository?: unknown };
  } catch {
    return {};
  }
}

export interface Updater {
  state(): UpdateState;
  /** 사람이 업데이트를 눌렀다 */
  install(): void;
  /** 사람이 메뉴 "업데이트 확인…"을 눌렀다: 자동 묻기 설정과 상관없이 바로 묻고 결과를 패널에 보인다 */
  check(): void;
}

/**
 * 묶은 앱이면(또는 시험이 AGENT_BROWSER_UPDATE_URL을 주면) 켜진 뒤 잠시 있다가, 그 뒤 1시간마다 묻는다.
 * settings.json "updateCheck": false(enabled)나 AGENT_BROWSER_UPDATE_CHECK=off면 묻지 않는다. 상태가 바뀔 때마다 show로 패널에 알린다
 */
export function startUpdater(enabled: boolean, show: (s: UpdateState) => void, quit: () => void): Updater {
  const pkg = readPackage();
  // 지금 버전을 모르면 묻지 않는다(모든 Release를 새 버전으로 보게 되므로)
  const version = typeof pkg.version === 'string' ? pkg.version : undefined;
  const url = version && (process.env.AGENT_BROWSER_UPDATE_URL ?? (app.isPackaged ? latestReleaseApi(pkg.repository) : undefined));
  let current: UpdateState = { state: 'none' };
  let info: UpdateInfo | undefined;
  const set = (s: UpdateState) => { current = s; show(s); };
  const busy = () => current.state === 'downloading' || current.state === 'installing';

  const check = async () => {
    if (!url || !version || busy()) return;
    const found = await checkForUpdate(url, version, (u, init) => net.fetch(u, init));
    if (!found || busy()) return;
    info = found;
    set({ state: 'available', version: found.version });
  };
  if (url && enabled && process.env.AGENT_BROWSER_UPDATE_CHECK !== 'off') {
    setTimeout(() => void check(), UPDATE_FIRST_CHECK_DELAY_MS);
    setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
  }

  let noticeTimer: NodeJS.Timeout | undefined;
  const checkNow = async () => {
    if (busy()) return;
    const q = url && version ? await queryUpdate(url, version, (u, init) => net.fetch(u, init)) : { result: 'failed' as const };
    if (busy()) return;
    if (q.result === 'new') { info = q.info; set({ state: 'available', version: q.info.version }); return; }
    // 이미 새 버전을 알리고 있으면 그대로 둔다(잠깐의 실패로 업데이트 버튼을 감추지 않는다)
    if (current.state === 'available' || current.state === 'failed') return;
    set(q.result === 'latest' && version ? { state: 'latest', version } : { state: 'checkFailed' });
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { if (current.state === 'latest' || current.state === 'checkFailed') set({ state: 'none' }); }, UPDATE_NOTICE_MS);
  };

  const install = async () => {
    if (!info || busy()) return;
    const target = info;
    set({ state: 'downloading', version: target.version });
    try {
      const installer = process.env.AGENT_BROWSER_UPDATE_INSTALLER ?? join(process.resourcesPath, INSTALLER_NAME);
      // 설치 스크립트가 없으면 앱을 끄지 않는다(끄면 아무것도 다시 열리지 않는다)
      if (!existsSync(installer)) throw new Error(`설치 스크립트가 없다: ${installer}`);
      const dir = join(app.getPath('temp'), UPDATE_DOWNLOAD_DIR);
      // 지난 업데이트에서 받은 dmg는 지운다(버전마다 약 120MB가 쌓이지 않게)
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const file = join(dir, target.dmgName);
      const res = await net.fetch(target.dmgUrl, { signal: AbortSignal.timeout(UPDATE_DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok || !res.body) throw new Error(`dmg를 받지 못했다(HTTP ${res.status})`);
      await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(file));
      set({ state: 'installing', version: target.version });
      const child = spawn('/bin/bash', [installer, file, appBundlePath(process.execPath), String(process.pid)], {
        detached: true, stdio: 'ignore', env: { ...process.env, AGENT_BROWSER_PROFILE: app.getPath('userData') },
      });
      await new Promise<void>((ok, no) => { child.once('spawn', ok); child.once('error', no); });
      child.unref();
      quit();
    } catch (e) {
      set({ state: 'failed', version: target.version, reason: e instanceof Error ? e.message : String(e) });
    }
  };
  return { state: () => current, install: () => void install(), check: () => void checkNow() };
}
