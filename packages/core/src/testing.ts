// A tiny made-up game for the core's tests.

import { buildCatalog } from './ruleset';
import type { CatalogData, GameDef, Ruleset, Unit, Upgrade } from './types';

export const unit = (id: string, over: Partial<Unit> = {}): Unit => ({
  id,
  name: id,
  faction: 'red',
  kind: 'Ships',
  cost: 10,
  limited: 0,
  slots: ['Gun', 'Crew'],
  stats: [{ label: 'Hull', value: 4 }],
  text: [],
  ...over,
});

export const upgrade = (id: string, over: Partial<Upgrade> = {}): Upgrade => ({
  id,
  name: id,
  type: 'Gun',
  slots: ['Gun'],
  cost: 3,
  limited: 0,
  text: [],
  ...over,
});

export const testGame: GameDef = {
  id: 'test',
  title: 'Test',
  game: 'Test',
  noun: 'list',
  rulesets: [
    { id: 'base', name: 'Base', summary: '', data: 'base', limit: 30, docs: [], modes: [{ id: 'std', name: 'Standard' }] },
    { id: 'lo', name: 'Loadout', summary: '', data: 'base', limit: 30, docs: [], loadout: true },
  ],
  factions: [
    { id: 'red', name: 'Red' },
    { id: 'blue', name: 'Blue' },
  ],
  kinds: ['Ships'],
  slotOrder: ['Gun', 'Crew'],
  upgradeCost: (g) => (typeof g.cost === 'number' ? g.cost : 0),
  canEquip: (g, _u, list) => (g.factions && !g.factions.includes(list.faction) ? 'wrong faction' : null),
  validate: () => [],
  unitFilters: [],
  statLine: () => '',
  tracker: { round: { label: 'Round' }, phases: ['One', 'Two'], tokens: [], counters: () => [{ id: 'hull', label: 'Hull', max: 4 }] },
  exports: [],
  importHint: '',
  credits: [],
};

export const testData: CatalogData = {
  updated: '2026-01-01',
  units: [unit('a'), unit('b', { limited: 1, cost: 12, loadout: 5 }), unit('c', { faction: 'blue' }), unit('d', { modes: ['ext'] })],
  upgrades: [upgrade('gun'), upgrade('bigcrew', { type: 'Crew', slots: ['Crew', 'Crew'] }), upgrade('crew', { type: 'Crew', slots: ['Crew'], limited: 1, name: 'b' }), upgrade('bluegun', { factions: ['blue'] })],
};

export const catalog = (ruleset: Ruleset = testGame.rulesets[0]) => buildCatalog(ruleset, testData);
