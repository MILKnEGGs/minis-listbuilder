// Pure list helpers: costs, slot fitting and the validation every game shares.

import type { Catalog, GameDef, Issue, List, ListUnit, Ruleset, Unit, Upgrade } from './types';
import { plural, uid } from './util';

export function newList(ruleset: Ruleset, faction: string, name: string): List {
  const now = Date.now();
  return { id: uid(), name, ruleset: ruleset.id, mode: ruleset.modes?.[0]?.id, faction, created: now, updated: now, units: [] };
}

export function addUnit(list: List, id: string): ListUnit {
  const lu = { uid: uid(), id, upgrades: [] };
  list.units.push(lu);
  list.updated = Date.now();
  return lu;
}

export function removeUnit(list: List, uidToRemove: string): void {
  list.units = list.units.filter((u) => u.uid !== uidToRemove);
  list.updated = Date.now();
}

/** A copy of the unit with the same upgrades, added right after it. */
export function cloneUnit(list: List, lu: ListUnit): void {
  const i = list.units.indexOf(lu);
  list.units.splice(i + 1, 0, { uid: uid(), id: lu.id, upgrades: [...lu.upgrades] });
  list.updated = Date.now();
}

export function upgradesOf<G extends Upgrade>(lu: ListUnit, cat: Catalog<any, G>): G[] {
  return lu.upgrades.map((id) => cat.upgrades.get(id)).filter((g): g is G => !!g);
}

/** Points spent on upgrades for one unit. */
export function upgradePoints<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, lu: ListUnit, cat: Catalog<U, G>): number {
  const unit = cat.units.get(lu.id);
  if (!unit) return 0;
  return upgradesOf(lu, cat).reduce((n, g) => n + game.upgradeCost(g, unit), 0);
}

/** What the unit adds to the list's points: its cost, plus its upgrades unless they come out of its loadout. */
export function unitCost<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, lu: ListUnit, cat: Catalog<U, G>): number {
  const unit = cat.units.get(lu.id);
  if (!unit) return 0;
  return unit.cost + (cat.ruleset.loadout ? 0 : upgradePoints(game, lu, cat));
}

export function listCost<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, list: List, cat: Catalog<U, G>): number {
  return list.units.reduce((n, lu) => n + unitCost(game, lu, cat), 0);
}

export interface Fit {
  /** Slots each upgrade fills, by its index in lu.upgrades. Missing means it didn't fit. */
  placed: Map<number, string[]>;
  /** Slots still open. */
  free: string[];
}

/** Fits upgrades into slots in order; an upgrade that takes two slots needs both free. */
export function fit(slots: string[], upgrades: Upgrade[]): Fit {
  const free = [...slots];
  const placed = new Map<number, string[]>();
  upgrades.forEach((g, i) => {
    const need = g.slots.length ? g.slots : [g.type];
    const take: number[] = [];
    for (const s of need) {
      const at = free.findIndex((f, j) => f === s && !take.includes(j));
      if (at < 0) return;
      take.push(at);
    }
    placed.set(i, need);
    for (const j of take.sort((a, b) => b - a)) free.splice(j, 1);
  });
  return { placed, free };
}

export function slotsOf<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, unit: U, upgrades: G[]): string[] {
  return game.slotsFor ? game.slotsFor(unit, upgrades) : unit.slots;
}

export function unitFit<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, lu: ListUnit, cat: Catalog<U, G>): Fit {
  const unit = cat.units.get(lu.id);
  const ups = upgradesOf(lu, cat);
  return unit ? fit(slotsOf(game, unit, ups), ups) : { placed: new Map(), free: [] };
}

export const legalIn = (card: { modes?: string[] }, mode: string | undefined) => !mode || !card.modes || card.modes.includes(mode);

