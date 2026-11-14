export interface TargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached?: boolean;
  [key: string]: unknown;
}

/** 클라이언트가 보낸 CDP 요청 */
export interface ClientRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

/** CDP 오류 코드(서버 오류). 막힌 명령에 쓴다 */
export const CDP_SERVER_ERROR = -32000;

export const blockedError = (reason: string) => ({ code: CDP_SERVER_ERROR, message: `agent-browser: ${reason}` });
