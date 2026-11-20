// 세션 이름(별칭, 카드 20261120-session-labels). 붙이기 명령·제어 API·사람 창이 같은 규칙을 쓴다.

/** 세션 이름 최대 글자 수(한글·이모지도 한 글자) */
export const LABEL_MAX = 40;

/** 앞뒤 공백·제어 문자를 지우고 안쪽 공백을 하나로 줄여 LABEL_MAX자로 자른다. 남는 게 없으면 undefined */
export function cleanLabel(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- 제어 문자를 지우는 것이 목적이다
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, (c) => (/\s/.test(c) ? ' ' : '')).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return [...text].slice(0, LABEL_MAX).join('').trim() || undefined;
}

/** 같은 이름이 이미 살아 있으면 " 2", " 3"…을 붙인다 */
export function uniqueLabel(label: string, taken: readonly string[]): string {
  if (!taken.includes(label)) return label;
  for (let n = 2; ; n++) if (!taken.includes(`${label} ${n}`)) return `${label} ${n}`;
}
