// 사이트 아이콘 응답 → data: URL(카드 20261127-bookmark-folders G1). 큰 파일을 메모리에 다 올리지 않도록
// 길이 머리가 넘으면 읽지 않고, 받는 중에 넘으면 멈춘다.

/** 이미지 응답을 data: URL로. 실패·이미지 아님·상한 초과면 없음 */
export async function iconResponseToDataUrl(res: Response, maxBytes: number): Promise<string | undefined> {
  const type = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!res.ok || !type.startsWith('image/') || !res.body) return undefined;
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) { await res.body.cancel().catch(() => undefined); return undefined; }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => undefined); return undefined; }
    chunks.push(value);
  }
  return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
}
