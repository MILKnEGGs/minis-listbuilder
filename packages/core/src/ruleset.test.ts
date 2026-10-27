import { describe, expect, it } from 'vitest';
import { HOMEBREW_PREFIX, banCard, buildCatalog, diff, exportHomebrew, importHomebrew, newHomebrew, resolveRuleset, saveCardEdit } from './ruleset';
import { testData, testGame, unit } from './testing';

describe('homebrew', () => {
  const hb = newHomebrew('base', 'House rules');
  hb.limit = 40;
  hb.units.a = { cost: 7, text: ['Fixed'] };
  hb.added.units.push(unit('z', { name: 'Custom' }));
  hb.banned.push('c');

  it('layers changes over the parent ruleset', () => {
    const r = resolveRuleset(testGame, HOMEBREW_PREFIX + hb.id, [hb]);
    expect(r.name).toBe('House rules');
    expect(r.limit).toBe(40);
    expect(r.modes).toEqual(testGame.rulesets[0].modes);
    const cat = buildCatalog(r, testData);
    expect(cat.units.get('a')).toMatchObject({ cost: 7, text: ['Fixed'], name: 'a' });
    expect(cat.units.get('z')?.custom).toBe(true);
    expect(cat.units.has('c')).toBe(false);
  });

  it('falls back to the first built-in for an unknown id', () => {
    expect(resolveRuleset(testGame, 'hb:missing', []).id).toBe('base');
  });

  it('round-trips through a file with a fresh id', () => {
    const back = importHomebrew(testGame, exportHomebrew(testGame, hb));
    expect(back.id).not.toBe(hb.id);
    expect(back).toMatchObject({ name: 'House rules', parent: 'base', limit: 40, units: hb.units, banned: ['c'] });
  });

  it('refuses other games and junk', () => {
    expect(() => importHomebrew({ ...testGame, id: 'other' }, exportHomebrew(testGame, hb))).toThrow(/different game/);
    expect(() => importHomebrew(testGame, 'nope')).toThrow(/isn't a homebrew/);
  });

  it('saves edits as differences, and drops them when nothing differs', () => {
    const h = newHomebrew('base', 'x');
    const a = testData.units[0];
    saveCardEdit(h, 'units', a, { ...a, cost: 99 });
    expect(h.units.a).toEqual({ cost: 99 });
    saveCardEdit(h, 'units', a, { ...a });
    expect(h.units.a).toBeUndefined();
  });

  it('keeps made-up cards whole and deletes them on ban', () => {
    const h = newHomebrew('base', 'x');
    saveCardEdit(h, 'units', undefined, { ...unit('new'), custom: true });
    expect(h.added.units).toEqual([unit('new')]);
    banCard(h, 'units', 'new');
    expect(h.added.units).toEqual([]);
    expect(h.banned).toEqual([]);
    banCard(h, 'units', 'a');
    expect(h.banned).toEqual(['a']);
  });

  it('stores only changed fields', () => {
    expect(diff(unit('a'), { ...unit('a'), cost: 3, slots: ['Gun'] })).toEqual({ cost: 3, slots: ['Gun'] });
  });
});
