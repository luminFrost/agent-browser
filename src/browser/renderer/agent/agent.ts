// 에이전트 창 머리줄: 세션 id와 탭 주소를 보인다(보기 전용).
interface AgentTabView { id: number; title: string; url: string; loading: boolean }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 전역 Window 확장(preload가 연 agentApi)이라 선언만 있다
interface Window {
  agentApi: { sessionId: string; onState(listener: (s: { tabs: AgentTabView[]; activeId: number | null }) => void): void };
}

{
  const api = window.agentApi;
  (document.getElementById('session') as HTMLElement).textContent = api.sessionId;
  const tabs = document.getElementById('tabs') as HTMLElement;
  api.onState((s) => {
    tabs.textContent = s.tabs.map((t) => (t.id === s.activeId ? '▶ ' : '') + (t.url || 'about:blank')).join('   ');
  });
}
