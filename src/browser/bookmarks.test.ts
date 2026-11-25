// 카드 20261125-bookmarks B1: 북마크 저장·찾기·지우기
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addBookmark, BOOKMARKS_FILE_NAME, findByUrl, readBookmarks, removeBookmark, writeBookmarks,
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
