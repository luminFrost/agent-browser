const FALLBACK_NAME = 'download';

/** 사이트가 준 파일 이름에서 경로를 떼고, 숨김 파일·빈 이름을 막는다(폴더 밖으로 못 나가게) */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const trimmed = base.replace(/^\.+/, '').trim();
  return trimmed || FALLBACK_NAME;
}

/** 이미 있는 이름이면 확장자 앞에 (1), (2)…를 붙인다 */
export function uniqueName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!exists(candidate)) return candidate;
  }
}
