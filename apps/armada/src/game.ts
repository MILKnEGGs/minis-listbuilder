// Star Wars: Armada. Card data is every official ship, squadron, upgrade and objective, converted once from
// Flagship (see scripts/flagship.mjs). Fleets are 400 points with one commander, at most a third of the
// points on squadrons, two flotillas, and one assault, defense and navigation objective.

import { upgradesOf } from '@milk/minis-core/list';
import type { Catalog, Counter, GameDef, Issue, List, Unit, Upgrade } from '@milk/minis-core/types';

export interface ArmadaUnit extends Unit {
  hull: number;
  tokens: string[];
  /** Ships only. */
  size?: string;
  command?: number;
  maxSpeed?: number;
  shields?: { front: number; left: number; right: number; rear: number; leftAux?: number; rightAux?: number };
  traits?: string[];
  /** Unique squadrons with defense tokens: a fleet may have one per 100 points. */
  ace?: boolean;
}

export interface ArmadaUpgrade extends Upgrade {
  /** Ship ids that may take it (titles, ship-specific cards). */
  ships?: string[];
  sizes?: string[];
  traits?: string[];
  modification?: boolean;
  /** An upgrade slot it adds to the ship, and slots it takes away. */
  grants?: string;
  removes?: string[];
}

const isShip = (u: ArmadaUnit) => u.kind === 'Ships';

const FACTIONS = [
  { id: 'empire', name: 'Galactic Empire', color: '#9ca3af' },
  { id: 'rebels', name: 'Rebel Alliance', color: '#e2483d' },
  { id: 'republic', name: 'Galactic Republic', color: '#dc8a3c' },
  { id: 'separatists', name: 'Separatist Alliance', color: '#6b8ec7' },
];

const COMMANDS = ['Navigate', 'Squadron', 'Repair', 'Concentrate Fire'];

function fleetIssues(list: List, cat: Catalog<ArmadaUnit, ArmadaUpgrade>): Issue[] {
  const issues: Issue[] = [];
  const limit = cat.ruleset.limit;
  const units = list.units.map((lu) => ({ lu, u: cat.units.get(lu.id) })).filter((x): x is { lu: typeof x.lu; u: ArmadaUnit } => !!x.u);

  const commanders = units.flatMap(({ lu }) => upgradesOf(lu, cat).filter((g) => g.type === 'Commander').map(() => lu.uid));
  if (!commanders.length && units.some(({ u }) => isShip(u))) issues.push({ level: 'error', message: 'Choose a commander for your flagship' });
  if (commanders.length > 1) issues.push({ level: 'error', message: `Only 1 commander per fleet (${commanders.length})`, units: commanders });

  const squadronMax = Math.ceil(limit / 3);
  const squadronPts = units.filter(({ u }) => !isShip(u)).reduce((n, { u }) => n + u.cost, 0);
  if (squadronPts > squadronMax) issues.push({ level: 'error', message: `Squadrons: ${squadronPts}/${squadronMax} points (a third of the fleet). Cut ${squadronPts - squadronMax}` });

  const flotillas = units.filter(({ u }) => u.size === 'Flotilla');
  if (flotillas.length > 2) issues.push({ level: 'error', message: `At most 2 flotillas (${flotillas.length})`, units: flotillas.map(({ lu }) => lu.uid) });

  const aces = units.filter(({ u }) => u.ace);
  const aceMax = Math.floor(limit / 100);
  if (aces.length > aceMax) issues.push({ level: 'error', message: `At most ${aceMax} unique squadrons with defense tokens (${aces.length})`, units: aces.map(({ lu }) => lu.uid) });

  for (const { lu, u } of units) {
    const ups = upgradesOf(lu, cat);
    if (ups.filter((g) => g.modification).length > 1) issues.push({ level: 'error', message: `${u.name}: only 1 modification per ship`, units: [lu.uid] });
    const seen = new Set<string>();
    for (const g of ups) {
      if (seen.has(g.name)) issues.push({ level: 'error', message: `${u.name}: 2 copies of ${g.name} on one ship`, units: [lu.uid] });
      seen.add(g.name);
    }
  }

  const missing = ['assault', 'defense', 'navigation'].filter((p) => !list.picks?.[p]);
  if (missing.length) issues.push({ level: 'warning', message: `Choose ${missing.join(', ')} objective${missing.length > 1 ? 's' : ''}` });
  return issues;
}

