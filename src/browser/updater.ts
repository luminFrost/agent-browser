// 앱 안 업데이트의 Electron 쪽(카드 20261123-update-notice, ADR-0010): 언제 묻고, 받고, 설치 스크립트를 띄우는가
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  appBundlePath, checkForUpdate, latestReleaseApi, UPDATE_CHECK_INTERVAL_MS, UPDATE_DOWNLOAD_DIR, UPDATE_FIRST_CHECK_DELAY_MS,
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
}

/**
 * 묶은 앱이면(또는 시험이 AGENT_BROWSER_UPDATE_URL을 주면) 켜진 뒤 잠시 있다가, 그 뒤 6시간마다 묻는다.
 * AGENT_BROWSER_UPDATE_CHECK=off면 묻지 않는다. 상태가 바뀔 때마다 show로 패널에 알린다
 */
export function startUpdater(show: (s: UpdateState) => void, quit: () => void): Updater {
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
  if (url && process.env.AGENT_BROWSER_UPDATE_CHECK !== 'off') {
    setTimeout(() => void check(), UPDATE_FIRST_CHECK_DELAY_MS);
    setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
  }

  const install = async () => {
    if (!info || busy()) return;
    const target = info;
    set({ state: 'downloading', version: target.version });
    try {
      const dir = join(app.getPath('temp'), UPDATE_DOWNLOAD_DIR);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, target.dmgName);
      const res = await net.fetch(target.dmgUrl, { signal: AbortSignal.timeout(UPDATE_DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok || !res.body) throw new Error(`dmg를 받지 못했다(HTTP ${res.status})`);
      await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(file));
      set({ state: 'installing', version: target.version });
      const installer = process.env.AGENT_BROWSER_UPDATE_INSTALLER ?? join(process.resourcesPath, INSTALLER_NAME);
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
  return { state: () => current, install: () => void install() };
}
