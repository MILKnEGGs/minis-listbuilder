// Downloads X-Wing cards and points into public/data/<ruleset data>.json:
//   xwa.json    – X-Wing 2.5 cards (xwingtmg/xwing-data2) with the X-Wing Alliance's current points
//   amg.json    – the same cards with Atomic Mass Games' last official points
//   legacy.json – X-Wing 2.0 Legacy cards (SogeMoge/xwing-data2-legacy) with the X2PO team's points
// Points come from eirikmun/xwing-points, where both community teams publish them for tools.
// A pilot or upgrade missing from a points file isn't part of that ruleset, so it's left out.

import { mkdirSync, writeFileSync } from 'node:fs';

const DATA2 = 'https://raw.githubusercontent.com/xwingtmg/xwing-data2/master/';
const LEGACY = 'https://raw.githubusercontent.com/SogeMoge/xwing-data2-legacy/master/';
const POINTS = 'https://raw.githubusercontent.com/eirikmun/xwing-points/main/';

const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, url.includes('githubusercontent') ? { headers } : {});
    if (r.ok) return r.json();
    if (attempt === 3) throw new Error(`${r.status} ${url}`);
    await new Promise((res) => setTimeout(res, 1000 * attempt));
  }
}

/** Every ship (with its pilots) and every upgrade in an xwing-data2 style repository. */
async function cards(base) {
  const manifest = await get(base + 'data/manifest.json');
  const ships = await Promise.all(manifest.pilots.flatMap((f) => f.ships.map((p) => get(base + p))));
  const upgrades = (await Promise.all(manifest.upgrades.map((p) => get(base + p)))).flat();
  return { ships, upgrades, version: manifest.version };
}

/** The current points revision of one team: pilot xws → points entry (per faction) and upgrade xws → entry. */
async function points(team) {
  const revisions = await get(`${POINTS}${team}/points-revisions.json`);
  const rev = await get(POINTS + revisions.current_revision);
  const pilots = {};
  for (const [faction, file] of Object.entries(rev.files)) {
    if (faction === 'upgrades') continue;
    const byShip = await get(POINTS + file);
    pilots[faction] = Object.assign({}, ...Object.values(byShip));
  }
  return { pilots, upgrades: await get(POINTS + rev.files.upgrades), version: String(rev.format).trim(), date: rev.effective_date };
}

const yes = (v) => v === true || v === 'Yes';
const MODES = { xwa: ['standard', 'extended', 'epic'], amg: ['standard', 'extended', 'epic'], legacy: ['standard', 'wildspace', 'epic'] };
const modesOf = (entry, keys) => keys.filter((k) => yes(entry[k]));

const STAT_COLORS = { attack: 'var(--attack)', agility: 'var(--agility)', hull: 'var(--hull)', shields: 'var(--shields)', charges: 'var(--charge)', force: 'var(--force)' };
const ARC = { 'Front Arc': 'Front', 'Rear Arc': 'Rear', 'Single Turret Arc': 'Turret', 'Double Turret Arc': 'Double turret', 'Full Front Arc': 'Full front', 'Bullseye Arc': 'Bullseye', 'Left Arc': 'Left', 'Right Arc': 'Right' };

function action(a) {
  const one = (x) => (x.difficulty && x.difficulty !== 'White' ? `${x.type} (${x.difficulty.toLowerCase()})` : x.type);
  return a.linked ? `${one(a)} → ${one(a.linked)}` : one(a);
}

function cost(c) {
  if (typeof c === 'number') return c;
  if (c && typeof c.value === 'number') return c.value;
  if (c?.variable) return { by: c.variable, values: c.values };
  return 0;
}

