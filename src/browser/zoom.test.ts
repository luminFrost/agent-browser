// 카드 20261128-find-zoom Z1·Z2: 확대·축소 단계, 사이트(host), zoom.json
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZoom, stepZoom, writeZoom, zoomCss, zoomHost, zoomPercent, ZOOM_FILE_NAME, ZOOM_STEPS } from './zoom';

describe('확대 단계 (Z1)', () => {
  it('Chrome 단계 중 50~300%', () => {
    expect(ZOOM_STEPS.map(zoomPercent)).toEqual([50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300]);
  });
  it('한 단계씩 오르내리고 끝에서는 그대로', () => {
    expect(zoomPercent(stepZoom(1, 1))).toBe(110);
    expect(zoomPercent(stepZoom(1, -1))).toBe(90);
    expect(zoomPercent(stepZoom(1.25, 1))).toBe(150);
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
  it('단계에 없는 값은 가까운 쪽 다음 단계로', () => {
    expect(zoomPercent(stepZoom(1.2, 1))).toBe(125);
    expect(zoomPercent(stepZoom(1.2, -1))).toBe(110);
  });
});

describe('사이트 (Z2)', () => {
  it('http·https는 host, 그 밖은 없음', () => {
    expect(zoomHost('https://Example.com:8443/a?b')).toBe('example.com:8443');
    expect(zoomHost('http://127.0.0.1:5000/x')).toBe('127.0.0.1:5000');
    for (const no of ['about:blank', 'data:text/html,hi', 'file:///a.html', '', 'not a url']) expect(zoomHost(no)).toBeUndefined();
  });
  it('100%면 CSS를 넣지 않고, 아니면 html에 zoom', () => {
    expect(zoomCss(1)).toBeUndefined();
    expect(zoomCss(1.25)).toBe('html { zoom: 1.25 !important }');
  });
});

describe('zoom.json (Z2)', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'zoom-'));
  it('쓰고 다시 읽는다. 100%는 남기지 않는다', () => {
    const d = dir();
    writeZoom(d, new Map([['a.test', 1.25], ['b.test', 1], ['c.test', 0.5]]));
    expect(JSON.parse(readFileSync(join(d, ZOOM_FILE_NAME), 'utf8'))).toEqual({ hosts: { 'a.test': 1.25, 'c.test': 0.5 } });
    expect([...readZoom(d)]).toEqual([['a.test', 1.25], ['c.test', 0.5]]);
  });
  it('없거나 틀린 파일은 빈 값(모두 100%), 단계에 없는 값·모르는 형식은 버린다', () => {
    const d = dir();
    expect(readZoom(d).size).toBe(0);
    writeFileSync(join(d, ZOOM_FILE_NAME), '{not json');
    expect(readZoom(d).size).toBe(0);
    writeFileSync(join(d, ZOOM_FILE_NAME), JSON.stringify({ hosts: { 'a.test': 1.5, 'b.test': 7, 'c.test': 'x', 'd.test': 1 } }));
    expect([...readZoom(d)]).toEqual([['a.test', 1.5]]);
  });
  it('쓸 수 없는 곳이어도 던지지 않는다', () => {
    expect(() => writeZoom(join(dir(), 'none', 'deeper'), new Map([['a.test', 2]]))).not.toThrow();
  });
});
