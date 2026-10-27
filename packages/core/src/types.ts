// Shapes shared by every game. A game app describes itself with a GameDef; the core UI does the rest.

/** A number on a card, e.g. Hull 4. `color` tints it (attack red, shields blue). */
export interface Stat {
  label: string;
  value: number | string;
  color?: string;
}

/** Something you put in a list: an X-Wing pilot, an Armada ship or squadron. */
export interface Unit {
  /** Stable id (X-Wing: the XWS id). Saved in lists, so it must not change between data updates. */
  id: string;
  name: string;
  /** Second line: the pilot's caption and ship, or the ship class. */
  subtitle?: string;
  faction: string;
  /** List section, in GameDef.kinds order ("Ships", "Squadrons"). */
  kind: string;
  /** Points. */
  cost: number;
  /** X-Wing 2.5: most upgrade points this pilot may carry. */
  loadout?: number;
  /** Most copies of this name in one list (unique cards are 1); 0 means no limit. */
  limited: number;
  /** Upgrade slots, e.g. ["Talent", "Torpedo"]. Repeats mean more than one. */
  slots: string[];
  stats: Stat[];
  /** Rules text, one paragraph each. */
  text: string[];
  /** Short tags shown under the name and matched by search ("Partisan", "Rogue"). */
  keywords?: string[];
  /** Ruleset modes the unit is legal in ("standard", "extended"); missing means all of them. */
  modes?: string[];
  /** Card picture, when there is one. */
  image?: string;
  /** Added by a homebrew ruleset rather than printed. */
  custom?: boolean;
}

/** A cost that depends on the unit it goes on (X-Wing Legacy: R2 Astromech costs more on agile ships). */
export interface VariableCost {
  /** What it varies by, e.g. "agility", "size", "initiative". */
  by: string;
  values: Record<string, number>;
}

export interface Upgrade {
  id: string;
  name: string;
  /** The slot type it's listed under ("Talent", "Officer"). */
  type: string;
  /** Every slot it takes up; usually just [type], some take two. */
  slots: string[];
  cost: number | VariableCost;
  limited: number;
  text: string[];
  /** Factions that may use it; missing means any. */
  factions?: string[];
  modes?: string[];
  image?: string;
  custom?: boolean;
}

/** A downloaded (or committed) data file: everything one built-in ruleset needs. */
export interface CatalogData<U extends Unit = Unit, G extends Upgrade = Upgrade> {
  /** When the data was built, ISO time. */
  updated: string;
  /** The source's own version or points revision, e.g. "50P2.1.1". */
  version?: string;
  units: U[];
  upgrades: G[];
  /** Picks a list makes besides units, e.g. Armada objectives, by PickDef id. */
  picks?: Record<string, PickOption[]>;
}

export interface PickOption {
  id: string;
  name: string;
  text: string[];
}

/** Lookups for one ruleset, with any homebrew applied. */
export interface Catalog<U extends Unit = Unit, G extends Upgrade = Upgrade> {
  ruleset: Ruleset;
  units: Map<string, U>;
  upgrades: Map<string, G>;
  picks: Record<string, PickOption[]>;
  updated: string;
  version?: string;
}

export interface Doc {
  label: string;
  url: string;
}

/** A ruleset the app ships with: which data to use, the points limit and where the rules live. */
export interface RulesetDef {
  id: string;
  name: string;
  /** One line shown when choosing, e.g. "X-Wing 2.5 cards, 50-point lists, community points". */
  summary: string;
  /** The data file to load, public/data/<data>.json. Several rulesets can share one. */
  data: string;
  /** Points limit for a list. */
  limit: number;
  /**
   * Upgrades are paid for from each unit's loadout value instead of the list's points (X-Wing 2.5).
   * A unit's upgrades may not cost more than its loadout.
   */
  loadout?: boolean;
  /** Game modes within the ruleset, e.g. Standard and Extended. The first is the default. */
  modes?: { id: string; name: string }[];
  /** Official rules documents. */
  docs: Doc[];
  /** Short rules reminders shown in the Rules view. */
  notes?: string[];
  recommended?: boolean;
}

/**
 * Your own ruleset: a built-in one plus changes. Only the changes are stored, so data updates to the
 * parent still come through and your edits stay on top.
 */
export interface Homebrew {
  id: string;
  name: string;
  /** The built-in ruleset it changes. */
  parent: string;
  created: number;
  updated: number;
  /** Replaces the parent's points limit. */
  limit?: number;
  /** House rules and corrections, in your own words. */
  notes: string;
  /** Changed fields per card id. */
  units: Record<string, Partial<Unit>>;
  upgrades: Record<string, Partial<Upgrade>>;
  /** Cards that aren't in the data at all. */
  added: { units: Unit[]; upgrades: Upgrade[] };
  /** Card ids taken out of the game. */
  banned: string[];
}

/** One effective ruleset: a built-in, or a homebrew on top of one. */
export interface Ruleset extends RulesetDef {
  homebrew?: Homebrew;
}

