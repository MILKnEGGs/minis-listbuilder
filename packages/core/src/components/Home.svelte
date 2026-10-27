<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // Your lists, with their points, plus new list, import, and the way to the rules and homebrew.
  import { onMount } from 'svelte';
  import { loadCatalog } from '../data';
  import { deleteList, listLists, putList } from '../db';
  import { importListJson, listCost, newList, summarize, validate } from '../list';
  import { allRulesets, resolveRuleset } from '../ruleset';
  import type { Catalog, GameDef, Homebrew, List, Unit, Upgrade } from '../types';
  import { uid } from '../util';

  let { game, homebrews, reloadHomebrew: _ }: { game: GameDef<U, G>; homebrews: Homebrew[]; reloadHomebrew: () => Promise<void> } = $props();

  let lists = $state<List[]>([]);
  let loaded = $state(false);
  let catalogs = $state.raw<Record<string, Catalog<U, G>>>({});

  const rulesets = $derived(allRulesets(game, homebrews));
  const sorted = $derived([...lists].sort((a, b) => b.updated - a.updated));
  const noun = $derived(game.noun);

  let newDialog = $state<HTMLDialogElement>();
  let newName = $state('');
  // svelte-ignore state_referenced_locally
  let newRuleset = $state((game.rulesets.find((r) => r.recommended) ?? game.rulesets[0]).id);
  let newMode = $state('');
  // svelte-ignore state_referenced_locally
  let newFaction = $state(game.factions[0].id);
  const chosen = $derived(resolveRuleset(game, newRuleset, homebrews));
  $effect(() => {
    if (!chosen.modes?.some((m) => m.id === newMode)) newMode = chosen.modes?.[0]?.id ?? '';
  });

  let importDialog = $state<HTMLDialogElement>();
  let importText = $state('');
  let importError = $state('');
  let imported = $state<(Partial<List> & { skipped?: string[] }) | null>(null);

  onMount(async () => {
    lists = await listLists();
    loaded = true;
    // Points need each ruleset's data; load the ones in use, a file at a time.
    for (const id of new Set(lists.map((l) => l.ruleset))) {
      const r = resolveRuleset(game, id, homebrews);
      loadCatalog<U, G>(r)
        .then((c) => (catalogs = { ...catalogs, [id]: c }))
        .catch(() => {});
    }
  });

  const open = (l: List) => (location.hash = `#/list/${l.id}`);
  const factionName = (id: string) => game.factions.find((f) => f.id === id)?.name ?? id;

  async function create() {
    const l = newList(chosen, newFaction, newName.trim() || `New ${factionName(newFaction)} ${noun}`);
    if (newMode) l.mode = newMode;
    await putList(l);
    newDialog?.close();
    open(l);
  }

  function readImport() {
    importError = '';
    imported = null;
    if (!importText.trim()) return;
    try {
      imported = importListJson(game, importText.trim()) ?? game.importList?.(importText.trim(), game.rulesets) ?? null;
      if (!imported) importError = "That doesn't look like a list this app can read.";
    } catch (e) {
      importError = (e as Error).message;
    }
  }

  async function saveImport() {
    if (!imported) return;
    const r = resolveRuleset(game, imported.ruleset && rulesets.some((x) => x.id === imported!.ruleset) ? imported.ruleset : game.rulesets[0].id, homebrews);
    const l: List = {
      ...newList(r, imported.faction ?? game.factions[0].id, imported.name ?? `Imported ${noun}`),
      ...(imported.mode ? { mode: imported.mode } : {}),
      units: (imported.units ?? []).map((u) => ({ uid: uid(), id: u.id, upgrades: [...(u.upgrades ?? [])] })),
      ...(imported.picks ? { picks: imported.picks } : {}),
      ...(imported.description ? { description: imported.description } : {}),
    };
    await putList(l);
    importDialog?.close();
    open(l);
  }

  async function duplicate(l: List) {
    const copy: List = { ...JSON.parse(JSON.stringify(l)), id: uid(), name: `${l.name} (copy)`, created: Date.now(), updated: Date.now() };
    await putList(copy);
    lists = [...lists, copy];
  }

  async function remove(l: List) {
    if (!confirm(`Delete "${l.name}"? This can't be undone.`)) return;
    await deleteList(l.id);
    lists = lists.filter((x) => x.id !== l.id);
  }
</script>

<header class="page">
  <div class="grow">
    <p class="back small"><a href="../">← All games</a></p>
    <h1>{game.title}</h1>
    <p class="muted small">{game.game} · {lists.length ? `${lists.length} ${noun}${lists.length === 1 ? '' : 's'}` : `no ${noun}s yet`}</p>
  </div>
  <div class="row">
    <a class="button" href="#/rules">Rules & homebrew</a>
    <button onclick={() => { importText = ''; imported = null; importError = ''; importDialog?.showModal(); }}>Import</button>
    <button class="primary" onclick={() => { newName = ''; newDialog?.showModal(); }}>New {noun}</button>
  </div>
</header>

