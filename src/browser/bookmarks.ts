// 북마크(카드 20261125-bookmarks). 사람 창만 쓴다. 프로필 폴더의 bookmarks.json에 폴더 트리로 남긴다.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BookmarkLink { id: string; title: string; url: string }
export interface BookmarkFolder { id: string; title: string; children: BookmarkNode[] }
export type BookmarkNode = BookmarkLink | BookmarkFolder;

export const BOOKMARKS_FILE_NAME = 'bookmarks.json';
/** 가져오는 주소의 프로토콜. bookmarklet(javascript:)·chrome:// 등은 사람 탭에서 열 수 없거나 열면 안 된다 */
const IMPORTABLE = /^https?:\/\//i;
/** Chrome 기타 북마크를 담을 폴더 이름(Chrome 화면의 이름과 같다) */
const CHROME_OTHER_FOLDER = '기타 북마크';

export const isFolder = (n: BookmarkNode): n is BookmarkFolder => 'children' in n;

/** 형식이 맞는 항목만 남긴다(손으로 고친 파일, 다른 버전이 쓴 파일) */
function clean(raw: unknown): BookmarkNode[] {
  if (!Array.isArray(raw)) return [];
  const out: BookmarkNode[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.title !== 'string') continue;
    if (typeof r.url === 'string') out.push({ id: r.id, title: r.title, url: r.url });
    else if (Array.isArray(r.children)) out.push({ id: r.id, title: r.title, children: clean(r.children) });
  }
  return out;
}

/** 없거나 읽을 수 없으면 빈 목록 */
export function readBookmarks(profileDir: string): BookmarkNode[] {
  try {
    return clean(JSON.parse(readFileSync(join(profileDir, BOOKMARKS_FILE_NAME), 'utf8')));
  } catch {
    return [];
  }
}

/** 쓰기에 실패해도 앱은 계속 돈다(이번 실행 동안만 남는다) */
export function writeBookmarks(profileDir: string, nodes: BookmarkNode[]): void {
  try {
    writeFileSync(join(profileDir, BOOKMARKS_FILE_NAME), JSON.stringify(nodes, null, 2));
  } catch {
    // 프로필 폴더에 쓸 수 없다
  }
}

/** 폴더 안까지 주소로 찾는다 */
export function findByUrl(nodes: BookmarkNode[], url: string): BookmarkLink | undefined {
  for (const n of nodes) {
    const hit = isFolder(n) ? findByUrl(n.children, url) : n.url === url ? n : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** id로 찾는다(링크·폴더) */
export function findById(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = isFolder(n) ? findById(n.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** 맨 끝에 더한다. 이미 있는 주소면 그대로(같은 배열) */
export function addBookmark(nodes: BookmarkNode[], b: { title: string; url: string }): BookmarkNode[] {
  if (findByUrl(nodes, b.url)) return nodes;
  return [...nodes, { id: randomUUID(), title: b.title || b.url, url: b.url }];
}

/** id로 지운다(폴더 안까지, 폴더면 통째로) */
export function removeBookmark(nodes: BookmarkNode[], id: string): BookmarkNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => (isFolder(n) ? { ...n, children: removeBookmark(n.children, id) } : n));
}

interface ChromeNode { type?: unknown; name?: unknown; url?: unknown; children?: unknown }

/** Chrome 노드 → 북마크. seen에 있는 주소와 가져올 수 없는 주소는 빼고, 비게 된 폴더는 버린다 */
function fromChrome(children: unknown, seen: Set<string>): { nodes: BookmarkNode[]; added: number } {
  const nodes: BookmarkNode[] = [];
  let added = 0;
  if (!Array.isArray(children)) return { nodes, added };
  for (const c of children as ChromeNode[]) {
    if (!c || typeof c !== 'object') continue;
    const title = typeof c.name === 'string' ? c.name : '';
    if (c.type === 'url' && typeof c.url === 'string') {
      if (!IMPORTABLE.test(c.url) || seen.has(c.url)) continue;
      seen.add(c.url);
      nodes.push({ id: randomUUID(), title: title || c.url, url: c.url });
      added++;
    } else if (c.type === 'folder') {
      const sub = fromChrome(c.children, seen);
      if (sub.nodes.length === 0) continue;
      nodes.push({ id: randomUUID(), title, children: sub.nodes });
      added += sub.added;
    }
  }
  return { nodes, added };
}

const allUrls = (nodes: BookmarkNode[], into = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    if (isFolder(n)) allUrls(n.children, into);
    else into.add(n.url);
  }
  return into;
};

/**
 * Chrome Bookmarks 파일(JSON) → 지금 북마크 뒤에 붙인다. 북마크바의 항목은 맨 위에, 기타 북마크는 폴더 하나로.
 * 모바일(synced)은 가져오지 않는다(Chrome 데스크톱 막대에도 없다)
 */
export function importChrome(chrome: unknown, existing: BookmarkNode[]): { nodes: BookmarkNode[]; added: number } {
  const roots = (chrome as { roots?: { bookmark_bar?: ChromeNode; other?: ChromeNode } } | null)?.roots;
  if (!roots || typeof roots !== 'object') return { nodes: existing, added: 0 };
  const seen = allUrls(existing);
  const bar = fromChrome(roots.bookmark_bar?.children, seen);
  const other = fromChrome(roots.other?.children, seen);
  const added = bar.added + other.added;
  if (added === 0) return { nodes: existing, added: 0 };
  const otherFolder: BookmarkNode[] = other.nodes.length ? [{ id: randomUUID(), title: CHROME_OTHER_FOLDER, children: other.nodes }] : [];
  return { nodes: [...existing, ...bar.nodes, ...otherFolder], added };
}

/** Chrome이 마지막으로 쓴 프로필의 Bookmarks 파일 경로(Local State의 profile.last_used, 없으면 Default) */
export function chromeBookmarksPath(platform: NodeJS.Platform, home: string): string {
  const base = platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    : join(home, '.config', 'google-chrome');
  let profile = 'Default';
  try {
    const last = (JSON.parse(readFileSync(join(base, 'Local State'), 'utf8')) as { profile?: { last_used?: unknown } }).profile?.last_used;
    if (typeof last === 'string' && last && !last.includes('/') && !last.includes('..')) profile = last;
  } catch {
    // Local State가 없으면 Default
  }
  return join(base, profile, 'Bookmarks');
}
