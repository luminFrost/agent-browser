import { describe, expect, it } from 'vitest';
import { cleanLabel, uniqueLabel, LABEL_MAX } from './label';

describe('세션 이름 정리 (카드 20261120-session-labels L2·L3)', () => {
  it('앞뒤 공백·제어 문자를 지우고, 안쪽 공백은 하나로', () => {
    expect(cleanLabel('  agent-office \n')).toBe('agent-office');
    expect(cleanLabel('a\u0000b\u0007c')).toBe('abc');
    expect(cleanLabel('주문   관리\t봇')).toBe('주문 관리 봇');
  });
  it(`${LABEL_MAX}자로 자른다(한글·이모지도 글자 단위)`, () => {
    expect(cleanLabel('가'.repeat(50))).toBe('가'.repeat(LABEL_MAX));
    expect([...cleanLabel('😀'.repeat(45))!].length).toBe(LABEL_MAX);
  });
  it('없거나 비면 undefined', () => {
    expect(cleanLabel(undefined)).toBeUndefined();
    expect(cleanLabel(null)).toBeUndefined();
    expect(cleanLabel('   ')).toBeUndefined();
  });
  it('같은 이름이 살아 있으면 " 2", " 3"을 붙인다', () => {
    expect(uniqueLabel('a', [])).toBe('a');
    expect(uniqueLabel('a', ['a'])).toBe('a 2');
    expect(uniqueLabel('a', ['a', 'a 2'])).toBe('a 3');
    expect(uniqueLabel('a', ['a 2'])).toBe('a');
  });
});
