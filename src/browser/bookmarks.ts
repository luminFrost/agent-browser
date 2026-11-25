// 북마크(카드 20261125-bookmarks). 사람 창만 쓴다. 프로필 폴더의 bookmarks.json에 폴더 트리로 남긴다.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BookmarkLink { id: string; title: string; url: string }
export interface BookmarkFolder { id: string; title: string; children: BookmarkNode[] }
export type BookmarkNode = BookmarkLink | BookmarkFolder;

export const BOOKMARKS_FILE_NAME = 'bookmarks.json';

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
