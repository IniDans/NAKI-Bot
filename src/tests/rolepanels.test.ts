import { describe, expect, it } from 'vitest';
import { buttonChange, parseOptions, selectChange } from '../modules/rolepanels/logic.js';

const A = '100000000000000001';
const B = '100000000000000002';
const C = '100000000000000003';
const panel = [A, B, C];
const holding = (...ids: string[]) => (id: string) => ids.includes(id);

describe('parseOptions', () => {
  it('keeps valid options and drops broken ones', () => {
    expect(
      parseOptions([{ roleId: A, label: 'Red', emoji: '' }, { roleId: 'x' }, null, { roleId: B, label: 'Blue', emoji: '🔵' }]),
    ).toEqual([
      { roleId: A, label: 'Red', emoji: null, description: null },
      { roleId: B, label: 'Blue', emoji: '🔵', description: null },
    ]);
    expect(parseOptions('nope')).toEqual([]);
  });
});

describe('buttonChange', () => {
  it('toggles the role off when the member has it', () => {
    expect(buttonChange(holding(A), panel, A, true)).toEqual({ add: [], remove: [A] });
  });
  it('adds the role and keeps others on a normal panel', () => {
    expect(buttonChange(holding(B), panel, A, false)).toEqual({ add: [A], remove: [] });
  });
  it('swaps roles on an exclusive panel', () => {
    expect(buttonChange(holding(B, C), panel, A, true)).toEqual({ add: [A], remove: [B, C] });
  });
});

describe('selectChange', () => {
  it('sets the panel roles to exactly the picked ones', () => {
    expect(selectChange(holding(A, B), panel, [B, C], false)).toEqual({ add: [C], remove: [A] });
  });
  it('clears everything when nothing is picked', () => {
    expect(selectChange(holding(A), panel, [], false)).toEqual({ add: [], remove: [A] });
  });
  it('ignores values that are not on the panel and caps exclusive panels at one', () => {
    expect(selectChange(holding(), panel, ['999999999999999999', B, C], true)).toEqual({ add: [B], remove: [] });
  });
});
