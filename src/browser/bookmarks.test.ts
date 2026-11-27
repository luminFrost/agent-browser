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

// 카드 20261127-bookmark-folders G2: 폴더 만들기·이름 바꾸기·옮기기
import { addFolder, folderChoices, moveNode, renameNode } from './bookmarks';
describe('폴더', () => {
  const base = (): BookmarkNode[] => [link('a', 'https://a.test/'), { id: 'f', title: 'F', children: [{ id: 'g', title: 'G', children: [] }] }, link('b', 'https://b.test/')];
  it('새 폴더는 맨 끝에, 이름이 비면 "새 폴더"', () => {
    const r = addFolder(base(), '  일  ');
    expect(r.at(-1)).toMatchObject({ title: '일', children: [] });
    expect(addFolder(base(), '  ').at(-1)).toMatchObject({ title: '새 폴더' });
  });
  it('이름 바꾸기(폴더 안까지), 빈 이름은 그대로', () => {
    expect(renameNode(base(), 'g', 'GG')[1]).toMatchObject({ children: [{ id: 'g', title: 'GG' }] });
    expect(renameNode(base(), 'a', ' ')).toEqual(base());
  });
  it('폴더로 옮기고, 맨 위(null)로 꺼낸다', () => {
    const inF = moveNode(base(), 'a', 'g');
    expect(inF.map((n) => n.id)).toEqual(['f', 'b']);
    expect(JSON.stringify(inF)).toContain('"id":"g","title":"G","children":[{"id":"a"');
    expect(moveNode(inF, 'a', null).map((n) => n.id)).toEqual(['f', 'b', 'a']);
  });
  it('폴더를 자기 자신이나 자기 안의 폴더로 옮기지 못한다', () => {
    expect(moveNode(base(), 'f', 'f')).toEqual(base());
    expect(moveNode(base(), 'f', 'g')).toEqual(base());
  });
  it('옮길 곳 목록: 폴더마다 경로 이름, 옮기는 폴더와 그 안은 뺀다', () => {
    expect(folderChoices(base())).toEqual([{ id: 'f', label: 'F' }, { id: 'g', label: 'F › G' }]);
    expect(folderChoices(base(), 'f')).toEqual([]);
  });
});

// 검토 1회 Major: 옮길 곳이 폴더가 아니면(링크·없는 id) 그대로. 아이콘은 data:image/만 남는다(G1)
describe('검토 지적', () => {
  it('링크로 옮기라고 하면 아무것도 지우지 않는다', () => {
    const t: BookmarkNode[] = [link('a', 'https://a.test/'), link('b', 'https://b.test/'), { id: 'f', title: 'F', children: [] }];
    expect(moveNode(t, 'a', 'b')).toEqual(t);
    expect(moveNode(t, 'a', 'nope')).toEqual(t);
  });
  it('아이콘: 더할 때 남기고, 읽을 때 data:image/가 아니면 버린다', () => {
    const d = dir();
    const nodes = addBookmark([], { title: 'A', url: 'https://a.test/', icon: 'data:image/png;base64,AAA' });
    expect(nodes[0]).toMatchObject({ icon: 'data:image/png;base64,AAA' });
    writeFileSync(join(d, BOOKMARKS_FILE_NAME), JSON.stringify([...nodes, { id: 'x', title: 'X', url: 'https://x.test/', icon: 'javascript:alert(1)' }]));
    const read = readBookmarks(d);
    expect(read[0]).toMatchObject({ icon: 'data:image/png;base64,AAA' });
    expect(read[1]).not.toHaveProperty('icon');
  });
});
