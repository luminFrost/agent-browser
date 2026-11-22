// 사람 창 UI 지키기(카드 20261122-human-ui-guard). 사람 창 UI는 승인·멈추기 명령을 보낼 수 있으므로,
// 그 자리에 다른 페이지가 들어와도 명령을 받지 않게 보낸 프레임의 주소를 UI 파일 주소와 견준다.

/** 조각(#)·쿼리(?)를 뺀 주소가 UI 파일 주소와 같은가 */
export function isHumanUiUrl(url: string | undefined, uiUrl: string): boolean {
  if (!url) return false;
  const strip = (u: string) => u.split('#')[0].split('?')[0];
  return strip(url) === strip(uiUrl);
}
