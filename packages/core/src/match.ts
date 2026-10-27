// Match tracker state: starting a game from a list, and moving through rounds.

import { upgradesOf } from './list';
import type { Catalog, GameDef, List, Match, Unit, UnitState, Upgrade } from './types';

export function unitState<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, unit: U, upgrades: G[]): UnitState {
  const t = game.tracker;
  return {
    counters: Object.fromEntries(t.counters(unit, upgrades).map((c) => [c.id, c.start ?? c.max])),
    tokens: {},
    toggles: Object.fromEntries((t.toggles?.(unit) ?? []).map((x) => [x.id, 0])),
    dials: [],
    destroyed: false,
    activated: false,
  };
}

export function newMatch<U extends Unit, G extends Upgrade>(game: GameDef<U, G>, list: List, cat: Catalog<U, G>): Match {
  const units: Record<string, UnitState> = {};
  for (const lu of list.units) {
    const unit = cat.units.get(lu.id);
    if (unit) units[lu.uid] = unitState(game, unit, upgradesOf(lu, cat));
  }
  const now = Date.now();
  return { listId: list.id, started: now, updated: now, round: 1, phase: 0, myScore: 0, theirScore: 0, units, notes: '' };
}

/** Next phase; after the last one, the next round starts and every unit is ready to activate again. */
export function nextPhase(game: GameDef<any, any>, m: Match): void {
  if (m.phase < game.tracker.phases.length - 1) m.phase++;
  else nextRound(m);
  m.updated = Date.now();
}

export function nextRound(m: Match): void {
  m.round++;
  m.phase = 0;
  for (const s of Object.values(m.units)) s.activated = false;
  m.updated = Date.now();
}

/** Whether a unit has lost at least half of its first counter (hull) — many scoring rules care. */
export function halfDamaged(game: GameDef<any, any>, unit: Unit, upgrades: Upgrade[], s: UnitState): boolean {
  const first = game.tracker.counters(unit, upgrades)[0];
  return !!first && s.counters[first.id] <= first.max / 2;
}