function build(name, base, pts) {
  const modeKeys = MODES[name];
  const units = [];
  let missing = 0;
  for (const ship of base.ships) {
    const shipStats = ship.stats.map((s) => ({
      label: s.type === 'attack' ? `${ARC[s.arc] ?? s.arc} attack` : s.type[0].toUpperCase() + s.type.slice(1),
      value: s.value,
      color: STAT_COLORS[s.type],
    }));
    for (const p of ship.pilots) {
      const e = pts.pilots[ship.faction]?.[p.xws];
      if (!e) {
        missing++;
        continue;
      }
      const stats = [{ label: 'Initiative', value: p.initiative }, ...shipStats];
      if (p.charges) stats.push({ label: 'Charges', value: p.charges.value, color: STAT_COLORS.charges });
      if (p.force) stats.push({ label: 'Force', value: p.force.value, color: STAT_COLORS.force });
      const text = [];
      if (p.ability) text.push(p.ability);
      if (p.shipAbility) text.push(`**${p.shipAbility.name}:** ${p.shipAbility.text}`);
      if (p.standardLoadout?.length) text.push(`**Standard loadout:** ${p.standardLoadout.join(', ')}`);
      if (!p.ability && p.text) text.push(p.text);
      const restricted = e.restricted ?? 0;
      const limited = e.limited ?? p.limited ?? 0;
      units.push({
        id: p.xws,
        name: p.name,
        subtitle: [e.subtitle || p.caption, ship.name].filter(Boolean).join(' · '),
        faction: ship.faction,
        kind: 'Ships',
        cost: e.cost,
        ...(e.loadout != null ? { loadout: e.loadout } : {}),
        // XWA's restricted list makes cards limited without errata.
        limited: restricted && (!limited || restricted < limited) ? restricted : limited,
        slots: e.slots ?? p.slots ?? [],
        stats,
        text,
        keywords: e.keywords ?? p.keywords ?? [],
        modes: modesOf(e, modeKeys),
        ...(p.image ? { image: p.image } : {}),
        ship: ship.xws,
        shipName: ship.name,
        size: ship.size,
        initiative: p.initiative,
        actions: (p.shipActions ?? ship.actions ?? []).map(action),
        arcs: ship.stats.filter((s) => s.type === 'attack').map((s) => s.arc),
        ...(p.charges ? { charges: p.charges.value } : {}),
        ...(p.force ? { force: p.force.value } : {}),
        ...(p.standardLoadout?.length ? { fixed: p.standardLoadout } : {}),
      });
    }
  }

  const upgrades = [];
  for (const u of base.upgrades) {
    const e = pts.upgrades[u.xws];
    if (!e) {
      missing++;
      continue;
    }
    const [front, back] = u.sides;
    const text = [front.ability ?? front.text ?? ''].filter(Boolean);
    if (front.attack) text.unshift(`Attack ${front.attack.value} (${ARC[front.attack.arc] ?? front.attack.arc}, range ${front.attack.minrange}-${front.attack.maxrange}${front.attack.ordnance ? ', ordnance' : ''})`);
    if (back) text.push(`**Other side, ${back.title}:** ${back.ability ?? back.text ?? ''}`);
    const restrictions = e.restrictions ?? u.restrictions ?? [];
    const factions = restrictions.flatMap((r) => r.factions ?? []);
    const restricted = e.restricted ?? 0;
    const limited = e.limited ?? u.limited ?? 0;
    upgrades.push({
      id: u.xws,
      name: u.name,
      type: front.type,
      slots: e.slots ?? front.slots ?? [front.type],
      cost: cost(e.cost),
      limited: restricted && (!limited || restricted < limited) ? restricted : limited,
      text,
      ...(factions.length ? { factions: [...new Set(factions)] } : {}),
      modes: modesOf(e, modeKeys),
      ...(front.image ? { image: front.image } : {}),
      restrictions,
      grants: front.grants ?? [],
      ...(front.charges ? { charges: front.charges.value } : {}),
      ...(front.force ? { force: front.force.value } : {}),
      ...(u.standardLoadoutOnly ? { fixedOnly: true } : {}),
    });
  }
  return { units, upgrades, missing };
}

const [data2, legacy, xwa, amg, x2po] = await Promise.all([cards(DATA2), cards(LEGACY), points('XWA'), points('AMG'), points('X2PO')]);

mkdirSync('public/data', { recursive: true });
const updated = new Date().toISOString();
for (const [name, base, pts] of [
  ['xwa', data2, xwa],
  ['amg', data2, amg],
  ['legacy', legacy, x2po],
]) {
  const { units, upgrades, missing } = build(name, base, pts);
  writeFileSync(`public/data/${name}.json`, JSON.stringify({ updated, version: `${pts.version} (${pts.date})`, units, upgrades }));
  console.log(`${name}: ${units.length} pilots, ${upgrades.length} upgrades (points ${pts.version}; ${missing} cards without points left out)`);
}
