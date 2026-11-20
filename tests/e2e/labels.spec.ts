// 카드 20261120-session-labels: 세션 이름(별칭)
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launch, humanUi, evaluate, shown, waitFor } from './helpers';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
test.beforeEach(async () => { app = await launch(); });
test.afterEach(async () => { await app.stop(); });

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const control = () => JSON.parse(readFileSync(app.controlFile, 'utf8')) as { port: number; token: string };
const auth = () => ({ authorization: `Bearer ${control().token}` });
const make = async (label?: string) => (await (await fetch(`http://127.0.0.1:${control().port}/sessions${label === undefined ? '' : `?label=${encodeURIComponent(label)}`}`, { method: 'POST', headers: auth() })).json()) as { id: string; label?: string };
const listed = async () => ((await (await fetch(`http://127.0.0.1:${control().port}/sessions`, { headers: auth() })).json()) as { sessions: { id: string; label?: string }[] }).sessions;
const panel = (id: string) => ui<{ label: string | null; key: string | null }>(`(() => { const li = document.querySelector('#sessions .session[data-session-id="${id}"]');
  return { label: li?.querySelector('.label')?.textContent ?? null, key: li?.querySelector('.key')?.textContent ?? null }; })()`);

test('L3·L4·L6: 패널에 이름이 크게·키가 작게 나오고, 같은 이름은 번호가 붙고, 이름 없는 세션은 키만, 보는 중 표시에도 이름', async () => {
  const a = await make('agent-office');
  const b = await make('agent-office');
  const c = await make();
  expect([a.label, b.label, c.label]).toEqual(['agent-office', 'agent-office 2', undefined]);
  await waitFor(async () => (await panel(a.id)).label === 'agent-office', '패널에 A 이름');
  expect(await panel(a.id)).toEqual({ label: 'agent-office', key: a.id });
  expect(await panel(b.id)).toEqual({ label: 'agent-office 2', key: b.id });
  expect((await panel(c.id)).label).toBeNull(); // 이름이 없으면 키만
  expect((await panel(c.id)).key).toBe(c.id);
  expect(await listed()).toEqual(expect.arrayContaining([{ id: a.id, label: 'agent-office' }, { id: b.id, label: 'agent-office 2' }, { id: c.id }]));
  await ui(`document.querySelector('#sessions .session[data-session-id="${b.id}"] .view').click()`);
  await waitFor(async () => (await shown(app)).sessionId === b.id, 'B를 보는 중');
  await waitFor(() => ui<boolean>(`document.querySelector('#viewing .label').textContent.includes('agent-office 2')`), '보는 중 표시에 이름');
});

test('L5: ✎로 이름을 바꾼다(Enter 저장, Esc 취소), 패널이 다시 그려져도 고치던 글자가 남는다, GET /sessions에도 바뀐 이름', async () => {
  const a = await make('처음 이름');
  await waitFor(async () => (await panel(a.id)).label === '처음 이름', '패널');
  const sel = `#sessions .session[data-session-id="${a.id}"]`;
  // Esc → 취소
  await ui(`document.querySelector('${sel} .rename').click()`);
  await ui(`(() => { const i = document.querySelector('${sel} input.label-edit'); i.value = '버릴 이름'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  await waitFor(async () => (await panel(a.id)).label === '처음 이름', 'Esc 취소');
  // 고치는 중에 패널이 다시 그려져도(다른 세션이 생김) 글자가 남는다
  await ui(`document.querySelector('${sel} .rename').click()`);
  await ui(`(() => { const i = document.querySelector('${sel} input.label-edit'); i.value = '  결제 점검  '; i.dispatchEvent(new Event('input')); })()`);
  await make('다른 세션');
  await waitFor(() => ui<boolean>(`document.querySelectorAll('#sessions .session').length === 2`), '패널 다시 그림');
  expect(await ui<string>(`document.querySelector('${sel} input.label-edit').value`)).toBe('  결제 점검  ');
  await ui(`document.querySelector('${sel} input.label-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await waitFor(async () => (await panel(a.id)).label === '결제 점검', 'Enter 저장(정리된 이름)');
  await waitFor(async () => (await listed()).some((s) => s.id === a.id && s.label === '결제 점검'), 'GET /sessions에 바뀐 이름');
});