<main class="page">
  {#if loaded && !lists.length}
    <div class="empty">
      <p>No {noun}s yet.</p>
      <button class="primary" onclick={() => newDialog?.showModal()}>Build your first {noun}</button>
    </div>
  {/if}

  <ul class="lists">
    {#each sorted as l (l.id)}
      {@const r = resolveRuleset(game, l.ruleset, homebrews)}
      {@const cat = catalogs[l.ruleset]}
      {@const pts = cat ? listCost(game, l, cat) : null}
      <li class="panel">
        <button class="list" onclick={() => open(l)}>
          <span class="name">{l.name}</span>
          <span class="muted small">{factionName(l.faction)} · {r.name}{l.mode && r.modes ? ` · ${r.modes.find((m) => m.id === l.mode)?.name ?? l.mode}` : ''}</span>
          <span class="stats small">
            <span class="num" class:over={pts != null && pts > r.limit}>{pts ?? '…'}/{r.limit} points</span>
            <span class="num">{l.units.length} {game.kinds[0].toLowerCase()}</span>
            {#if cat}<span>{summarize(validate(game, l, cat))}</span>{/if}
          </span>
        </button>
        <div class="row-actions">
          <a class="button ghost small" href="#/match/{l.id}">Play</a>
          <button class="ghost small" onclick={() => duplicate(l)}>Duplicate</button>
          <button class="ghost small danger" onclick={() => remove(l)}>Delete</button>
        </div>
      </li>
    {/each}
  </ul>

  <footer class="muted small">
    Data:
    {#each game.credits as c, i (c.url)}{i ? ' · ' : ''}<a href={c.url} target="_blank" rel="noopener">{c.label}</a>{/each}.
    Lists, homebrew and matches stay on this device.
  </footer>
</main>

<dialog bind:this={newDialog}>
  <form class="dialog-body" method="dialog" onsubmit={(e) => { e.preventDefault(); create(); }}>
    <h2>New {noun}</h2>
    <label class="field">
      <span>Name</span>
      <input type="text" bind:value={newName} placeholder="{noun[0].toUpperCase() + noun.slice(1)} name" />
    </label>
    <label class="field">
      <span>Faction</span>
      <select bind:value={newFaction}>
        {#each game.factions as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
      </select>
    </label>
    <fieldset>
      <legend>Ruleset</legend>
      {#each rulesets as r (r.id)}
        <label class="choice" class:on={newRuleset === r.id}>
          <input type="radio" name="ruleset" value={r.id} bind:group={newRuleset} />
          <span><strong>{r.name}</strong>{#if r.recommended}{' '}<em>(Recommended)</em>{/if}{#if r.homebrew}{' '}<span class="tag custom">Homebrew</span>{/if}<br /><span class="muted small">{r.summary}</span></span>
        </label>
      {/each}
    </fieldset>
    {#if chosen.modes}
      <label class="field">
        <span>Mode</span>
        <select bind:value={newMode}>
          {#each chosen.modes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => newDialog?.close()}>Cancel</button>
      <button type="submit" class="primary">Create</button>
    </div>
  </form>
</dialog>

<dialog bind:this={importDialog}>
  <form class="dialog-body" method="dialog" onsubmit={(e) => { e.preventDefault(); saveImport(); }}>
    <h2>Import a {noun}</h2>
    <p class="muted small">{game.importHint}</p>
    <textarea rows="8" bind:value={importText} oninput={readImport} placeholder="Paste here"></textarea>
    {#if importError}<p class="error small">{importError}</p>{/if}
    {#if imported}
      <p class="small">Found {imported.units?.length ?? 0} {game.kinds[0].toLowerCase()}{imported.name ? ` in "${imported.name}"` : ''}.</p>
      {#if imported.skipped?.length}
        <p class="error small">Not recognised: {imported.skipped.slice(0, 8).join(', ')}{imported.skipped.length > 8 ? '…' : ''}</p>
      {/if}
    {/if}
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => importDialog?.close()}>Cancel</button>
      <button type="submit" class="primary" disabled={!imported}>Import</button>
    </div>
  </form>
</dialog>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: 16px;
    padding-bottom: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  .back {
    margin: 0 0 4px;
  }
  .back a {
    color: var(--muted);
    text-decoration: none;
  }
  h1 + p {
    margin: 2px 0 0;
  }
  :global(a.button) {
    display: inline-block;
    border: 1px solid var(--line);
    background: var(--panel-2);
    border-radius: 8px;
    padding: 7px 12px;
    line-height: 1.2;
    color: inherit;
    text-decoration: none;
  }
  :global(a.button.ghost) {
    background: transparent;
    border-color: transparent;
  }
  :global(a.button:hover) {
    border-color: var(--muted);
  }
  .empty {
    text-align: center;
    padding: 60px 0;
  }
  .lists {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .lists li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 8px;
  }
  .list {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: 0;
    padding: 14px 16px;
    display: grid;
    gap: 3px;
  }
  .name {
    font-weight: 600;
    font-size: 1.05rem;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 4px;
  }
  .over {
    color: var(--error);
  }
  .row-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: stretch;
    text-align: center;
  }
  footer {
    margin-top: 28px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  legend {
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .choice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .choice.on {
    border-color: var(--accent);
  }
  .choice input {
    margin-top: 3px;
    accent-color: var(--accent);
  }
  form p {
    margin: 0;
  }
  @media (max-width: 560px) {
    .lists li {
      flex-direction: column;
      align-items: stretch;
      padding: 0 0 8px;
    }
    .row-actions {
      flex-direction: row;
      padding: 0 8px;
    }
  }
</style>
