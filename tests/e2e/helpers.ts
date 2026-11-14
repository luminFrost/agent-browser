import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp, type RunningApp, type StartOptions } from '../../src/launcher/app';

export const tempDir = (prefix = 'ab-') => mkdtempSync(join(tmpdir(), prefix));

export async function launch(options: Partial<StartOptions> = {}): Promise<RunningApp> {
  return startApp({ userDataDir: tempDir(), hidden: true, ...options });
}

export interface TargetInfo { targetId: string; type: string; url: string; title: string }

export async function targets(app: RunningApp): Promise<TargetInfo[]> {
  const r = await app.rawCdp.send('Target.getTargets');
  return r.targetInfos as TargetInfo[];
}

/** 원본 CDP로 대상 페이지에 붙어 식을 평가한다(테스트 전용, ADR-0002). */
export async function evaluate<T = unknown>(app: RunningApp, targetId: string, expression: string): Promise<T> {
  const { sessionId } = await app.rawCdp.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    const r = await app.rawCdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId as string);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return (r.result as { value: T }).value;
  } finally {
    await app.rawCdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
  }
}

/** 조건이 참이 될 때까지 기다린다. */
export async function waitFor<T>(fn: () => Promise<T | undefined | false>, what: string, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < until) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`기다렸지만 안 됨: ${what}${last ? ` (마지막 오류: ${String(last)})` : ''}`);
}

/** 사람 창의 UI(주소창·탭 막대) 페이지 */
export async function humanUi(app: RunningApp): Promise<TargetInfo> {
  return waitFor(async () => {
    const t = (await targets(app)).find((x) => x.url.includes('/renderer/human/index.html'));
    return t && (await evaluate<boolean>(app, t.targetId, `!!document.querySelector('#address') && document.readyState === 'complete'`)) ? t : undefined;
  }, '사람 창 UI');
}
