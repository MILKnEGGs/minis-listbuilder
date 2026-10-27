// Star Wars: X-Wing (second edition). Three built-in rulesets share one card shape:
// X-Wing Alliance (2.5 cards, 50-point lists, upgrades paid from each pilot's loadout), Atomic Mass Games'
// last official points (the same system at 20 points), and 2.0 Legacy (2.0 cards, 200 points, upgrades
// cost list points, some by the ship's agility, initiative or size).

import type { Catalog, Counter, GameDef, List, Unit, Upgrade } from '@milk/minis-core/types';
import { unitCost, upgradesOf } from '@milk/minis-core/list';

export interface Pilot extends Unit {
  ship: string;
  shipName: string;
  size: string;
  initiative: number;
  /** Action bar, e.g. "Focus", "Barrel Roll (red)", "Focus → Coordinate (purple)". */
  actions: string[];
  arcs: string[];
  charges?: number;
  force?: number;
  /** A standard loadout pilot's printed upgrades (no slots to fill). */
  fixed?: string[];
}

/** One xwing-data2 restriction: every key in it must be met (each list is "any of"). */
interface Restriction {
  factions?: string[];
  sizes?: string[];
  ships?: string[];
  names?: string[];
  keywords?: string[];
  action?: { type: string; difficulty?: string };
  arcs?: string[];
  [other: string]: unknown;
}

interface Grant {
  type: 'slot' | 'stat' | 'action' | 'force';
  value: string | Record<string, unknown>;
  amount?: number;
}

export interface XUpgrade extends Upgrade {
  restrictions: Restriction[];
  grants: Grant[];
  charges?: number;
  force?: number;
  /** Printed only on standard loadout pilots; can't be added by hand. */
  fixedOnly?: boolean;
}

const statOf = (u: Pilot, label: string) => {
  const v = u.stats.find((s) => s.label === label)?.value;
  return typeof v === 'number' ? v : 0;
};

/** A stat after upgrades that change it (Shield Upgrade, Hull Upgrade, some configurations). */
function statWith(u: Pilot, ups: XUpgrade[], stat: string): number {
  const base = statOf(u, stat[0].toUpperCase() + stat.slice(1));
  return base + ups.flatMap((g) => g.grants).reduce((n, gr) => n + (gr.type === 'stat' && gr.value === stat ? (gr.amount ?? 0) : 0), 0);
}

function hasAction(u: Pilot, type: string, difficulty?: string): boolean {
  return u.actions.some((a) =>
    a
      .split(' → ')
      .some((part) => {
        const m = /^(.+?)(?: \((red|purple)\))?$/.exec(part);
        if (!m || m[1] !== type) return false;
        return !difficulty || (m[2] ?? 'white') === difficulty.toLowerCase();
      }),
  );
}

function restrictionProblem(r: Restriction, u: Pilot, faction: string): string | null {
  if (r.factions && !r.factions.includes(faction)) return 'wrong faction';
  if (r.sizes && !r.sizes.includes(u.size)) return `${r.sizes.join(' or ').toLowerCase()} ships only`;
  if (r.ships && !r.ships.includes(u.ship)) return 'not for this ship';
  if (r.names && !r.names.includes(u.name)) return `${r.names.join(' or ')} only`;
  if (r.keywords && !r.keywords.some((k) => u.keywords?.includes(k))) return `${r.keywords.join(' or ')} only`;
  if (r.action && !hasAction(u, r.action.type, r.action.difficulty)) return `needs ${r.action.difficulty ? `a ${r.action.difficulty.toLowerCase()} ` : ''}${r.action.type} action`;
  if (r.arcs && !r.arcs.some((a) => u.arcs.includes(a))) return `needs a ${r.arcs.join(' or ')}`;
  return null;
}

const FACTIONS = [
  { id: 'rebelalliance', name: 'Rebel Alliance', color: '#e2483d' },
  { id: 'galacticempire', name: 'Galactic Empire', color: '#9ca3af' },
  { id: 'scumandvillainy', name: 'Scum and Villainy', color: '#c9a227' },
  { id: 'resistance', name: 'Resistance', color: '#f97316' },
  { id: 'firstorder', name: 'First Order', color: '#dc2626' },
  { id: 'galacticrepublic', name: 'Galactic Republic', color: '#dc8a3c' },
  { id: 'separatistalliance', name: 'Separatist Alliance', color: '#6b8ec7' },
];

const AMG_DOCS = { label: 'AMG X-Wing documents (rules reference, scenarios)', url: 'https://www.atomicmassgames.com/xwing-documents' };
const MODES_25 = [
  { id: 'standard', name: 'Standard' },
  { id: 'extended', name: 'Extended' },
  { id: 'epic', name: 'Epic' },
];

/** XWS slot keys: "Force Power" → "force-power". */
const slotKey = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