/** The checks every game shares. A game's validate() adds its own. */
export function sharedIssues<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, list: List, cat: Catalog<U, G>): Issue[] {
  const issues: Issue[] = [];
  const limit = cat.ruleset.limit;
  const total = listCost(game, list, cat);
  if (total > limit) issues.push({ level: 'error', message: `${total}/${limit} points. Cut ${total - limit}` });
  if (!list.units.length) issues.push({ level: 'error', message: `Add a ${game.kinds[0].toLowerCase().replace(/s$/, '')}` });

  const unknown = list.units.filter((lu) => !cat.units.has(lu.id));
  if (unknown.length)
    issues.push({ level: 'warning', message: `Not in ${cat.ruleset.name}: ${unknown.map((u) => u.id).join(', ')}`, units: unknown.map((u) => u.uid) });

  const modeName = cat.ruleset.modes?.find((m) => m.id === list.mode)?.name;
  // How many of each name, and the tightest limit any card of that name has.
  const names = new Map<string, { n: number; max: number; uids: string[] }>();
  const count = (name: string, limited: number, uidOf: string) => {
    const e = names.get(name) ?? { n: 0, max: Infinity, uids: [] };
    e.n++;
    if (limited > 0) e.max = Math.min(e.max, limited);
    e.uids.push(uidOf);
    names.set(name, e);
  };

  for (const lu of list.units) {
    const unit = cat.units.get(lu.id);
    if (!unit) continue;
    const name = unit.name;
    if (unit.faction !== list.faction) issues.push({ level: 'error', message: `${name} isn't ${game.factions.find((f) => f.id === list.faction)?.name ?? list.faction}`, units: [lu.uid] });
    if (!legalIn(unit, list.mode)) issues.push({ level: 'error', message: `${name} isn't legal in ${modeName}`, units: [lu.uid] });
    count(name, unit.limited, lu.uid);

    const ups = upgradesOf(lu, cat);
    const missing = lu.upgrades.filter((id) => !cat.upgrades.has(id));
    if (missing.length) issues.push({ level: 'warning', message: `${name}: upgrades not in ${cat.ruleset.name}: ${missing.join(', ')}`, units: [lu.uid] });
    const f = fit(slotsOf(game, unit, ups), ups);
    const unfit = ups.filter((_, i) => !f.placed.has(i));
    if (unfit.length) issues.push({ level: 'error', message: `${name}: no free slot for ${unfit.map((g) => g.name).join(', ')}`, units: [lu.uid] });
    if (cat.ruleset.loadout && unit.loadout != null) {
      const spent = upgradePoints(game, lu, cat);
      if (spent > unit.loadout) issues.push({ level: 'error', message: `${name}: upgrades cost ${spent}, loadout is ${unit.loadout}`, units: [lu.uid] });
    }
    for (const g of ups) {
      count(g.name, g.limited, lu.uid);
      const why = game.canEquip(g, unit, list);
      if (why) issues.push({ level: 'error', message: `${g.name} on ${name}: ${why}`, units: [lu.uid] });
      if (!legalIn(g, list.mode)) issues.push({ level: 'error', message: `${g.name} isn't legal in ${modeName}`, units: [lu.uid] });
    }
  }
  for (const [name, e] of names)
    if (e.n > e.max) issues.push({ level: 'error', message: e.max === 1 ? `${name} is unique: ${e.n} in the list` : `${name}: ${e.n} copies, max ${e.max}`, units: e.uids });
  return issues;
}

export function validate<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, list: List, cat: Catalog<U, G>): Issue[] {
  const issues = [...sharedIssues(game, list, cat), ...game.validate(list, cat)];
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

export const summarize = (issues: Issue[]) => {
  const errors = issues.filter((i) => i.level === 'error').length;
  return errors ? plural(errors, 'problem') : issues.length ? plural(issues.length, 'note') : 'Legal';
};

const FILE_KIND = 'milks-list';

/** Our own list format: everything, including the description and picks. Any of our apps reads it back. */
export function exportListJson(game: GameDef<any, any>, list: List): string {
  const { id: _id, ...rest } = list;
  return JSON.stringify({ kind: FILE_KIND, game: game.id, list: rest });
}

export function importListJson(game: GameDef<any, any>, text: string): Partial<List> | null {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed?.kind !== FILE_KIND) return null;
  if (parsed.game !== game.id) throw new Error(`That list is for a different game (${parsed.game}).`);
  return parsed.list as Partial<List>;
}
