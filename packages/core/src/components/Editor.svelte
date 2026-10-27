<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // One list: its units with their upgrades by slot, points, problems, and picks like objectives.
  // Saves as you go.
  import { onMount } from 'svelte';
  import { loadCatalog } from '../data';
  import { deleteList, getList, putList } from '../db';
  import {
    addUnit,
    cloneUnit,
    exportListJson,
    fit,
    legalIn,
    listCost,
    removeUnit,
    slotsOf,
    unitCost,
    upgradePoints,
    upgradesOf,
    validate,
  } from '../list';
  import { allRulesets, resolveRuleset } from '../ruleset';
  import type { Catalog, GameDef, Homebrew, List, ListUnit, PickItem, Unit, Upgrade } from '../types';
  import { copyText, download, fold } from '../util';
  import CardDetail from './CardDetail.svelte';
  import Picker from './Picker.svelte';

  let { game, homebrews, id, reloadHomebrew }: { game: GameDef<U, G>; homebrews: Homebrew[]; id: string; reloadHomebrew: () => Promise<void> } = $props();

  let list = $state<List | null>(null);
  let missing = $state(false);
  let cat = $state.raw<Catalog<U, G> | null>(null);
  let loadError = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  let addingUnit = $state(false);
  let slotFor = $state<{ uid: string; slot: string } | null>(null);
  let viewing = $state<{ kind: 'units' | 'upgrades'; card: U | G; lu?: ListUnit; index?: number } | null>(null);
  let exportDialog = $state<HTMLDialogElement>();
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout>;

  const ruleset = $derived(list ? resolveRuleset(game, list.ruleset, homebrews) : game.rulesets[0]);
  const rulesets = $derived(allRulesets(game, homebrews));
  const issues = $derived(list && cat ? validate(game, list, cat) : []);
  const errors = $derived(issues.filter((i) => i.level === 'error'));
  const flagged = $derived(new Map(issues.flatMap((i) => (i.units ?? []).map((u) => [u, i.level] as const))));
  const total = $derived(list && cat ? listCost(game, list, cat) : 0);
  const unitNoun = $derived(game.kinds.map((k) => k.toLowerCase().replace(/s$/, '')).join(' or '));

  onMount(() => {
    getList(id).then((l) => {
      if (l) list = l;
      else missing = true;
    });
    const flush = () => saveNow();
    addEventListener('pagehide', flush);
    return () => {
      removeEventListener('pagehide', flush);
      saveNow();
    };
  });

  // The catalog follows the list's ruleset (and the homebrew's latest edits).
  $effect(() => {
    const r = ruleset;
    if (!list) return;
    loadCatalog<U, G>(r)
      .then((c) => (cat = c))
      .catch((e) => (loadError = String(e.message ?? e)));
  });

  function changed() {
    if (!list) return;
    list.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (list) void putList(list);
  }
  function say(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2500);
  }

  const factionName = (f: string) => game.factions.find((x) => x.id === f)?.name ?? f;

  /** Copies of a name already in the list, across units and upgrades. */
  function nameCount(name: string): number {
    if (!list || !cat) return 0;
    let n = 0;
    for (const lu of list.units) {
      if (cat.units.get(lu.id)?.name === name) n++;
      for (const g of upgradesOf(lu, cat)) if (g.name === name) n++;
    }
    return n;
  }

  const unitItems = $derived.by((): PickItem[] => {
    if (!list || !cat) return [];
    const l = list;
    return [...cat.units.values()]
      .filter((u) => u.faction === l.faction)
      .sort((a, b) => a.kind.localeCompare(b.kind) || (a.subtitle ?? '').localeCompare(b.subtitle ?? '') || b.cost - a.cost || a.name.localeCompare(b.name))
      .map((u) => ({
        key: u.id,
        name: u.name,
        sub: [u.subtitle, game.statLine(u), u.custom ? 'Homebrew' : ''].filter(Boolean).join(' · '),
        cost: `${u.cost}`,
        why: !legalIn(u, l.mode) ? `Not legal in ${ruleset.modes?.find((m) => m.id === l.mode)?.name}` : u.limited && nameCount(u.name) >= u.limited ? 'Already in the list (limited)' : null,
        search: fold(`${u.name} ${u.subtitle ?? ''} ${(u.keywords ?? []).join(' ')} ${u.text.join(' ')}`),
        tags: Object.fromEntries(game.unitFilters.map((f) => [f.id, f.values(u)])),
      }));
  });

  const slotItems = $derived.by((): PickItem[] => {
    if (!list || !cat || !slotFor) return [];
    const l = list;
    const lu = l.units.find((u) => u.uid === slotFor!.uid);
    const unit = lu && cat.units.get(lu.id);
    if (!lu || !unit) return [];
    const have = upgradesOf(lu, cat);
    const slot = slotFor.slot;
    return [...cat.upgrades.values()]
      .filter((g) => g.slots.includes(slot) || g.type === slot)
      .map((g) => {
        const why =
          game.canEquip(g, unit, l) ??
          (!legalIn(g, l.mode) ? 'Not legal in this mode' : null) ??
          (fit(slotsOf(game, unit, [...have, g]), [...have, g]).placed.size <= have.length ? 'Needs more free slots' : null) ??
          (g.limited && nameCount(g.name) >= g.limited ? 'Already in the list (limited)' : null) ??
          (have.some((h) => h.id === g.id) ? 'Already on this ship' : null);
        return {
          key: g.id,
          name: g.name,
          sub: [g.slots.length > 1 ? g.slots.join(' + ') : '', g.custom ? 'Homebrew' : '', g.text[0]?.slice(0, 110) + (g.text[0]?.length > 110 ? '…' : '')].filter(Boolean).join(' · '),
          cost: `${game.upgradeCost(g, unit)}`,
          why,
          search: fold(`${g.name} ${g.text.join(' ')}`),
        };
      })
      .sort((a, b) => Number(!!a.why) - Number(!!b.why) || a.name.localeCompare(b.name));
  });

  function pickUnit(key: string) {
    if (!list) return;
    addUnit(list, key);
    changed();
    addingUnit = false;
    say(`Added ${cat?.units.get(key)?.name}`);
  }

  function pickUpgrade(key: string) {
    if (!list || !slotFor) return;
    const lu = list.units.find((u) => u.uid === slotFor!.uid);
    if (lu) lu.upgrades.push(key);
    changed();
    slotFor = null;
  }

  function removeUpgrade(lu: ListUnit, index: number) {
    lu.upgrades.splice(index, 1);
    changed();
  }

  /** Units in GameDef.kinds order, keeping the order you added them within each kind. */
  const sections = $derived.by(() => {
    if (!list || !cat) return [];
    const order = (k: string) => game.kinds.indexOf(k) + 1 || 99;
    const by = new Map<string, ListUnit[]>();
    for (const lu of list.units) {
      const k = cat.units.get(lu.id)?.kind ?? 'Unknown';
      (by.get(k) ?? by.set(k, []).get(k)!).push(lu);
    }
    return [...by].sort(([a], [b]) => order(a) - order(b));
  });

  function slotChips(lu: ListUnit, unit: U) {
    const ups = upgradesOf(lu, cat!);
    const f = fit(slotsOf(game, unit, ups), ups);
    const sortSlot = (s: string) => game.slotOrder.indexOf(s) + 1 || 99;
    return {
      placed: lu.upgrades
        .map((uid, i) => ({ g: cat!.upgrades.get(uid), i, uid }))
        .map((x) => ({ ...x, ok: x.g ? f.placed.has(ups.indexOf(x.g)) : false })),
      free: [...new Set(f.free)].sort((a, b) => sortSlot(a) - sortSlot(b)).map((s) => ({ s, n: f.free.filter((x) => x === s).length })),
    };
  }

  async function changeRuleset(rid: string) {
    if (!list) return;
    list.ruleset = rid;
    const r = resolveRuleset(game, rid, homebrews);
    if (!r.modes?.some((m) => m.id === list!.mode)) list.mode = r.modes?.[0]?.id;
    changed();
  }

  async function remove() {
    if (!list || !confirm(`Delete "${list.name}"? This can't be undone.`)) return;
    await deleteList(list.id);
    location.hash = '#/';
  }

  async function copy(text: string) {
    say((await copyText(text)) ? 'Copied' : "Couldn't copy. Select the text and copy it yourself");
  }
