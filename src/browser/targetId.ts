import type { WebContents } from 'electron';

const PROTOCOL_VERSION = '1.3';

/**
 * webContents의 CDP targetId를 알아낸다. Electron은 이 값을 직접 주지 않으므로
 * 잠깐 debugger를 붙여 `Target.getTargetInfo`(인자 없음 = 자기 자신)를 부른다.
 */
export async function targetIdOf(contents: WebContents): Promise<string> {
  const dbg = contents.debugger;
  const alreadyAttached = dbg.isAttached();
  if (!alreadyAttached) dbg.attach(PROTOCOL_VERSION);
  try {
    const r = (await dbg.sendCommand('Target.getTargetInfo')) as { targetInfo: { targetId: string } };
    return r.targetInfo.targetId;
  } finally {
    if (!alreadyAttached) dbg.detach();
  }
}
