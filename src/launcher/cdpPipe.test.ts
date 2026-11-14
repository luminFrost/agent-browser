import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { CdpPipe, type CdpMessage } from './cdpPipe';

const setup = () => {
  const toBrowser = new PassThrough();
  const fromBrowser = new PassThrough();
  const pipe = new CdpPipe(toBrowser, fromBrowser);
  const written: string[] = [];
  toBrowser.on('data', (d: Buffer) => written.push(d.toString()));
  return { pipe, fromBrowser, written };
};

describe('CdpPipe', () => {
  it('요청은 JSON + NUL로 쓰고, 응답 id로 결과를 돌려준다', async () => {
    const { pipe, fromBrowser, written } = setup();
    const result = pipe.send('Browser.getVersion');
    await new Promise((r) => setImmediate(r));
    const sent = JSON.parse(written.join('').replace(/\0$/, '')) as CdpMessage;
    expect(written.join('').endsWith('\0')).toBe(true);
    expect(sent.method).toBe('Browser.getVersion');
    expect(sent.id).toBeLessThan(0); // 앱 내부 요청은 음수 id(중계 클라이언트 id와 겹치지 않음)
    fromBrowser.write(JSON.stringify({ id: sent.id, result: { product: 'x' } }) + '\0');
    await expect(result).resolves.toEqual({ product: 'x' });
  });

  it('메시지가 청크 사이에서 잘려도, 한 청크에 여러 개가 와도 하나씩 나눈다', async () => {
    const { pipe, fromBrowser } = setup();
    const got: CdpMessage[] = [];
    pipe.on('message', (m: CdpMessage) => got.push(m));
    const a = JSON.stringify({ method: 'A.a' });
    const b = JSON.stringify({ method: 'B.b', params: { s: '한글' } });
    fromBrowser.write(a.slice(0, 3));
    fromBrowser.write(a.slice(3) + '\0' + b + '\0');
    await new Promise((r) => setImmediate(r));
    expect(got.map((m) => m.method)).toEqual(['A.a', 'B.b']);
    expect(got[1].params).toEqual({ s: '한글' });
  });

  it('오류 응답은 reject하고, 내 요청이 아닌 응답은 message로 내보낸다', async () => {
    const { pipe, fromBrowser } = setup();
    const others: CdpMessage[] = [];
    pipe.on('message', (m: CdpMessage) => others.push(m));
    const p = pipe.send('Target.createTarget');
    fromBrowser.write(JSON.stringify({ id: -1, error: { code: -32000, message: 'Not supported' } }) + '\0');
    fromBrowser.write(JSON.stringify({ id: 7, result: {} }) + '\0');
    await expect(p).rejects.toThrow('Not supported');
    expect(others).toEqual([{ id: 7, result: {} }]);
  });

  it('파이프가 닫히면 기다리던 요청은 실패한다', async () => {
    const { pipe, fromBrowser } = setup();
    const p = pipe.send('Browser.getVersion');
    fromBrowser.destroy();
    await expect(p).rejects.toThrow('닫혔다');
  });
});
