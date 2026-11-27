// 카드 20261127-bookmark-folders G1(검토 3회 Major): 아이콘 응답 → data: URL, 크기 상한을 받는 중에도 지킨다
import { describe, expect, it } from 'vitest';
import { iconResponseToDataUrl } from './favicon';

const MAX = 1024;
const streamed = (chunks: number, size: number, headers: Record<string, string> = {}) => {
  let sent = 0;
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { pulled++; if (sent++ < chunks) c.enqueue(new Uint8Array(size)); else c.close(); },
  });
  return { res: new Response(body, { headers: { 'content-type': 'image/png', ...headers } }), pulled: () => pulled };
};

describe('아이콘 응답 → data: URL', () => {
  it('작은 이미지는 data: URL', async () => {
    const r = await iconResponseToDataUrl(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png; charset=x' } }), MAX);
    expect(r).toBe('data:image/png;base64,AQID');
  });
  it('이미지가 아니거나 실패 응답이면 없음', async () => {
    expect(await iconResponseToDataUrl(new Response('x', { headers: { 'content-type': 'text/html' } }), MAX)).toBeUndefined();
    expect(await iconResponseToDataUrl(new Response('x', { status: 404, headers: { 'content-type': 'image/png' } }), MAX)).toBeUndefined();
  });
  it('길이 머리가 상한을 넘으면 본문을 읽지 않는다', async () => {
    const s = streamed(10, 512, { 'content-length': String(10 * 512) });
    expect(await iconResponseToDataUrl(s.res, MAX)).toBeUndefined();
    expect(s.pulled()).toBeLessThanOrEqual(1);
  });
  it('길이 머리 없이 조각으로 오면 상한을 넘는 순간 멈춘다(끝까지 받지 않는다)', async () => {
    const s = streamed(100, 512);
    expect(await iconResponseToDataUrl(s.res, MAX)).toBeUndefined();
    expect(s.pulled()).toBeLessThan(10);
  });
});
