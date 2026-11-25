// 북마크 파일 가져오기·내보내기(카드 20261125-bookmark-file). Chrome·Safari·Edge가 "북마크 내보내기"로 만드는
// Netscape 북마크 HTML 형식을 읽고 쓴다. 사람이 고른 파일만 읽는다(다른 앱의 폴더는 보지 않는다).
import { randomUUID } from 'node:crypto';
import { isFolder, type BookmarkFolder, type BookmarkNode } from './bookmarks';

/** 가져오는 주소의 프로토콜. bookmarklet(javascript:)·chrome:// 등은 사람 탭에서 열 수 없거나 열면 안 된다 */
const IMPORTABLE = /^https?:\/\//i;
/** 폴더 제목·링크·목록 열고 닫기. 다른 태그(<p>, <META> 등)는 건너뛴다 */
const TOKEN = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A\s([^>]*)>([\s\S]*?)<\/A>|<DL\b[^>]*>|<\/DL>/gi;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  })
  .trim();
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 북마크 HTML → 북마크 트리(걸러 내지 않은 그대로). 북마크바 폴더(PERSONAL_TOOLBAR_FOLDER)는 맨 위 단계로 푼다:
 * 이 앱의 북마크 막대가 그 자리다. 형식이 아니면 빈 목록
 */
export function parseBookmarkHtml(html: string): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: BookmarkNode[][] = [root];
  const toolbar = new Set<BookmarkFolder>();
  let pending: BookmarkFolder | undefined;
  for (const m of html.matchAll(TOKEN)) {
    const [tag, h3Attrs, h3Title, aAttrs, aTitle] = m;
    const here = stack[stack.length - 1];
    if (h3Title !== undefined) {
      pending = { id: randomUUID(), title: decode(h3Title), children: [] };
      if (/PERSONAL_TOOLBAR_FOLDER\s*=\s*"true"/i.test(h3Attrs ?? '') && stack.length === 1) toolbar.add(pending);
      here.push(pending);
    } else if (aAttrs !== undefined) {
      const href = /\bHREF\s*=\s*"([^"]*)"/i.exec(aAttrs)?.[1];
      if (href !== undefined) {
        const url = decode(href);
        here.push({ id: randomUUID(), title: decode(aTitle ?? '') || url, url });
      }
    } else if (tag.startsWith('</')) {
      if (stack.length > 1) stack.pop();
    } else if (pending) {
      // 폴더 제목 바로 뒤의 <DL>이 그 폴더의 목록이다(맨 처음 <DL>은 파일 전체 목록)
      stack.push(pending.children);
      pending = undefined;
    }
  }
  return root.flatMap((n) => (isFolder(n) && toolbar.has(n) ? n.children : [n]));
}

const allUrls = (nodes: BookmarkNode[], into = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    if (isFolder(n)) allUrls(n.children, into);
    else into.add(n.url);
  }
  return into;
};

/** seen에 있는 주소와 가져올 수 없는 주소는 빼고, 비게 된 폴더는 버린다 */
function keep(nodes: BookmarkNode[], seen: Set<string>): { nodes: BookmarkNode[]; added: number } {
  const out: BookmarkNode[] = [];
  let added = 0;
  for (const n of nodes) {
    if (isFolder(n)) {
      const sub = keep(n.children, seen);
      if (sub.nodes.length === 0) continue;
      out.push({ ...n, children: sub.nodes });
      added += sub.added;
    } else if (IMPORTABLE.test(n.url) && !seen.has(n.url)) {
      seen.add(n.url);
      out.push(n);
      added++;
    }
  }
  return { nodes: out, added };
}

/** 읽어 온 북마크를 지금 북마크 뒤에 붙인다. http·https만, 이미 있는 주소는 건너뛴다 */
export function mergeImported(existing: BookmarkNode[], incoming: BookmarkNode[]): { nodes: BookmarkNode[]; added: number } {
  const r = keep(incoming, allUrls(existing));
  return r.added === 0 ? { nodes: existing, added: 0 } : { nodes: [...existing, ...r.nodes], added: r.added };
}

/** 링크 수(폴더 안까지). 내보낸 개수를 알릴 때 쓴다 */
export const countLinks = (nodes: BookmarkNode[]): number => nodes.reduce((n, x) => n + (isFolder(x) ? countLinks(x.children) : 1), 0);

/** 북마크 트리 → Netscape 북마크 HTML(브라우저들이 가져오기로 읽는 형식) */
export function toBookmarkHtml(nodes: BookmarkNode[]): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- agent-browser에서 내보낸 북마크 -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
  ];
  const list = (items: BookmarkNode[], depth: number) => {
    const pad = '    '.repeat(depth);
    lines.push(`${pad}<DL><p>`);
    for (const n of items) {
      if (isFolder(n)) {
        lines.push(`${pad}    <DT><H3>${escape(n.title)}</H3>`);
        list(n.children, depth + 1);
      } else {
        lines.push(`${pad}    <DT><A HREF="${escape(n.url)}">${escape(n.title)}</A>`);
      }
    }
    lines.push(`${pad}</DL><p>`);
  };
  list(nodes, 0);
  return lines.join('\n') + '\n';
}
