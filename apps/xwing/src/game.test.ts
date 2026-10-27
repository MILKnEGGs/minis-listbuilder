import { describe, expect, it } from 'vitest';
import { addUnit, listCost, newList, validate } from '@milk/minis-core/list';
import { buildCatalog } from '@milk/minis-core/ruleset';
import type { CatalogData } from '@milk/minis-core/types';
import { game, type Pilot, type XUpgrade } from './game';

// The downloaded data, if "npm run data" has run (it isn't committed).
const files = import.meta.glob<CatalogData<Pilot, XUpgrade>>('../public/data/*.json', { eager: true, import: 'default' });
const data = (name: string) => files[`../public/data/${name}.json`];
const ruleset = (id: string) => game.rulesets.find((r) => r.id === id)!;

describe.skipIf(!data('xwa') || !data('legacy'))('X-Wing with real data', () => {
  it('builds a legal XWA squad and pays upgrades from the loadout', () => {
    const cat = buildCatalog(ruleset('xwa'), data('xwa'));
    const wedge = [...cat.units.values()].find((u) => u.name === 'Wedge Antilles' && u.subtitle?.startsWith('Red Two'))!;
    const list = newList(ruleset('xwa'), 'rebelalliance', 'test');
    addUnit(list, wedge.id).upgrades.push('crackshot');
    expect(listCost(game, list, cat)).toBe(wedge.cost);
    expect(validate(game, list, cat).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('enforces faction restrictions on upgrades', () => {
    const cat = buildCatalog(ruleset('xwa'), data('xwa'));
    const imperialOnly = [...cat.upgrades.values()].find((g) => g.factions?.length === 1 && g.factions[0] === 'galacticempire')!;
    const pilot = [...cat.units.values()].find((u) => u.faction === 'rebelalliance')!;
    expect(game.canEquip(imperialOnly, pilot, newList(ruleset('xwa'), 'rebelalliance', 'x'))).toBe('wrong faction');
  });

  it('prices Legacy variable-cost upgrades by the ship', () => {
    const cat = buildCatalog(ruleset('legacy'), data('legacy'));
    const varying = [...cat.upgrades.values()].find((g) => typeof g.cost === 'object' && g.cost.by === 'agility')!;
    const values = (varying.cost as { values: Record<string, number> }).values;
    const pilot = [...cat.units.values()].find((u) => u.stats.some((s) => s.label === 'Agility' && s.value === 2))!;
    expect(game.upgradeCost(varying, pilot)).toBe(values['2']);
  });

  it('round-trips XWS', () => {
    const cat = buildCatalog(ruleset('xwa'), data('xwa'));
    const list = newList(ruleset('xwa'), 'rebelalliance', 'Round trip');
    addUnit(list, 'biggsdarklighter').upgrades.push('crackshot');
    const back = game.importList!(game.exports[0].run(list, cat), game.rulesets);
    expect(back).toMatchObject({ name: 'Round trip', faction: 'rebelalliance', ruleset: 'xwa' });
    expect(back.units?.map((u) => [u.id, u.upgrades])).toEqual([['biggsdarklighter', ['crackshot']]]);
  });
});
