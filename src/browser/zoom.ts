import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 확대·축소(F-BR-09, 카드 20261128-find-zoom). Chromium 배율(setZoomFactor)은 같은 출처의 다른 탭, 곧 같은 사이트를 연
 * 에이전트 탭에도 번진다(RK-18 실험). 그래서 사람 탭 문서에만 CSS zoom을 넣는다(D-8, ADR-0011, 사람 결정 "CSS 확대").
 */

/** Chrome 단계 중 50~300% */
export const ZOOM_STEPS: readonly number[] = [0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const ZOOM_FILE_NAME = 'zoom.json';
/** 단계 값 비교 허용 오차(2/3 같은 값을 파일에서 다시 읽을 때) */
const SAME = 1e-6;

export const zoomPercent = (factor: number): number => Math.round(factor * 100);

/** 한 단계 위(1)·아래(-1). 단계에 없는 값은 그 방향의 가까운 단계로, 끝에서는 그대로 */
export function stepZoom(factor: number, dir: 1 | -1): number {
  if (dir === 1) return ZOOM_STEPS.find((s) => s > factor + SAME) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < factor - SAME) ?? ZOOM_STEPS[0];
}

const isStep = (v: unknown): v is number => typeof v === 'number' && ZOOM_STEPS.some((s) => Math.abs(s - v) < SAME);

/** 배율을 기억하는 사이트: http·https 주소의 host(포트 포함). 그 밖의 주소는 기억하지 않는다(100%) */
export function zoomHost(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host : undefined;
  } catch {
    return undefined;
  }
}

/** 탭 문서에 넣을 CSS. 100%면 넣지 않는다 */
export const zoomCss = (factor: number): string | undefined => (Math.abs(factor - 1) < SAME ? undefined : `html { zoom: ${factor} !important }`);

/** zoom.json `{"hosts":{"<host>": 배율}}`. 없거나 틀리면 빈 값(모두 100%), 단계에 없는 값·100%는 버린다 */
export function readZoom(profileDir: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const raw = JSON.parse(readFileSync(join(profileDir, ZOOM_FILE_NAME), 'utf8')) as { hosts?: unknown };
    if (raw.hosts && typeof raw.hosts === 'object') {
      for (const [host, v] of Object.entries(raw.hosts as Record<string, unknown>)) if (isStep(v) && zoomCss(v) !== undefined) out.set(host, v);
    }
  } catch {
    // 파일이 없거나 읽을 수 없다
  }
  return out;
}

/** 100%가 아닌 것만 남긴다. 쓰기에 실패해도 이번 실행 동안은 유지한다 */
export function writeZoom(profileDir: string, zooms: ReadonlyMap<string, number>): void {
  const hosts = Object.fromEntries([...zooms].filter(([, v]) => zoomCss(v) !== undefined));
  try {
    writeFileSync(join(profileDir, ZOOM_FILE_NAME), JSON.stringify({ hosts }, null, 2));
  } catch {
    // 프로필 폴더에 쓸 수 없으면 이번 실행만
  }
}
