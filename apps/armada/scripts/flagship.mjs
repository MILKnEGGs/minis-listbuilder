// One-time converter: builds public/data/armada.json from Flagship (github.com/videege/flagship, MIT),
// an open-source Armada fleet builder whose card data covers every official ship, squadron, upgrade and
// objective. Flagship stopped changing in April 2023 (Armada itself is finished), so this is pinned to that
// commit and its output is committed; run it again only to re-check the conversion:
//   node scripts/flagship.mjs
// Flagship keeps its data as TypeScript object literals. They're read with the TypeScript parser as data:
// nothing from Flagship is run.

import { mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const COMMIT = 'f6b9ed9a14bdd2e44f13a350fe29e53a487c0da2';
const BASE = `https://raw.githubusercontent.com/videege/flagship/${COMMIT}/flagship/src/app/domain/`;

const sources = {};
for (const f of ['game/faction', 'game/size', 'game/defenseToken', 'game/upgradeType', 'game/keyword', 'game/objective', 'game/traits', 'game/resource', 'game/ship', 'game/upgrade', 'factories/shipFactory', 'factories/squadronFactory', 'factories/upgradeFactory', 'factories/objectiveFactory']) {
  const r = await fetch(`${BASE}${f}.ts`);
  if (!r.ok) throw new Error(`${r.status} ${f}`);
  sources[f] = ts.createSourceFile(`${f}.ts`, await r.text(), ts.ScriptTarget.ES2022, true);
}

/** Every node in a file, depth first. */
function* walk(node) {
  yield node;
  for (const child of node.getChildren()) yield* walk(child);
}

// Enums: member → its string value, or its name for numeric members.
const enums = {};
for (const sf of Object.values(sources))
  for (const n of walk(sf))
    if (ts.isEnumDeclaration(n)) enums[n.name.text] = Object.fromEntries(n.members.map((m) => [m.name.getText(), m.initializer && ts.isStringLiteral(m.initializer) ? m.initializer.text : m.name.getText()]));

// Static string fields like Traits.clone, and object fields like ShipFactory.titles.
const statics = {};
for (const sf of Object.values(sources))
  for (const n of walk(sf))
    if (ts.isPropertyDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) && n.initializer && ts.isClassDeclaration(n.parent) && !ts.isArrayLiteralExpression(n.initializer))
      statics[`${n.parent.name.text}.${n.name.getText()}`] = n.initializer;

