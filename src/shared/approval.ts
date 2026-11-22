/** 사람에게 묻는 승인 요청 하나(R12 폼 제출, R13 다운로드) */
export interface ApprovalView {
  id: string;
  sessionId: string;
  /** 요청이 가는 호스트(host:port) */
  host: string;
  kind: 'form' | 'download';
  /** 다운로드면 파일 이름 */
  detail?: string;
  /** 답이 없으면 이 시각(epoch ms)에 거부로 끝난다 */
  expiresAt: number;
}
