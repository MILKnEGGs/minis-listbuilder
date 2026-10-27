import { describe, expect, it } from 'vitest';
import { addUnit, fit, listCost, newList, validate } from './list';
import { catalog, testGame, upgrade } from './testing';

const base = testGame.rulesets[0];
const messages = (issues: { message: string }[]) => issues.map((i) => i.message);

describe('fit', () => {
  it('places upgrades in order and keeps what is left free', () => {
    const f = fit(['Gun', 'Crew', 'Crew'], [upgrade('g'), upgrade('c', { type: 'Crew', slots: ['Crew'] })]);
    expect([...f.placed.keys()]).toEqual([0, 1]);
    expect(f.free).toEqual(['Crew']);
  });

  it('needs every slot of a two-slot upgrade', () => {
    const f = fit(['Gun', 'Crew'], [upgrade('big', { type: 'Crew', slots: ['Crew', 'Crew'] })]);
    expect(f.placed.size).toBe(0);
    expect(f.free).toEqual(['Gun', 'Crew']);
  });
});

describe('validate', () => {
  it('counts points with upgrades and flags going over', () => {
    const cat = catalog();
    const list = newList(base, 'red', 'x');
    addUnit(list, 'a').upgrades.push('gun');
    expect(listCost(testGame, list, cat)).toBe(13);
    addUnit(list, 'a');
    addUnit(list, 'a');
    expect(messages(validate(testGame, list, cat))).toContain('33/30 points. Cut 3');
  });

  it('pays upgrades from the loadout when the ruleset says so', () => {
    const cat = catalog(testGame.rulesets[1]);
    const list = newList(testGame.rulesets[1], 'red', 'x');
    const lu = addUnit(list, 'b');
    lu.upgrades.push('gun', 'gun');
    expect(listCost(testGame, list, cat)).toBe(12);
    expect(messages(validate(testGame, list, cat))).toContain('b: upgrades cost 6, loadout is 5');
  });

  it('flags limited names across units and upgrades', () => {
    const cat = catalog();
    const list = newList(base, 'red', 'x');
    addUnit(list, 'b');
    addUnit(list, 'a').upgrades.push('crew');
    expect(messages(validate(testGame, list, cat))).toContain('b is unique: 2 in the list');
  });

  it('flags faction, mode, slot and equip problems', () => {
    const cat = catalog();
    const list = newList(base, 'red', 'x');
    addUnit(list, 'c');
    addUnit(list, 'd');
    addUnit(list, 'a').upgrades.push('bigcrew', 'bluegun');
    const m = messages(validate(testGame, list, cat));
    expect(m).toContain("c isn't Red");
    expect(m).toContain("d isn't legal in Standard");
    expect(m).toContain('a: no free slot for bigcrew');
    expect(m).toContain('bluegun on a: wrong faction');
  });

  it('keeps unknown cards and warns', () => {
    const list = newList(base, 'red', 'x');
    addUnit(list, 'gone');
    expect(validate(testGame, list, catalog()).map((i) => i.level)).toContain('warning');
  });
});