export const game: GameDef<Pilot, XUpgrade> = {
  id: 'xwing',
  title: "Milk's X-Wing Squad Builder",
  game: 'Star Wars: X-Wing',
  noun: 'squad',
  rulesets: [
    {
      id: 'xwa',
      name: 'X-Wing Alliance',
      summary: '2.5 cards with the community X-Wing Alliance points: 50-point squads, upgrades paid from each pilot’s loadout',
      data: 'xwa',
      limit: 50,
      loadout: true,
      modes: MODES_25,
      docs: [{ label: 'X-Wing Alliance: points, rules and scenarios', url: 'https://www.xwing.life/points' }, AMG_DOCS],
      notes: [
        'Squads are up to 50 points. Each pilot’s upgrades can cost up to its loadout value, which doesn’t count toward the 50.',
        'Cards on the XWA restricted list are limited in this app as the points file says.',
        'Standard is the tournament mode; Extended allows every card; Epic is for huge ships and larger games.',
      ],
      recommended: true,
    },
    {
      id: 'amg',
      name: 'AMG final points',
      summary: '2.5 cards with Atomic Mass Games’ last official points (September 2024): 20-point squads with loadout',
      data: 'amg',
      limit: 20,
      loadout: true,
      modes: MODES_25,
      docs: [AMG_DOCS],
      notes: ['Squads are up to 20 points. Each pilot’s upgrades can cost up to its loadout value.', 'AMG stopped updating X-Wing after this release.'],
    },
    {
      id: 'legacy',
      name: '2.0 Legacy',
      summary: '2.0 cards with the X2PO team’s points: 200-point squads, upgrades cost squad points',
      data: 'legacy',
      limit: 200,
      modes: [
        { id: 'standard', name: 'Standard' },
        { id: 'wildspace', name: 'Wild Space' },
        { id: 'epic', name: 'Epic' },
      ],
      docs: [
        { label: 'X2PO: 2.0 Legacy points and rules', url: 'http://points.x2po.org/' },
        { label: 'Legacy card data and errata (GitHub)', url: 'https://github.com/SogeMoge/xwing-data2-legacy' },
      ],
      notes: [
        'Squads are up to 200 points, and upgrades are paid from them.',
        'Some upgrades cost more on ships with higher agility, initiative or size; the app works this out per ship.',
        'Legacy renamed Extended to Standard and Hyperspace to Wild Space.',
      ],
    },
  ],
  factions: FACTIONS,
  kinds: ['Ships'],
  slotOrder: ['Talent', 'Force Power', 'Sensor', 'Cannon', 'Turret', 'Torpedo', 'Missile', 'Tactical Relay', 'Crew', 'Gunner', 'Astromech', 'Device', 'Illicit', 'Modification', 'Title', 'Configuration', 'Tech', 'Cargo', 'Hardpoint', 'Team', 'Command', 'Hyperdrive'],

  upgradeCost(g, u) {
    if (typeof g.cost === 'number') return g.cost;
    const { by, values } = g.cost;
    const key = by === 'agility' ? statOf(u, 'Agility') : by === 'initiative' ? u.initiative : by === 'size' ? u.size : (u as unknown as Record<string, unknown>)[by];
    return values[String(key)] ?? Math.max(...Object.values(values));
  },

  slotsFor(u, ups) {
    const extra = ups.flatMap((g) => g.grants.filter((gr) => gr.type === 'slot').flatMap((gr) => Array<string>(gr.amount ?? 1).fill(String(gr.value))));
    return [...u.slots, ...extra];
  },

  canEquip(g, u, list: List) {
    if (g.fixedOnly) return 'only comes printed on standard loadout pilots';
    for (const r of g.restrictions ?? []) {
      const why = restrictionProblem(r, u, list.faction);
      if (why) return why;
    }
    return null;
  },

  validate(list, cat: Catalog<Pilot, XUpgrade>) {
    const issues = [];
    for (const lu of list.units) {
      const u = cat.units.get(lu.id);
      if (u?.fixed && lu.upgrades.length) issues.push({ level: 'error' as const, message: `${u.name} flies a standard loadout and takes no other upgrades`, units: [lu.uid] });
    }
    return issues;
  },

  unitFilters: [
    { id: 'ship', label: 'Ships', values: (u) => [u.shipName] },
    { id: 'init', label: 'Initiatives', values: (u) => [`Initiative ${u.initiative}`] },
    { id: 'size', label: 'Sizes', values: (u) => [u.size] },
  ],
  statLine: (u) => `I${u.initiative} · ${u.size}`,
  details: (u) => [
    ['Ship', u.shipName],
    ['Size', u.size],
    ['Actions', u.actions.join(', ') || 'None'],
  ],

  tracker: {
    round: { label: 'Round', max: 12 },
    phases: ['Planning', 'System', 'Activation', 'Engagement', 'End'],
    tokens: ['Focus', 'Evade', 'Calculate', 'Reinforce', 'Lock', 'Stress', 'Strain', 'Deplete', 'Ion', 'Jam', 'Tractor', 'Disarm', 'Cloak'],
    counters(u, ups) {
      const c: Counter[] = [
        { id: 'hull', label: 'Hull', max: statWith(u, ups, 'hull'), color: 'var(--hull)' },
        { id: 'shields', label: 'Shields', max: statWith(u, ups, 'shields'), color: 'var(--shields)' },
      ];
      const force = (u.force ?? 0) + ups.reduce((n, g) => n + (g.force ?? 0) + g.grants.filter((gr) => gr.type === 'force').reduce((m, gr) => m + (gr.amount ?? 0), 0), 0);
      if (force) c.push({ id: 'force', label: 'Force', max: force, color: 'var(--force)' });
      if (u.charges) c.push({ id: 'charges', label: 'Charges', max: u.charges, color: 'var(--charge)' });
      ups.forEach((g, i) => g.charges && c.push({ id: `up${i}`, label: g.name, max: g.charges, color: 'var(--charge)' }));
      return c.filter((x) => x.max > 0 || x.id === 'hull');
    },
    note: 'Tap Phase to move on; a new round marks every ship ready again. A ship at half hull or less is worth half its points in most scenarios.',
  },

  exports: [
    {
      label: 'XWS (YASB, Launch Bay Next, tournament tools)',
      run(list, cat) {
        return JSON.stringify({
          name: list.name,
          faction: list.faction,
          points: list.units.reduce((n, lu) => n + unitCost(game, lu, cat), 0),
          version: '2.5.0',
          ruleset: cat.ruleset.name,
          pilots: list.units
            .filter((lu) => cat.units.has(lu.id))
            .map((lu) => {
              const u = cat.units.get(lu.id)!;
              const upgrades: Record<string, string[]> = {};
              for (const g of upgradesOf(lu, cat)) (upgrades[slotKey(g.type)] ??= []).push(g.id);
              return { id: u.id, ship: u.ship, points: unitCost(game, lu, cat), ...(Object.keys(upgrades).length ? { upgrades } : {}) };
            }),
          vendor: { milk: { builder: "Milk's X-Wing Squad Builder", ruleset: list.ruleset, mode: list.mode } },
        });
      },
    },
    {
      label: 'Text',
      run(list, cat) {
        const lines = [`${list.name} (${FACTIONS.find((f) => f.id === list.faction)?.name}, ${cat.ruleset.name})`];
        let total = 0;
        for (const lu of list.units) {
          const u = cat.units.get(lu.id);
          if (!u) continue;
          const ups = upgradesOf(lu, cat);
          const upPts = ups.reduce((n, g) => n + game.upgradeCost(g, u), 0);
          const pts = u.cost + (cat.ruleset.loadout ? 0 : upPts);
          total += pts;
          lines.push(`${u.name} (${u.shipName}) ${pts}${cat.ruleset.loadout && u.loadout != null ? ` [${upPts}/${u.loadout}]` : ''}`);
          for (const g of ups) lines.push(`  + ${g.name} (${game.upgradeCost(g, u)})`);
        }
        lines.push(`Total: ${total}/${cat.ruleset.limit}`);
        return lines.join('\n');
      },
    },
  ],

  importList(text) {
    let x: any;
    try {
      x = JSON.parse(text);
    } catch {
      throw new Error('Paste an XWS list (JSON). In YASB: Print/Export → XWS.');
    }
    if (!Array.isArray(x?.pilots)) throw new Error('That JSON has no pilots. Is it an XWS list?');
    const vendor = x.vendor?.milk ?? {};
    const ruleset = vendor.ruleset ?? (/legacy|x2po/i.test(`${x.ruleset ?? ''} ${x.version ?? ''}`) ? 'legacy' : undefined);
    return {
      name: x.name,
      faction: x.faction,
      ...(ruleset ? { ruleset } : {}),
      ...(vendor.mode ? { mode: vendor.mode } : {}),
      units: x.pilots.map((p: any) => ({ uid: '', id: String(p.id), upgrades: Object.values(p.upgrades ?? {}).flat().map(String) })),
    };
  },
  importHint: 'Paste an XWS list (from YASB, Launch Bay Next and most X-Wing tools), or a list file from this app.',
  credits: [
    { label: 'xwing-data2', url: 'https://github.com/xwingtmg/xwing-data2' },
    { label: 'xwing-data2-legacy', url: 'https://github.com/SogeMoge/xwing-data2-legacy' },
    { label: 'xwing-points (XWA, AMG, X2PO)', url: 'https://github.com/eirikmun/xwing-points' },
  ],
};
