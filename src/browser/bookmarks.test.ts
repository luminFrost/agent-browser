// 카드 20261125-bookmarks B1·B3: 북마크 저장·찾기·지우기와 Chrome 북마크 변환
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addBookmark, BOOKMARKS_FILE_NAME, chromeBookmarksPath, findByUrl, importChrome, readBookmarks, removeBookmark, writeBookmarks,
  type BookmarkNode,
} from './bookmarks';

const dir = () => mkdtempSync(join(tmpdir(), 'ab-bm-'));
const link = (id: string, url: string, title = id): BookmarkNode => ({ id, title, url });

describe('북마크 파일', () => {
  it('없거나 깨졌으면 빈 목록, 잘못된 항목은 버린다', () => {
    const d = dir();
    expect(readBookmarks(d)).toEqual([]);
    writeFileSync(join(d, BOOKMARKS_FILE_NAME), '{not json');
    expect(readBookmarks(d)).toEqual([]);
    writeFileSync(join(d, BOOKMARKS_FILE_NAME), JSON.stringify([
      { id: 'a', title: 'A', url: 'https://a.test/' }, { id: 'x' }, 7,
      { id: 'f', title: 'F', children: [{ id: 'b', title: 'B', url: 'https://b.test/' }, { bad: 1 }] },
    ]));
    expect(readBookmarks(d)).toEqual([
      { id: 'a', title: 'A', url: 'https://a.test/' },
      { id: 'f', title: 'F', children: [{ id: 'b', title: 'B', url: 'https://b.test/' }] },
    ]);
  });
  it('쓴 것을 그대로 읽는다', () => {
    const d = dir();
    const nodes: BookmarkNode[] = [link('a', 'https://a.test/'), { id: 'f', title: 'F', children: [link('b', 'https://b.test/')] }];
    writeBookmarks(d, nodes);
    expect(readBookmarks(d)).toEqual(nodes);
    expect(JSON.parse(readFileSync(join(d, BOOKMARKS_FILE_NAME), 'utf8'))).toEqual(nodes);
  });
});

describe('찾기·더하기·지우기', () => {
  const tree: BookmarkNode[] = [link('a', 'https://a.test/'), { id: 'f', title: 'F', children: [link('b', 'https://b.test/')] }];
  it('폴더 안까지 주소로 찾는다', () => {
    expect(findByUrl(tree, 'https://b.test/')?.id).toBe('b');
    expect(findByUrl(tree, 'https://c.test/')).toBeUndefined();
  });
  it('맨 끝에 더하고, 이미 있는 주소면 그대로', () => {
    const added = addBookmark(tree, { title: 'C', url: 'https://c.test/' });
    expect(added).toHaveLength(3);
    expect(added[2]).toMatchObject({ title: 'C', url: 'https://c.test/' });
    expect(addBookmark(tree, { title: 'B again', url: 'https://b.test/' })).toBe(tree);
  });
  it('폴더 안의 것도 id로 지우고, 폴더도 지운다', () => {
    expect(removeBookmark(tree, 'b')).toEqual([link('a', 'https://a.test/'), { id: 'f', title: 'F', children: [] }]);
    expect(removeBookmark(tree, 'f')).toEqual([link('a', 'https://a.test/')]);
  });
});

describe('Chrome 북마크 가져오기', () => {
  const chrome = {
    roots: {
      bookmark_bar: { type: 'folder', name: '북마크바', children: [
        { type: 'url', name: 'A', url: 'https://a.test/' },
        { type: 'url', name: 'JS', url: 'javascript:alert(1)' },
        { type: 'folder', name: '일', children: [{ type: 'url', name: 'B', url: 'https://b.test/' }, { type: 'folder', name: '빈', children: [] }] },
      ] },
      other: { type: 'folder', name: '기타 북마크', children: [{ type: 'url', name: 'C', url: 'http://c.test/' }] },
      synced: { type: 'folder', name: '모바일', children: [{ type: 'url', name: 'M', url: 'https://m.test/' }] },
    },
  };
  it('북마크바는 맨 위에, 기타 북마크는 폴더로. http·https만, 빈 폴더는 버린다', () => {
    const r = importChrome(chrome, []);
    expect(r.added).toBe(3);
    const shape = (n: BookmarkNode[]): unknown[] => n.map((x) => ('url' in x ? x.title : { [x.title]: shape(x.children) }));
    expect(shape(r.nodes)).toEqual(['A', { 일: ['B'] }, { '기타 북마크': ['C'] }]);
  });
  it('이미 있는 주소는 건너뛴다(두 번 가져와도 그대로)', () => {
    const once = importChrome(chrome, []).nodes;
    const twice = importChrome(chrome, once);
    expect(twice.added).toBe(0);
    expect(twice.nodes).toEqual(once);
  });
  it('형식이 아니면 0개', () => {
    expect(importChrome({ nope: 1 }, []).added).toBe(0);
    expect(importChrome(null, []).added).toBe(0);
  });
});

describe('Chrome 북마크 파일 위치', () => {
  it('macOS: Local State의 마지막 사용 프로필, 없으면 Default', () => {
    const home = dir();
    const base = join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    expect(chromeBookmarksPath('darwin', home)).toBe(join(base, 'Default', 'Bookmarks'));
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'Local State'), JSON.stringify({ profile: { last_used: 'Profile 2' } }));
    expect(chromeBookmarksPath('darwin', home)).toBe(join(base, 'Profile 2', 'Bookmarks'));
  });
  it('Linux: ~/.config/google-chrome', () => {
    const home = dir();
    expect(chromeBookmarksPath('linux', home)).toBe(join(home, '.config', 'google-chrome', 'Default', 'Bookmarks'));
  });
});