export const game: GameDef<ArmadaUnit, ArmadaUpgrade> = {
  id: 'armada',
  title: "Milk's Armada Fleet Builder",
  game: 'Star Wars: Armada',
  noun: 'fleet',
  rulesets: [
    {
      id: 'standard',
      name: 'Standard (400 points)',
      summary: 'Every official ship, squadron and upgrade: 400-point fleets with tournament fleet building rules',
      data: 'armada',
      limit: 400,
      docs: [
        { label: 'AMG: the final Armada update (rules reference, tournament regulations, errata)', url: 'https://www.atomicmassgames.com/transmission/organized-play-updates-including-a-long-awaited-update/' },
        { label: 'Fantasy Flight Armada rules reference (older version)', url: 'https://images-cdn.fantasyflightgames.com/filer_public/2c/4d/2c4de555-925d-4fde-8af6-02873437149b/swm01_rules_reference_guide_lowres.pdf' },
      ],
      notes: [
        'One commander per fleet, on its flagship. At most a third of the points (rounded up) on squadrons.',
        'At most 2 flotillas, and one unique squadron with defense tokens per 100 points.',
        'Each ship: one modification, one title, no two copies of the same upgrade. Boarding Team slots share with Offensive Retrofit + Weapons Team pairs.',
        'Pick one assault, one defense and one navigation objective. The game lasts 6 rounds.',
        'Card data and points come from Flagship (2023). If a later errata or the AMG final update changed a card, fix it in a homebrew.',
        'Community content (Armada Legacy, ARC, Nexus) isn’t in the data: add its cards and points with a homebrew.',
      ],
      recommended: true,
    },
  ],
  factions: FACTIONS,
  kinds: ['Ships', 'Squadrons'],
  slotOrder: ['Commander', 'Officer', 'Title', 'Weapons Team', 'Support Team', 'Boarding Team', 'Fleet Command', 'Fleet Support', 'Offensive Retrofit', 'Defensive Retrofit', 'Experimental Retrofit', 'Turbolasers', 'Ion Cannons', 'Ordnance', 'Superweapon'],

  upgradeCost: (g) => (typeof g.cost === 'number' ? g.cost : Math.max(...Object.values(g.cost.values))),

  slotsFor(u, ups) {
    const slots = [...u.slots];
    for (const g of ups) {
      if (g.grants) slots.push(g.grants);
      for (const r of g.removes ?? []) {
        const i = slots.indexOf(r);
        if (i >= 0) slots.splice(i, 1);
      }
    }
    return slots;
  },

  canEquip(g, u, list) {
    if (!isShip(u)) return 'squadrons take no upgrades';
    if (g.factions && !g.factions.includes(list.faction)) return 'wrong faction';
    if (g.ships && !g.ships.includes(u.id)) return 'not for this ship';
    if (g.sizes && !g.sizes.includes(u.size ?? '')) return `${g.sizes.join(' or ').toLowerCase()} ships only`;
    if (g.traits && !g.traits.some((t) => u.traits?.includes(t))) return `${g.traits.join(' or ')} ships only`;
    return null;
  },

  validate: fleetIssues,
  picks: [
    { id: 'assault', label: 'Assault objective' },
    { id: 'defense', label: 'Defense objective' },
    { id: 'navigation', label: 'Navigation objective' },
  ],

  unitFilters: [
    { id: 'kind', label: 'Types', values: (u) => [u.kind] },
    { id: 'size', label: 'Sizes', values: (u) => (u.size ? [u.size] : []) },
  ],
  statLine: (u) => (isShip(u) ? `hull ${u.hull} · command ${u.command}` : `hull ${u.hull} · speed ${u.stats.find((s) => s.label === 'Speed')?.value}`),
  details: (u) => (u.traits?.length ? [['Traits', u.traits.join(', ')]] : []),

  tracker: {
    round: { label: 'Round', max: 6 },
    phases: ['Command', 'Ship', 'Squadron', 'Status'],
    tokens: ['Navigate', 'Squadron', 'Repair', 'Concentrate Fire', 'Raid', 'Facedown damage', 'Faceup damage'],
    counters(u) {
      if (!isShip(u)) return [{ id: 'hull', label: 'Hull', max: u.hull, color: 'var(--hull)' }];
      const s = u.shields!;
      const c: Counter[] = [
        { id: 'hull', label: 'Hull', max: u.hull, color: 'var(--hull)' },
        { id: 'speed', label: 'Speed', max: u.maxSpeed ?? 4, start: Math.min(2, u.maxSpeed ?? 2) },
        { id: 'front', label: 'Front shields', max: s.front, color: 'var(--shields)' },
        { id: 'left', label: 'Left shields', max: s.left, color: 'var(--shields)' },
        { id: 'right', label: 'Right shields', max: s.right, color: 'var(--shields)' },
        { id: 'rear', label: 'Rear shields', max: s.rear, color: 'var(--shields)' },
      ];
      if (s.leftAux != null) c.push({ id: 'leftAux', label: 'Left aux shields', max: s.leftAux, color: 'var(--shields)' }, { id: 'rightAux', label: 'Right aux shields', max: s.rightAux ?? s.leftAux, color: 'var(--shields)' });
      return c;
    },
    toggles: (u) => u.tokens.map((t, i) => ({ id: `tok${i}`, label: t, states: ['Ready', 'Exhausted', 'Discarded'] })),
    dials: (u) => (isShip(u) && u.command ? { size: u.command, options: COMMANDS } : null),
    note: 'Ships keep a stack of command dials as tall as their command value: add dials in the Command Phase, and tap the top one to reveal it. Destroyed ships and squadrons count toward your opponent’s score.',
  },

  exports: [
    {
      label: 'Text',
      run(list, cat) {
        const lines = [`${list.name}`, `Faction: ${FACTIONS.find((f) => f.id === list.faction)?.name}`, ''];
        for (const p of ['assault', 'defense', 'navigation']) {
          const o = cat.picks[p]?.find((x) => x.id === list.picks?.[p]);
          lines.push(`${p[0].toUpperCase() + p.slice(1)}: ${o?.name ?? '—'}`);
        }
        lines.push('');
        let total = 0;
        let squadrons = 0;
        for (const lu of list.units) {
          const u = cat.units.get(lu.id);
          if (!u) continue;
          const ups = upgradesOf(lu, cat);
          const pts = u.cost + ups.reduce((n, g) => n + game.upgradeCost(g, u), 0);
          total += pts;
          if (!isShip(u)) squadrons += pts;
          lines.push(`${u.name} (${pts})`);
          for (const g of ups) lines.push(`• ${g.name} (${game.upgradeCost(g, u)})`);
        }
        lines.push('', `Squadrons: ${squadrons}`, `Total points: ${total}/${cat.ruleset.limit}`);
        return lines.join('\n');
      },
    },
  ],
  importHint: 'Paste a fleet file from this app (Export → Copy on the other phone).',
  credits: [{ label: 'Flagship (card data, MIT)', url: 'https://github.com/videege/flagship' }],
};
