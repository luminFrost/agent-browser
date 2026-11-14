import { renameSync, rmSync, writeFileSync } from 'node:fs';

export interface ControlInfo {
  /** 제어 서버 포트(127.0.0.1) */
  port: number;
  /** `Authorization: Bearer <token>`에 쓰는 토큰 */
  token: string;
}

/**
 * 제어 정보를 권한 0600 파일로 쓴다. 이미 있는 파일의 권한을 물려받지 않도록 새 파일에 쓰고 바꿔 끼운다.
 */
export function writeControlFile(path: string, info: ControlInfo): void {
  const temp = `${path}.${process.pid}.tmp`;
  rmSync(temp, { force: true });
  writeFileSync(temp, JSON.stringify(info), { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}

export function removeControlFile(path: string): void {
  rmSync(path, { force: true });
}
