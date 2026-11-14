/** 사람에게 묻는 승인 요청 하나(R12 폼 제출, R13 다운로드) */
export interface ApprovalView {
  id: string;
  sessionId: string;
  /** 요청이 가는 호스트(host:port) */
  host: string;
  kind: 'form' | 'download';
  /** 다운로드면 파일 이름 */
  detail?: string;
}