/** Turns a literal expression into plain data. `new X(a, b)` becomes { new: 'X', args: [a, b] }. */
function value(n) {
  switch (n.kind) {
    case ts.SyntaxKind.NumericLiteral:
      return Number(n.text);
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return n.text;
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
  }
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) return -value(n.operand);
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) return value(n.expression);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) return value(n.left) + value(n.right);
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(value);
  if (ts.isObjectLiteralExpression(n))
    return Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText().replace(/^['"]|['"]$/g, ''), value(p.initializer)]));
  if (ts.isNewExpression(n)) return { new: n.expression.getText(), args: (n.arguments ?? []).map(value) };
  if (ts.isPropertyAccessExpression(n)) {
    const text = n.getText();
    const [head, member] = [n.expression.getText(), n.name.text];
    if (enums[head] && member in enums[head]) return enums[head][member];
    if (statics[text]) return value(statics[text]);
    // ShipFactory.titles.isd: a field of a static object.
    const parent = statics[head];
    if (parent) return value(parent)[member];
  }
  throw new Error(`Can't read ${ts.SyntaxKind[n.kind]}: ${n.getText().slice(0, 80)}`);
}

/** The array assigned to a class field or `this.field = [...]` in a file. */
function arrayIn(file, field) {
  for (const n of walk(sources[file])) {
    if (ts.isPropertyDeclaration(n) && n.name.getText() === field && n.initializer && ts.isArrayLiteralExpression(n.initializer)) return value(n.initializer);
    if (ts.isBinaryExpression(n) && n.left.getText() === `this.${field}` && ts.isArrayLiteralExpression(n.right)) return value(n.right);
  }
  throw new Error(`No ${field} in ${file}`);
}

const FACTION = { Empire: 'empire', Rebels: 'rebels', Republic: 'republic', Separatists: 'separatists' };
const SIZE = { SmallFlotilla: 'Flotilla', Small: 'Small', Medium: 'Medium', Large: 'Large', Huge: 'Huge' };
const KEYWORD = { AIAntiSquadron: 'AI: Anti-Squadron', AIBattery: 'AI: Battery' };
const dice = (a) => {
  if (!a?.args) return '—';
  const [red, blue, black] = a.args;
  return [red ? `${red} red` : '', blue ? `${blue} blue` : '', black ? `${black} black` : ''].filter(Boolean).join(', ') || '—';
};
const nav = (n) =>
  (n?.args ?? [])
    .map((s) => (s == null ? null : [s].flat()))
    .map((clicks, i) => (clicks ? `speed ${i + 1}: ${clicks.join('-')}` : null))
    .filter(Boolean)
    .join(' · ');

const titles = new Map(); // title upgrade id → ship ids that may take it
const ships = arrayIn('factories/shipFactory', 'shipData').map((s) => {
  for (const t of s.allowedTitles ?? []) titles.set(t, [...(titles.get(t) ?? []), `ship-${s.id}`]);
  const slots = s.upgradeSlots.map((x) => x.args[0]);
  // As Flagship does: every ship can take a title, every non-flotilla a commander, and a ship with
  // Offensive Retrofit and Weapons Team slots gets matching Boarding Team slots (each pair is one or the other).
  const boarding = slots.includes('Boarding Team') ? 0 : Math.min(slots.filter((x) => x === 'Offensive Retrofit').length, slots.filter((x) => x === 'Weapons Team').length);
  for (let i = 0; i < boarding; i++) slots.push('Boarding Team');
  if (!slots.includes('Title')) slots.push('Title');
  if (s.size !== 'SmallFlotilla' && !slots.includes('Commander')) slots.unshift('Commander');
  const huge = s.shipClass === 'Huge';
  return {
    id: `ship-${s.id}`,
    name: s.name,
    subtitle: `${SIZE[s.size]} ship`,
    faction: FACTION[s.faction],
    kind: 'Ships',
    cost: s.points,
    limited: s.unique ? 1 : 0,
    slots,
    stats: [
      { label: 'Hull', value: s.hull, color: 'var(--hull)' },
      { label: 'Command', value: s.command },
      { label: 'Squadron', value: s.squadron },
      { label: 'Engineering', value: s.engineering },
      { label: 'Front shields', value: s.frontShields, color: 'var(--shields)' },
      { label: 'Side shields', value: s.leftShields, color: 'var(--shields)' },
      { label: 'Rear shields', value: s.rearShields, color: 'var(--shields)' },
      ...(huge ? [{ label: 'Aux shields', value: s.leftAuxShields, color: 'var(--shields)' }] : []),
    ],
    text: [
      `**Defense tokens:** ${s.defenseTokens.join(', ') || 'none'}`,
      `**Battery:** front ${dice(s.frontArmament)}; sides ${dice(s.leftArmament)}; rear ${dice(s.rearArmament)}${huge ? `; aux ${dice(s.leftAuxArmament)}` : ''}`,
      `**Anti-squadron:** ${dice(s.antiSquadronArmament)}`,
      `**Navigation:** ${nav(s.navigationChart)}`,
      ...(s.ignitionArmament ? [`**Ignition:** ${dice(s.ignitionArmament)}`] : []),
    ],
    keywords: [SIZE[s.size], ...(s.traits ?? [])],
    size: SIZE[s.size],
    hull: s.hull,
    command: s.command,
    maxSpeed: (s.navigationChart?.args ?? []).filter((x) => x != null).length,
    shields: { front: s.frontShields, left: s.leftShields, right: s.rightShields, rear: s.rearShields, ...(huge ? { leftAux: s.leftAuxShields, rightAux: s.rightAuxShields } : {}) },
    tokens: s.defenseTokens,
    traits: s.traits ?? [],
  };
});

const squadrons = arrayIn('factories/squadronFactory', 'squadronData').map((q) => {
  const kws = q.keywords.map((k) => `${KEYWORD[k.args[0]] ?? k.args[0]}${k.args[1] != null ? ` ${k.args[1]}` : ''}`);
  return {
    id: `sq-${q.id}`,
    name: q.name,
    subtitle: q.shipName && q.shipName !== q.name ? `${q.shipName} squadron` : 'Squadron',
    faction: FACTION[q.faction],
    kind: 'Squadrons',
    cost: q.points,
    limited: q.unique ? 1 : 0,
    slots: [],
    stats: [
      { label: 'Hull', value: q.hull, color: 'var(--hull)' },
      { label: 'Speed', value: q.speed },
    ],
    text: [
      ...(kws.length ? [`**Keywords:** ${kws.join(', ')}`] : []),
      `**Anti-squadron:** ${dice(q.antiSquadronArmament)} · **Battery:** ${dice(q.batteryArmament)}`,
      ...(q.defenseTokens.length ? [`**Defense tokens:** ${q.defenseTokens.join(', ')}`] : []),
      ...(q.text ? [q.text] : []),
    ],
    keywords: kws,
    hull: q.hull,
    tokens: q.defenseTokens,
    // Unique squadrons with defense tokens are aces: a fleet may field one per 100 points.
    ...(q.unique && q.defenseTokens.length ? { ace: true } : {}),
  };
});

const upgrades = arrayIn('factories/upgradeFactory', 'upgradeData').map((u) => {
  const factions = [u.faction].flat().filter((f) => f !== 'Any').map((f) => FACTION[f]);
  const shipsAllowed = u.type === 'Title' ? titles.get(u.id) : u.shipRestriction?.map((id) => `ship-${id}`);
  const sizes = u.sizeRestriction?.map((s) => SIZE[s]);
  const notes = [];
  if (sizes?.length) notes.push(`${sizes.join(' or ')} ships only.`);
  if (u.traitRestriction?.length) notes.push(`${u.traitRestriction.join(' or ')} only.`);
  if (u.modification) notes.push('Modification.');
  return {
    id: `up-${u.id}`,
    name: u.name,
    type: u.type,
    slots: [u.type],
    cost: u.points,
    limited: u.unique ? 1 : 0,
    text: [...notes, String(u.text ?? '').replace(/\s+/g, ' ').trim()].filter(Boolean),
    ...(factions.length && factions.length < 4 ? { factions } : {}),
    ...(shipsAllowed?.length ? { ships: shipsAllowed } : {}),
    ...(sizes?.length ? { sizes } : {}),
    ...(u.traitRestriction?.length ? { traits: u.traitRestriction } : {}),
    ...(u.modification ? { modification: true } : {}),
    ...(u.grantedType ? { grants: u.grantedType, removes: u.removedTypes ?? [] } : {}),
  };
});

const objectives = arrayIn('factories/objectiveFactory', 'objectives').map((o) => {
  const [id, type, name, setup, special, roundEnd, gameEnd] = o.args;
  const clean = (t) => String(t).replace(/\s+/g, ' ').trim();
  return {
    type,
    id: `obj-${id}`,
    name,
    text: [setup && `Setup: ${clean(setup)}`, special && `Special rule: ${clean(special)}`, roundEnd && `End of round: ${clean(roundEnd)}`, gameEnd && `End of game: ${clean(gameEnd)}`].filter(Boolean),
  };
});
const pick = (type) => objectives.filter((o) => o.type === type).map(({ type: _, ...o }) => o);

mkdirSync('public/data', { recursive: true });
writeFileSync(
  'public/data/armada.json',
  JSON.stringify({
    updated: new Date().toISOString(),
    version: `Flagship ${COMMIT.slice(0, 7)}`,
    units: [...ships, ...squadrons],
    upgrades,
    picks: { assault: pick('Assault'), defense: pick('Defense'), navigation: pick('Navigation') },
  }),
);
console.log(`${ships.length} ships, ${squadrons.length} squadrons, ${upgrades.length} upgrades, ${objectives.length} objectives`);
