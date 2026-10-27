// Rulesets: the built-in ones a game ships with, and homebrew ones layered on top of them.

import type { Catalog, CatalogData, GameDef, Homebrew, Ruleset, Unit, Upgrade } from './types';
import { uid } from './util';

export const HOMEBREW_PREFIX = 'hb:';

/** The effective ruleset for a list: a built-in, or a homebrew with its parent's settings. */
export function resolveRuleset(game: GameDef<any, any>, id: string, homebrews: Homebrew[]): Ruleset {
  const hb = homebrews.find((h) => HOMEBREW_PREFIX + h.id === id);
  const parent = game.rulesets.find((r) => r.id === (hb ? hb.parent : id)) ?? game.rulesets[0];
  if (!hb) return parent;
  return { ...parent, id, name: hb.name, summary: `Homebrew on ${parent.name}`, limit: hb.limit ?? parent.limit, recommended: false, homebrew: hb };
}

/** Every ruleset a list can use: built-ins first, then your homebrews. */
export function allRulesets(game: GameDef<any, any>, homebrews: Homebrew[]): Ruleset[] {
  return [...game.rulesets, ...homebrews.map((h) => resolveRuleset(game, HOMEBREW_PREFIX + h.id, homebrews))];
}

/** Lookups for a ruleset, with its homebrew changes applied. */
export function buildCatalog<U extends Unit, G extends Upgrade>(ruleset: Ruleset, data: CatalogData<U, G>): Catalog<U, G> {
  const hb = ruleset.homebrew;
  const units = new Map<string, U>();
  const upgrades = new Map<string, G>();
  for (const u of data.units) units.set(u.id, u);
  for (const g of data.upgrades) upgrades.set(g.id, g);
  if (hb) {
    for (const u of hb.added.units) units.set(u.id, { ...u, custom: true } as U);
    for (const g of hb.added.upgrades) upgrades.set(g.id, { ...g, custom: true } as G);
    for (const [id, change] of Object.entries(hb.units)) {
      const u = units.get(id);
      if (u) units.set(id, { ...u, ...change });
    }
    for (const [id, change] of Object.entries(hb.upgrades)) {
      const g = upgrades.get(id);
      if (g) upgrades.set(id, { ...g, ...change });
    }
    for (const id of hb.banned) {
      units.delete(id);
      upgrades.delete(id);
    }
  }
  return { ruleset, units, upgrades, picks: data.picks ?? {}, updated: data.updated, version: data.version };
}

export function newHomebrew(parent: string, name: string): Homebrew {
  const now = Date.now();
  return { id: uid(), name, parent, created: now, updated: now, notes: '', units: {}, upgrades: {}, added: { units: [], upgrades: [] }, banned: [] };
}

/** Fields that differ from the original card, for storing as a homebrew change. */
export function diff<T extends object>(original: T, edited: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(edited) as (keyof T)[]) if (JSON.stringify(original[k]) !== JSON.stringify(edited[k])) out[k] = edited[k];
  return out;
}

type Kind = 'units' | 'upgrades';

/**
 * Saves an edited card into a homebrew. `original` is the card as the data has it (undefined for a card
 * the homebrew made); only the differences are kept.
 */
export function saveCardEdit(hb: Homebrew, kind: Kind, original: Unit | Upgrade | undefined, edited: Unit | Upgrade): void {
  const { custom: _, ...card } = edited;
  if (!original) {
    const added = hb.added[kind] as (Unit | Upgrade)[];
    const i = added.findIndex((c) => c.id === card.id);
    if (i >= 0) added[i] = card;
    else added.push(card);
  } else {
    const d = diff(original, card as typeof original);
    if (Object.keys(d).length) (hb[kind] as Record<string, object>)[card.id] = d;
    else delete hb[kind][card.id];
  }
  hb.updated = Date.now();
}

export function revertCard(hb: Homebrew, kind: Kind, id: string): void {
  delete hb[kind][id];
  hb.updated = Date.now();
}

/** Takes a card out of the homebrew ruleset (a made-up card is deleted outright). */
export function banCard(hb: Homebrew, kind: Kind, id: string): void {
  const added = hb.added[kind] as (Unit | Upgrade)[];
  const i = added.findIndex((c) => c.id === id);
  if (i >= 0) added.splice(i, 1);
  else if (!hb.banned.includes(id)) hb.banned.push(id);
  delete hb[kind][id];
  hb.updated = Date.now();
}

export function unbanCard(hb: Homebrew, id: string): void {
  hb.banned = hb.banned.filter((x) => x !== id);
  hb.updated = Date.now();
}

/** How many cards a homebrew touches, for its summary line. */
export function changeCount(hb: Homebrew): number {
  return Object.keys(hb.units).length + Object.keys(hb.upgrades).length + hb.added.units.length + hb.added.upgrades.length + hb.banned.length;
}

const FILE_KIND = 'milks-homebrew';

/** A homebrew as a file to share: the game and parent travel with it so it can't be loaded into the wrong game. */
export function exportHomebrew(game: GameDef<any, any>, hb: Homebrew): string {
  return JSON.stringify({ kind: FILE_KIND, game: game.id, homebrew: hb }, null, 1);
}

/** Reads a shared homebrew. It always gets a new id, so importing twice gives two copies rather than overwriting. */
export function importHomebrew(game: GameDef<any, any>, text: string): Homebrew {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That isn't a homebrew file (it isn't JSON).");
  }
  if (parsed?.kind !== FILE_KIND || !parsed.homebrew) throw new Error("That isn't a homebrew file.");
  if (parsed.game !== game.id) throw new Error(`That homebrew is for a different game (${parsed.game}).`);
  const h = parsed.homebrew as Homebrew;
  if (!game.rulesets.some((r) => r.id === h.parent)) throw new Error(`That homebrew builds on a ruleset this app doesn't have (${h.parent}).`);
  const now = Date.now();
  return {
    ...newHomebrew(h.parent, String(h.name ?? 'Imported homebrew')),
    limit: typeof h.limit === 'number' ? h.limit : undefined,
    notes: String(h.notes ?? ''),
    units: h.units ?? {},
    upgrades: h.upgrades ?? {},
    added: { units: h.added?.units ?? [], upgrades: h.added?.upgrades ?? [] },
    banned: h.banned ?? [],
    created: now,
    updated: now,
  };
}
