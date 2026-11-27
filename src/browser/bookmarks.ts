// 북마크(카드 20261125-bookmarks). 사람 창만 쓴다. 프로필 폴더의 bookmarks.json에 폴더 트리로 남긴다.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** icon: 사이트 아이콘(data: URL, 북마크할 때 남긴다. 카드 20261127-bookmark-folders G1) */
export interface BookmarkLink { id: string; title: string; url: string; icon?: string }
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
    if (typeof r.url === 'string') out.push({ id: r.id, title: r.title, url: r.url, ...(typeof r.icon === 'string' && r.icon.startsWith('data:image/') ? { icon: r.icon } : {}) });
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
export function addBookmark(nodes: BookmarkNode[], b: { title: string; url: string; icon?: string }): BookmarkNode[] {
  if (findByUrl(nodes, b.url)) return nodes;
  return [...nodes, { id: randomUUID(), title: b.title || b.url, url: b.url, ...(b.icon ? { icon: b.icon } : {}) }];
}

/** id로 지운다(폴더 안까지, 폴더면 통째로) */
export function removeBookmark(nodes: BookmarkNode[], id: string): BookmarkNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => (isFolder(n) ? { ...n, children: removeBookmark(n.children, id) } : n));
}

/** 새 폴더 이름이 비었을 때 */
const NEW_FOLDER_TITLE = '새 폴더';

/** 맨 끝에 빈 폴더를 더한다 */
export function addFolder(nodes: BookmarkNode[], title: string): BookmarkNode[] {
  return [...nodes, { id: randomUUID(), title: title.trim() || NEW_FOLDER_TITLE, children: [] }];
}

/** 이름을 바꾼다(폴더 안까지). 빈 이름이면 그대로 */
export function renameNode(nodes: BookmarkNode[], id: string, title: string): BookmarkNode[] {
  const t = title.trim();
  if (!t) return nodes;
  return nodes.map((n) => (n.id === id ? { ...n, title: t } : isFolder(n) ? { ...n, children: renameNode(n.children, id, title) } : n));
}

/** id(와 그 안)에 folderId가 있는가: 폴더를 자기 안으로 옮기는 것을 막는다 */
const contains = (node: BookmarkNode, id: string): boolean => node.id === id || (isFolder(node) && node.children.some((c) => contains(c, id)));

/** 북마크·폴더를 폴더 맨 끝(folderId가 null이면 북마크 막대 맨 끝)으로 옮긴다. 자기 안으로는 옮기지 않는다 */
export function moveNode(nodes: BookmarkNode[], id: string, folderId: string | null): BookmarkNode[] {
  const node = findById(nodes, id);
  if (!node || (folderId !== null && contains(node, folderId))) return nodes;
  if (folderId !== null) {
    const target = findById(nodes, folderId);
    // 폴더가 아니거나 없는 곳이면 아무것도 바꾸지 않는다(옮기던 것을 잃지 않게)
    if (!target || !isFolder(target)) return nodes;
  }
  const without = removeBookmark(nodes, id);
  if (folderId === null) return [...without, node];
  const put = (list: BookmarkNode[]): BookmarkNode[] => list.map((n) => (!isFolder(n) ? n
    : n.id === folderId ? { ...n, children: [...n.children, node] } : { ...n, children: put(n.children) }));
  return put(without);
}

/** 옮길 곳으로 고를 폴더 목록(경로 이름). except 폴더와 그 안은 뺀다 */
export function folderChoices(nodes: BookmarkNode[], except?: string, prefix = ''): { id: string; label: string }[] {
  return nodes.flatMap((n) => (!isFolder(n) || n.id === except ? []
    : [{ id: n.id, label: prefix + n.title }, ...folderChoices(n.children, except, `${prefix}${n.title} › `)]));
}
