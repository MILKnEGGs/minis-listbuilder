import { describe, expect, it } from 'vitest';
import { addUnit, newList, validate } from '@milk/minis-core/list';
import { buildCatalog } from '@milk/minis-core/ruleset';
import type { CatalogData } from '@milk/minis-core/types';
import data from '../public/data/armada.json';
import { game, type ArmadaUnit, type ArmadaUpgrade } from './game';

const ruleset = game.rulesets[0];
const cat = buildCatalog(ruleset, data as unknown as CatalogData<ArmadaUnit, ArmadaUpgrade>);
const find = <T extends { name: string }>(map: Map<string, T>, name: string) => [...map.values()].find((x) => x.name === name)!;
const messages = (l: ReturnType<typeof newList>) => validate(game, l, cat).map((i) => i.message);

describe('Armada fleet building', () => {
  it('has every faction and all three objective types', () => {
    expect(new Set([...cat.units.values()].map((u) => u.faction))).toEqual(new Set(game.factions.map((f) => f.id)));
    for (const p of game.picks!) expect(cat.picks[p.id].length).toBeGreaterThan(5);
  });

  it('needs exactly one commander', () => {
    const l = newList(ruleset, 'empire', 'x');
    const isd = find(cat.units, 'Imperial I-Class Star Destroyer');
    addUnit(l, isd.id);
    expect(messages(l)).toContain('Choose a commander for your flagship');
    const tarkin = find(cat.upgrades, 'Grand Moff Tarkin');
    l.units[0].upgrades.push(tarkin.id);
    addUnit(l, isd.id).upgrades.push(find(cat.upgrades, 'Grand Admiral Thrawn').id);
    expect(messages(l).some((m) => m.startsWith('Only 1 commander'))).toBe(true);
  });

  it('caps squadrons at a third of the points', () => {
    const l = newList(ruleset, 'empire', 'x');
    const tie = [...cat.units.values()].find((u) => u.kind === 'Squadrons' && u.faction === 'empire' && !u.limited)!;
    for (let i = 0; i < Math.ceil(134 / tie.cost) + 1; i++) addUnit(l, tie.id);
    expect(messages(l).some((m) => m.startsWith('Squadrons:'))).toBe(true);
  });

  it('keeps titles to their ship class', () => {
    const avenger = find(cat.upgrades, 'Avenger');
    const l = newList(ruleset, 'empire', 'x');
    expect(game.canEquip(avenger, find(cat.units, 'Imperial I-Class Star Destroyer'), l)).toBeNull();
    expect(game.canEquip(avenger, [...cat.units.values()].find((u) => u.faction === 'empire' && u.size === 'Small')!, l)).toBe('not for this ship');
  });
});