export interface ListUnit {
  /** This copy's own id, so two identical ships are told apart. */
  uid: string;
  id: string;
  /** Upgrade ids fitted to it. Which slot each fills is worked out (see fit()). */
  upgrades: string[];
}

export interface List {
  id: string;
  name: string;
  /** Built-in ruleset id, or a homebrew id. */
  ruleset: string;
  mode?: string;
  faction: string;
  created: number;
  updated: number;
  units: ListUnit[];
  /** Choices by PickDef id (Armada objectives). */
  picks?: Record<string, string>;
  /** What the list does and how to fly it. */
  description?: string;
}

/** error: the list isn't legal yet. warning: legal or nearly, but worth a look. */
export type Level = 'error' | 'warning';
export interface Issue {
  level: Level;
  message: string;
  /** uids of the units involved, highlighted in the list. */
  units?: string[];
}

export interface FactionDef {
  id: string;
  name: string;
  color?: string;
}

/** A choice a list makes besides units, e.g. Armada's assault objective. */
export interface PickDef {
  id: string;
  label: string;
}

/** A number tracked on a unit during a match, e.g. Hull 4/4. */
export interface Counter {
  id: string;
  label: string;
  max: number;
  /** Starting value; defaults to max. */
  start?: number;
  color?: string;
}

/** A token with a few states, e.g. an Armada defense token: ready, exhausted, discarded. */
export interface Toggle {
  id: string;
  label: string;
  states: string[];
}

export interface TrackerDef<U extends Unit = Unit, G extends Upgrade = Upgrade> {
  /** What a round is called and the last one, if the game has a fixed length (Armada: 6). */
  round: { label: string; max?: number };
  phases: string[];
  /** Counters on each unit, from its stats and upgrades. */
  counters(unit: U, upgrades: G[]): Counter[];
  /** Tokens you can stack on a unit, e.g. Stress, Focus. */
  tokens: string[];
  /** Multi-state tokens on a unit (Armada defense tokens). */
  toggles?(unit: U): Toggle[];
  /** A stack of hidden choices per unit (Armada command dials): how many, and the options. */
  dials?(unit: U): { size: number; options: string[] } | null;
  /** One line of reminders shown at the top. */
  note?: string;
}

export interface UnitState {
  counters: Record<string, number>;
  tokens: Record<string, number>;
  toggles: Record<string, number>;
  dials: string[];
  destroyed: boolean;
  activated: boolean;
}

/** A game in progress, one per list. */
export interface Match {
  listId: string;
  started: number;
  updated: number;
  round: number;
  phase: number;
  myScore: number;
  theirScore: number;
  units: Record<string, UnitState>;
  notes: string;
}

/** One row in a Picker. */
export interface PickItem {
  key: string;
  name: string;
  sub?: string;
  cost: string;
  /** Why it can't be picked, or null. */
  why: string | null;
  /** Folded text search matches against. */
  search: string;
  /** Filter id → values. */
  tags?: Record<string, string[]>;
}

export interface ExportFormat<U extends Unit = Unit, G extends Upgrade = Upgrade> {
  label: string;
  run(list: List, cat: Catalog<U, G>): string;
}

export interface GameDef<U extends Unit = Unit, G extends Upgrade = Upgrade> {
  /** Short id, used for storage names. */
  id: string;
  /** Full app name, e.g. "Milk's X-Wing List Builder". */
  title: string;
  /** Game name, e.g. "Star Wars: X-Wing". */
  game: string;
  /** What a list is called ("squad", "fleet"). */
  noun: string;
  rulesets: RulesetDef[];
  factions: FactionDef[];
  /** List sections in order ("Ships", "Squadrons"). */
  kinds: string[];
  /** Slot display order. */
  slotOrder: string[];
  /** Points this upgrade costs on this unit. */
  upgradeCost(g: G, unit: U): number;
  /** Slots the unit has once its upgrades are fitted (some upgrades add or remove slots). */
  slotsFor?(unit: U, upgrades: G[]): string[];
  /** Why this upgrade can't go on this unit (wrong ship, size, faction), or null if it can. */
  canEquip(g: G, unit: U, list: List): string | null;
  /** Game rules beyond the shared ones (points, limited names, slots, legality). */
  validate(list: List, cat: Catalog<U, G>): Issue[];
  picks?: PickDef[];
  /** Search filters for units: label and the values of each unit. */
  unitFilters: { id: string; label: string; values(u: U): string[] }[];
  /** Short stat line shown in lists, e.g. "PS5 · 3/2/4/2". */
  statLine(u: U): string;
  /** Extra label/value rows for the card view. */
  details?(u: U): [string, string][];
  tracker: TrackerDef<U, G>;
  exports: ExportFormat<U, G>[];
  /** Reads a list someone exported (our own JSON is always accepted). Throws with a readable message. */
  importList?(text: string, rulesets: RulesetDef[]): Partial<List> & { skipped?: string[] };
  importHint: string;
  /** Where the data comes from, shown on the home page. */
  credits: Doc[];
}
