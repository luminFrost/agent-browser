// 불러오기 실패·차단 오류 페이지. 문구는 쿼리로 받는다(textContent로만 넣는다).
{
  const q = new URLSearchParams(location.search);
  const heading = q.get('heading');
  if (heading) (document.getElementById('heading') as HTMLElement).textContent = heading;
  (document.getElementById('url') as HTMLElement).textContent = q.get('url') ?? '';
  (document.getElementById('reason') as HTMLElement).textContent = q.get('error') ?? '';
}