</script>

{#if missing}
  <main class="page"><p>That {game.noun} isn't on this device. <a href="#/">Back to your {game.noun}s</a></p></main>
{:else if list}
  <div class="topbar">
    <div class="topbar-inner">
      <a class="button ghost" href="#/" aria-label="Back to your {game.noun}s">←</a>
      <input class="name grow" type="text" bind:value={list.name} oninput={changed} aria-label="{game.noun} name" />
      <span class="points num" class:over={total > ruleset.limit}>{total}/{ruleset.limit}</span>
      <a class="button primary" href="#/match/{list.id}" onclick={saveNow}>Play</a>
    </div>
  </div>

  <main class="page">
    <section class="settings row">
      <label class="field">
        <span>Faction</span>
        <select bind:value={list.faction} onchange={changed}>{#each game.factions as f (f.id)}<option value={f.id}>{f.name}</option>{/each}</select>
      </label>
      <label class="field grow">
        <span>Ruleset</span>
        <select value={list.ruleset} onchange={(e) => changeRuleset(e.currentTarget.value)}>
          {#each rulesets as r (r.id)}<option value={r.id}>{r.name}{r.homebrew ? ' (homebrew)' : ''}</option>{/each}
        </select>
      </label>
      {#if ruleset.modes}
        <label class="field">
          <span>Mode</span>
          <select bind:value={list.mode} onchange={changed}>{#each ruleset.modes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
        </label>
      {/if}
      <a class="button ghost rules-link" href="#/rules/{encodeURIComponent(list.ruleset)}">Rules</a>
    </section>

    {#if loadError}
      <p class="error">Couldn't load the card data: {loadError}</p>
    {:else if !cat}
      <p class="muted">Loading cards…</p>
    {:else}
      {#if issues.length}
        <details class="issues panel" open={errors.length > 0 && errors.length < 4}>
          <summary class:error={errors.length > 0} class:warning={!errors.length}>
            {errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'}` : `${issues.length} note${issues.length === 1 ? '' : 's'}`}
          </summary>
          <ul>{#each issues as i, n (n)}<li class={i.level}>{i.message}</li>{/each}</ul>
        </details>
      {:else if list.units.length}
        <p class="legal small">✓ Legal {game.noun}</p>
      {/if}

      {#each game.picks ?? [] as p (p.id)}
        {@const options = cat.picks[p.id] ?? []}
        {@const chosen = options.find((o) => o.id === list!.picks?.[p.id])}
        <div class="pick-row row">
          <label class="field grow">
            <span>{p.label}</span>
            <select value={list.picks?.[p.id] ?? ''} onchange={(e) => { list!.picks = { ...list!.picks, [p.id]: e.currentTarget.value }; changed(); }}>
              <option value="">Not chosen</option>
              {#each options as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            </select>
          </label>
          {#if chosen}
            <details class="pick-text small"><summary>Rules</summary>{#each chosen.text as t, i (i)}<p>{t}</p>{/each}</details>
          {/if}
        </div>
      {/each}

      {#each sections as [kind, units] (kind)}
        <h2>{kind} <span class="muted small">{units.length}</span></h2>
        <ul class="units">
          {#each units as lu (lu.uid)}
            {@const unit = cat.units.get(lu.id)}
            <li class="unit panel" class:error-edge={flagged.get(lu.uid) === 'error'} class:warn-edge={flagged.get(lu.uid) === 'warning'}>
              {#if unit}
                {@const chips = slotChips(lu, unit)}
                <div class="unit-head">
                  <button class="unit-name" onclick={() => (viewing = { kind: 'units', card: unit, lu })}>
                    <strong>{unit.name}</strong>
                    <span class="muted small">{[unit.subtitle, game.statLine(unit)].filter(Boolean).join(' · ')}</span>
                  </button>
                  <div class="unit-cost num">
                    <strong>{unitCost(game, lu, cat)}</strong>
                    {#if ruleset.loadout && unit.loadout != null}
                      <span class="small" class:over={upgradePoints(game, lu, cat) > unit.loadout}>{upgradePoints(game, lu, cat)}/{unit.loadout} loadout</span>
                    {/if}
                  </div>
                </div>
                <div class="slots">
                  {#each chips.placed as c (c.i)}
                    <button class="chip up" class:bad={!c.ok} onclick={() => c.g && (viewing = { kind: 'upgrades', card: c.g, lu, index: c.i })}>
                      {c.g?.name ?? c.uid}{#if c.g}{' '}<span class="muted num">{game.upgradeCost(c.g, unit)}</span>{/if}
                    </button>
                  {/each}
                  {#each chips.free as f (f.s)}
                    <button class="chip free" onclick={() => (slotFor = { uid: lu.uid, slot: f.s })}>+ {f.s}{f.n > 1 ? ` ×${f.n}` : ''}</button>
                  {/each}
                </div>
                <div class="unit-actions">
                  <button class="ghost small" onclick={() => { cloneUnit(list!, lu); changed(); }}>Copy</button>
                  <button class="ghost small danger" onclick={() => { removeUnit(list!, lu.uid); changed(); }}>Remove</button>
                </div>
              {:else}
                <div class="unit-head"><span>{lu.id} <span class="muted small">(not in this ruleset)</span></span></div>
                <div class="unit-actions"><button class="ghost small danger" onclick={() => { removeUnit(list!, lu.uid); changed(); }}>Remove</button></div>
              {/if}
            </li>
          {/each}
        </ul>
      {/each}

      <button class="primary add" onclick={() => (addingUnit = true)}>+ Add {unitNoun}</button>

      <section class="about">
        <label class="field">
          <span>Notes: what the {game.noun} does and how to fly it</span>
          <textarea rows="3" bind:value={list.description} oninput={changed}></textarea>
        </label>
        <div class="row">
          <button onclick={() => exportDialog?.showModal()}>Export</button>
          <button class="ghost danger" onclick={remove}>Delete {game.noun}</button>
        </div>
        <p class="muted small">{factionName(list.faction)} · {ruleset.name}{cat.version ? ` (${cat.version})` : ''}</p>
      </section>
    {/if}
  </main>

  {#if addingUnit && cat}
    <Picker
      title="Add a {unitNoun}"
      items={unitItems}
      filters={game.unitFilters}
      onPick={pickUnit}
      onInfo={(key) => (viewing = { kind: 'units', card: cat!.units.get(key)! })}
      onClose={() => (addingUnit = false)}
    />
  {/if}

  {#if slotFor && cat}
    {@const lu = list.units.find((u) => u.uid === slotFor!.uid)}
    <Picker
      title="{slotFor.slot} for {cat.units.get(lu?.id ?? '')?.name ?? ''}"
      items={slotItems}
      onPick={pickUpgrade}
      onInfo={(key) => (viewing = { kind: 'upgrades', card: cat!.upgrades.get(key)!, lu })}
      onClose={() => (slotFor = null)}
    />
  {/if}

  {#if viewing && cat}
    {@const v = viewing}
    <CardDetail
      {game}
      {cat}
      kind={v.kind}
      card={v.card}
      on={v.lu ? cat.units.get(v.lu.id) : undefined}
      onChanged={reloadHomebrew}
      onClose={() => (viewing = null)}
    >
      {#snippet actions()}
        {#if v.lu && v.index != null}
          <button class="danger" onclick={() => { removeUpgrade(v.lu!, v.index!); viewing = null; }}>Remove from {game.noun}</button>
        {/if}
      {/snippet}
    </CardDetail>
  {/if}

  <dialog bind:this={exportDialog}>
    <div class="dialog-body">
      <h2>Export</h2>
      {#if cat}
        {#each game.exports as x (x.label)}
          {@const text = x.run(list, cat)}
          <div class="export">
            <div class="row"><strong class="grow">{x.label}</strong><button onclick={() => copy(text)}>Copy</button></div>
            <textarea rows="4" readonly value={text}></textarea>
          </div>
        {/each}
      {/if}
      <div class="export">
        <div class="row">
          <strong class="grow">Milk's {game.noun} file (everything, for another phone)</strong>
          <button onclick={() => copy(exportListJson(game, list!))}>Copy</button>
          <button onclick={() => download(`${list!.name}.json`, exportListJson(game, list!))}>Save</button>
        </div>
      </div>
      <div class="buttons"><button class="ghost" onclick={() => exportDialog?.close()}>Close</button></div>
    </div>
  </dialog>

  {#if toast}<div class="toast">{toast}</div>{/if}
{/if}

<style>
  .name {
    font-weight: 600;
    font-size: 1.05rem;
    background: transparent;
    border-color: transparent;
  }
  .name:hover,
  .name:focus {
    border-color: var(--line);
  }
  .points {
    font-weight: 700;
    font-size: 1.1rem;
  }
  .over {
    color: var(--error);
  }
  .settings {
    margin: 14px 0;
    align-items: flex-end;
  }
  .rules-link {
    align-self: flex-end;
  }
  .issues {
    padding: 8px 12px;
    margin-bottom: 12px;
  }
  .issues summary {
    cursor: pointer;
    font-weight: 600;
  }
  .issues ul {
    margin: 8px 0 2px;
    padding-left: 18px;
  }
  .issues li.error {
    color: var(--error);
  }
  .issues li.warning {
    color: var(--warning);
  }
  .legal {
    color: var(--ok);
    margin: 0 0 12px;
  }
  .pick-row {
    margin-bottom: 10px;
    align-items: flex-end;
  }
  .pick-text p {
    margin: 4px 0;
  }
  h2 {
    font-size: 1rem;
    margin: 18px 0 8px;
  }
  .units {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .unit {
    padding: 10px 12px;
    display: grid;
    gap: 8px;
    border-left: 4px solid var(--line);
  }
  .error-edge {
    border-left-color: var(--error);
  }
  .warn-edge {
    border-left-color: var(--warning);
  }
  .unit-head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .unit-name {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    display: grid;
    gap: 2px;
  }
  .unit-cost {
    display: grid;
    justify-items: end;
    color: var(--accent);
  }
  .unit-cost strong {
    font-size: 1.15rem;
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip.up {
    border-color: var(--accent);
  }
  .chip.bad {
    border-color: var(--error);
    color: var(--error);
  }
  .chip.free {
    border-style: dashed;
    color: var(--muted);
  }
  .unit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }
  .add {
    margin-top: 14px;
    width: 100%;
    padding: 12px;
  }
  .about {
    margin-top: 28px;
    display: grid;
    gap: 10px;
  }
  .about p {
    margin: 0;
  }
  .export {
    display: grid;
    gap: 6px;
  }
  .export textarea {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 14px;
    box-shadow: var(--shadow);
    z-index: 60;
  }
</style>
