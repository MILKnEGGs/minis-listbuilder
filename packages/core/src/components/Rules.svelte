<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // Rules and homebrew. Pick a ruleset to see its official documents, reminders and every card's rules
  // text. Homebrew rulesets add your own notes and card changes on top of a built-in one, and travel as a
  // small file.
  import { loadCatalog } from '../data';
  import { deleteHomebrew, putHomebrew } from '../db';
  import { HOMEBREW_PREFIX, allRulesets, changeCount, exportHomebrew, importHomebrew, newHomebrew, unbanCard } from '../ruleset';
  import type { Catalog, GameDef, Homebrew, Unit, Upgrade } from '../types';
  import { copyText, download, fold, uid } from '../util';
  import CardDetail from './CardDetail.svelte';
  import CardEditor from './CardEditor.svelte';

  let { game, homebrews, reloadHomebrew, start }: { game: GameDef<U, G>; homebrews: Homebrew[]; reloadHomebrew: () => Promise<void>; start: string } = $props();

  const rulesets = $derived(allRulesets(game, homebrews));
  // svelte-ignore state_referenced_locally
  let selected = $state(start || (game.rulesets.find((r) => r.recommended) ?? game.rulesets[0]).id);
  const ruleset = $derived(rulesets.find((r) => r.id === selected) ?? rulesets[0]);
  const hb = $derived(ruleset.homebrew);

  let cat = $state.raw<Catalog<U, G> | null>(null);
  let loadError = $state('');
  $effect(() => {
    const r = ruleset;
    loadError = '';
    loadCatalog<U, G>(r)
      .then((c) => (cat = c))
      .catch((e) => (loadError = String(e.message ?? e)));
  });

  let tab = $state<'units' | 'upgrades'>('units');
  let q = $state('');
  let faction = $state('');
  let slot = $state('');
  let changedOnly = $state(false);
  let limit = $state(60);
  let viewing = $state<{ kind: 'units' | 'upgrades'; card: U | G } | null>(null);
  let creating = $state<Unit | Upgrade | null>(null);

  let newDialog = $state<HTMLDialogElement>();
  let newName = $state('');
  // svelte-ignore state_referenced_locally
  let newParent = $state(game.rulesets[0].id);
  let importDialog = $state<HTMLDialogElement>();
  let importText = $state('');
  let importError = $state('');
  let toast = $state('');

  const cards = $derived.by(() => {
    if (!cat) return [];
    const words = fold(q).split(/\s+/).filter(Boolean);
    const touched = (id: string) => !!hb && (id in hb[tab] || hb.added[tab].some((c) => c.id === id));
    const all = (tab === 'units' ? [...cat.units.values()] : [...cat.upgrades.values()]) as (U | G)[];
    return all
      .filter((c) => {
        if (changedOnly && !touched(c.id)) return false;
        if (tab === 'units' && faction && (c as U).faction !== faction) return false;
        if (tab === 'upgrades' && slot && (c as G).type !== slot) return false;
        const text = fold(`${c.name} ${'subtitle' in c ? (c.subtitle ?? '') : ''} ${c.text.join(' ')}`);
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const slots = $derived(cat ? [...new Set([...cat.upgrades.values()].map((g) => g.type))].sort() : []);

  function say(msg: string) {
    toast = msg;
    setTimeout(() => (toast = ''), 2500);
  }

  async function saveHb(h: Homebrew) {
    h.updated = Date.now();
    await putHomebrew(h);
    await reloadHomebrew();
  }

  async function createHomebrew() {
    const h = newHomebrew(newParent, newName.trim() || `My ${game.rulesets.find((r) => r.id === newParent)?.name}`);
    await saveHb(h);
    newDialog?.close();
    selected = HOMEBREW_PREFIX + h.id;
  }

  async function doImport(text: string) {
    importError = '';
    try {
      const h = importHomebrew(game, text);
      await saveHb(h);
      importDialog?.close();
      selected = HOMEBREW_PREFIX + h.id;
      say(`Imported ${h.name}`);
    } catch (e) {
      importError = (e as Error).message;
    }
  }

  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) await doImport(await f.text());
  }

  async function removeHomebrew(h: Homebrew) {
    if (!confirm(`Delete the homebrew "${h.name}"? Lists using it fall back to ${game.rulesets.find((r) => r.id === h.parent)?.name}.`)) return;
    await deleteHomebrew(h.id);
    await reloadHomebrew();
    selected = h.parent;
  }

  function newCard() {
    if (!hb || !cat) return;
    const id = `custom-${uid().slice(0, 8)}`;
    creating =
      tab === 'units'
        ? { id, name: 'New card', faction: faction || game.factions[0].id, kind: game.kinds[0], cost: 0, limited: 0, slots: [], stats: [], text: [], custom: true }
        : { id, name: 'New upgrade', type: slot || slots[0] || 'Upgrade', slots: [slot || slots[0] || 'Upgrade'], cost: 0, limited: 0, text: [], custom: true };
  }

  async function saveNew(card: Unit | Upgrade) {
    if (!hb) return;
    const { custom: _, ...c } = card;
    (hb.added[tab] as (Unit | Upgrade)[]).push(c);
    await saveHb(hb);
    creating = null;
  }
</script>

<div class="topbar">
  <div class="topbar-inner">
    <a class="button ghost" href="#/" aria-label="Back to your {game.noun}s">←</a>
    <h1 class="grow">Rules & homebrew</h1>
  </div>
</div>

<main class="page">
  <section class="pickers row">
    <label class="field grow">
      <span>Ruleset</span>
      <select bind:value={selected}>
        {#each rulesets as r (r.id)}<option value={r.id}>{r.name}{r.homebrew ? ' (homebrew)' : ''}</option>{/each}
      </select>
    </label>
    <button onclick={() => { newName = ''; newParent = hb?.parent ?? (game.rulesets.some((r) => r.id === selected) ? selected : game.rulesets[0].id); newDialog?.showModal(); }}>New homebrew</button>
    <button onclick={() => { importText = ''; importError = ''; importDialog?.showModal(); }}>Import homebrew</button>
  </section>

  <section class="panel about">
    <h2>{ruleset.name}</h2>
    <p class="muted">{ruleset.summary}</p>
    <p>
      <strong>{ruleset.limit} points</strong>{ruleset.loadout ? ', with upgrades paid from each pilot’s loadout' : ''}{ruleset.modes ? ` · modes: ${ruleset.modes.map((m) => m.name).join(', ')}` : ''}
      {#if cat?.version}<span class="muted small"> · points {cat.version}</span>{/if}
    </p>
    {#if ruleset.docs.length}
      <h3>Official rules</h3>
      <ul class="docs">
        {#each ruleset.docs as d (d.url)}<li><a href={d.url} target="_blank" rel="noopener">{d.label}</a></li>{/each}
      </ul>
    {/if}
    {#if ruleset.notes?.length}
      <h3>Reminders</h3>
      <ul>{#each ruleset.notes as n, i (i)}<li>{n}</li>{/each}</ul>
    {/if}

    {#if hb}
      <h3>Your homebrew</h3>
      <div class="row">
        <label class="field grow"><span>Name</span><input type="text" value={hb.name} onchange={(e) => { hb.name = e.currentTarget.value.trim() || hb.name; void saveHb(hb); }} /></label>
        <label class="field"><span>Points limit</span><input class="limit" type="text" inputmode="numeric" value={hb.limit ?? ''} placeholder={String(game.rulesets.find((r) => r.id === hb.parent)?.limit ?? '')} onchange={(e) => { const v = e.currentTarget.value.trim(); hb.limit = v && !isNaN(Number(v)) ? Number(v) : undefined; void saveHb(hb); }} /></label>
      </div>
      <label class="field">
        <span>House rules and corrections</span>
        <textarea rows="6" value={hb.notes} onchange={(e) => { hb.notes = e.currentTarget.value; void saveHb(hb); }} placeholder="Anything you play differently: errata, fixes to card text, scenario changes…"></textarea>
      </label>
      <p class="muted small">{changeCount(hb)} card change{changeCount(hb) === 1 ? '' : 's'}. Open any card below and choose Edit to change it, or add your own.</p>
      {#if hb.banned.length}
        <p class="small">Removed: {#each hb.banned as id (id)}<button class="chip" onclick={async () => { unbanCard(hb, id); await saveHb(hb); }}>{id} ↺</button>{' '}{/each}</p>
      {/if}
      <div class="row">
        <button onclick={() => download(`${hb.name}.homebrew.json`, exportHomebrew(game, hb))}>Save as file</button>
        <button onclick={async () => say((await copyText(exportHomebrew(game, hb))) ? 'Copied. Paste it into Import homebrew on the other phone' : "Couldn't copy")}>Copy</button>
        <button class="ghost danger" onclick={() => removeHomebrew(hb)}>Delete homebrew</button>
      </div>
    {:else}
      <p class="muted small">Want to fix a card or play by house rules? Make a homebrew of this ruleset: your changes sit on top, and point updates still come through.</p>
    {/if}
  </section>

  <section class="browser">
    <div class="row tabs">
      <button class="chip" class:on={tab === 'units'} onclick={() => { tab = 'units'; limit = 60; }}>{game.kinds.join(' & ')}</button>
      <button class="chip" class:on={tab === 'upgrades'} onclick={() => { tab = 'upgrades'; limit = 60; }}>Upgrades</button>
      {#if hb}
        <label class="small"><input type="checkbox" bind:checked={changedOnly} /> Changed only</label>
        <button class="small" onclick={newCard}>+ New card</button>
      {/if}
    </div>
    <div class="row">
      <input class="grow" type="search" bind:value={q} placeholder="Search names and rules text" oninput={() => (limit = 60)} />
      {#if tab === 'units'}
        <select bind:value={faction}><option value="">All factions</option>{#each game.factions as f (f.id)}<option value={f.id}>{f.name}</option>{/each}</select>
      {:else}
        <select bind:value={slot}><option value="">All slots</option>{#each slots as s (s)}<option value={s}>{s}</option>{/each}</select>
      {/if}
    </div>
    {#if loadError}
      <p class="error">Couldn't load the card data: {loadError}</p>
    {:else if !cat}
      <p class="muted">Loading cards…</p>
    {:else}
      <p class="muted small">{cards.length} cards</p>
      <ul class="cards">
        {#each cards.slice(0, limit) as c (c.id)}
          <li>
            <button class="card" onclick={() => (viewing = { kind: tab, card: c })}>
              <span class="row">
                <strong class="grow">{c.name}</strong>
                {#if c.custom}<span class="tag custom">Homebrew</span>{:else if hb && c.id in hb[tab]}<span class="tag custom">Changed</span>{/if}
                <span class="muted num small">{typeof c.cost === 'number' ? c.cost : 'varies'}</span>
              </span>
              <span class="muted small">{'subtitle' in c ? (c.subtitle ?? '') : (c as G).type}</span>
              {#if c.text[0]}<span class="small preview">{c.text[0]}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if cards.length > limit}<button onclick={() => (limit += 60)}>Show more ({cards.length - limit})</button>{/if}
    {/if}
  </section>
</main>

{#if viewing && cat}
  <CardDetail {game} {cat} kind={viewing.kind} card={viewing.card} onChanged={reloadHomebrew} onClose={() => (viewing = null)} />
{/if}

{#if creating}
  <CardEditor card={creating} isNew factions={game.factions} onSave={saveNew} onClose={() => (creating = null)} />
{/if}

<dialog bind:this={newDialog}>
  <form class="dialog-body" method="dialog" onsubmit={(e) => { e.preventDefault(); createHomebrew(); }}>
    <h2>New homebrew</h2>
    <p class="muted small">Starts as a copy of a built-in ruleset. Change points, card text or the points limit, add cards and write down house rules.</p>
    <label class="field"><span>Name</span><input type="text" bind:value={newName} placeholder="e.g. Kitchen table rules" /></label>
    <label class="field">
      <span>Based on</span>
      <select bind:value={newParent}>{#each game.rulesets as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
    </label>
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => newDialog?.close()}>Cancel</button>
      <button type="submit" class="primary">Create</button>
    </div>
  </form>
</dialog>

<dialog bind:this={importDialog}>
  <div class="dialog-body">
    <h2>Import homebrew</h2>
    <p class="muted small">Open a homebrew file someone sent you, or paste its text.</p>
    <input type="file" accept=".json,application/json" onchange={importFile} />
    <textarea rows="6" bind:value={importText} placeholder="Or paste here"></textarea>
    {#if importError}<p class="error small">{importError}</p>{/if}
    <div class="buttons">
      <button class="ghost" onclick={() => importDialog?.close()}>Cancel</button>
      <button class="primary" disabled={!importText.trim()} onclick={() => doImport(importText)}>Import</button>
    </div>
  </div>
</dialog>

{#if toast}<div class="toast">{toast}</div>{/if}

<style>
  h1 {
    margin: 0;
    font-size: 1.15rem;
  }
  .pickers {
    margin: 14px 0;
    align-items: flex-end;
  }
  .about {
    padding: 14px 16px;
    display: grid;
    gap: 8px;
  }
  .about h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .about h3 {
    margin: 8px 0 0;
    font-size: 0.95rem;
  }
  .about p,
  .about ul {
    margin: 0;
  }
  .about ul {
    padding-left: 18px;
  }
  .limit {
    width: 110px;
  }
  .browser {
    margin-top: 20px;
    display: grid;
    gap: 10px;
  }
  .browser p {
    margin: 0;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .card {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 2px;
    background: var(--panel);
    padding: 10px 12px;
  }
  .preview {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--muted);
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
