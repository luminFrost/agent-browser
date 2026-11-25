// 카드 20261125-bookmark-file F1·F2: 북마크 HTML 파일(Netscape 형식) 읽기·쓰기
import { describe, expect, it } from 'vitest';
import { mergeImported, parseBookmarkHtml, toBookmarkHtml } from './bookmarkFile';
import type { BookmarkNode } from './bookmarks';

const shape = (n: BookmarkNode[]): unknown[] => n.map((x) => ('children' in x ? { [x.title]: shape(x.children) } : `${x.title}|${x.url}`));

// Chrome "북마크 내보내기"와 같은 모양(대문자 태그, <p>, ADD_DATE, 엔터티)
const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000001" PERSONAL_TOOLBAR_FOLDER="true">북마크바</H3>
    <DL><p>
        <DT><A HREF="https://a.test/?x=1&amp;y=2" ADD_DATE="1700000000" ICON="data:image/png;base64,AAA">A &amp; B</A>
        <DT><A HREF="javascript:alert(1)">JS</A>
        <DT><H3 ADD_DATE="1700000000">일</H3>
        <DL><p>
            <DT><A HREF="https://b.test/">B</A>
            <DT><H3>빈 폴더</H3>
            <DL><p>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><A HREF="http://c.test/">C</A>
</DL><p>
`;

describe('북마크 HTML 읽기', () => {
  it('북마크바 폴더는 맨 위 단계로 풀고, 폴더·엔터티를 살린다', () => {
    expect(shape(parseBookmarkHtml(CHROME))).toEqual([
      'A & B|https://a.test/?x=1&y=2', 'JS|javascript:alert(1)', { 일: ['B|https://b.test/', { '빈 폴더': [] }] }, 'C|http://c.test/',
    ]);
  });
  it('형식이 아니면 빈 목록', () => {
    expect(parseBookmarkHtml('hello')).toEqual([]);
    expect(parseBookmarkHtml('')).toEqual([]);
  });
});

describe('가져온 것 더하기', () => {
  it('http·https만, 이미 있는 주소는 건너뛰고, 비게 된 폴더는 버린다', () => {
    const existing: BookmarkNode[] = [{ id: 'x', title: 'old C', url: 'http://c.test/' }];
    const r = mergeImported(existing, parseBookmarkHtml(CHROME));
    expect(r.added).toBe(2);
    expect(shape(r.nodes)).toEqual(['old C|http://c.test/', 'A & B|https://a.test/?x=1&y=2', { 일: ['B|https://b.test/'] }]);
    expect(mergeImported(r.nodes, parseBookmarkHtml(CHROME)).added).toBe(0);
  });
});

describe('북마크 HTML 쓰기', () => {
  it('Netscape 형식이고, 다시 읽으면 같다(특수 문자 포함)', () => {
    const nodes: BookmarkNode[] = [
      { id: '1', title: 'A <b> & "q"', url: 'https://a.test/?x=1&y="2"' },
      { id: '2', title: '폴더', children: [{ id: '3', title: 'B', url: 'https://b.test/' }, { id: '4', title: '안', children: [] }] },
    ];
    const html = toBookmarkHtml(nodes);
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(shape(parseBookmarkHtml(html))).toEqual(shape(nodes));
  });
});
