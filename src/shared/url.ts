const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const OPAQUE_SCHEMES = /^(about|data|blob):/i;
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:|\/|$)/i;

/**
 * 주소창 입력을 이동할 URL로 바꾼다. 스킴이 없으면 로컬 주소는 http, 나머지는 https를 붙인다.
 * 검색 엔진은 범위 밖이라 검색어로 해석하지 않는다. javascript: 주소는 실행하지 않는다(null).
 */
export function normalizeAddress(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^javascript:/i.test(text)) return null;
  if (HAS_SCHEME.test(text) || OPAQUE_SCHEMES.test(text)) return text;
  return (LOCAL_HOST.test(text) ? 'http://' : 'https://') + text;
}

/** ADR-0006: 에이전트 탭이 이동할 수 있는 스킴. chrome:·devtools:·file: 등 내부·로컬 주소는 사람 창 정보에 닿을 수 있다 */
const AGENT_SCHEMES = new Set(['http:', 'https:', 'data:', 'blob:']);

export function isAgentNavigable(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    return AGENT_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
