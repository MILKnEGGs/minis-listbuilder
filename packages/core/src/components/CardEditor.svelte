<script lang="ts">
  // Edits a card for a homebrew ruleset: points, limits, slots and rules text. Also used to make a new card.
  // Only what you change is saved, so later data updates to the card still come through.
  import { onMount } from 'svelte';
  import type { Stat, Unit, Upgrade } from '../types';

  let {
    card,
    isNew = false,
    factions,
    onSave,
    onRevert,
    onBan,
    onClose,
  }: {
    card: Unit | Upgrade;
    isNew?: boolean;
    factions: { id: string; name: string }[];
    onSave: (edited: Unit | Upgrade) => void;
    /** Drop this homebrew's changes to the card (shown only when it has some). */
    onRevert?: () => void;
    /** Take the card out of the homebrew ruleset, or delete a card you made. */
    onBan?: () => void;
    onClose: () => void;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  onMount(() => dialog?.showModal());

  // svelte-ignore state_referenced_locally
  const isUnit = 'stats' in card;
  // svelte-ignore state_referenced_locally
  const c = card;
  let name = $state(c.name);
  let subtitle = $state('subtitle' in c ? (c.subtitle ?? '') : '');
  let faction = $state('faction' in c ? c.faction : '');
  let type = $state('type' in c ? c.type : '');
  let cost = $state(typeof c.cost === 'number' ? String(c.cost) : '');
  const variable = typeof c.cost === 'object' ? c.cost : null;
  let loadout = $state('loadout' in c && c.loadout != null ? String(c.loadout) : '');
  let limited = $state(String(c.limited));
  let slots = $state(c.slots.join(', '));
  let keywords = $state('keywords' in c ? (c.keywords ?? []).join(', ') : '');
  let stats = $state(isUnit ? (c as Unit).stats.map((s) => `${s.label} = ${s.value}`).join('\n') : '');
  let text = $state(c.text.join('\n\n'));
  let upgradeFactions = $state(!isUnit && (c as Upgrade).factions ? (c as Upgrade).factions!.join(', ') : '');

  const list = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  const num = (s: string, fallback: number) => (s.trim() === '' || isNaN(Number(s)) ? fallback : Number(s));

  function save() {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (isUnit) {
      const u = c as Unit;
      // Keep each stat's color when only its number changed.
      const parsed: Stat[] = stats
        .split('\n')
        .map((line) => /^\s*(.+?)\s*=\s*(.+?)\s*$/.exec(line))
        .filter((m): m is RegExpExecArray => !!m)
        .map(([, label, v]) => {
          const old = u.stats.find((s) => s.label === label);
          const value = isNaN(Number(v)) ? v : Number(v);
          return old?.color ? { label, value, color: old.color } : { label, value };
        });
      const edited: Unit = { ...u, name: name.trim() || u.name, faction, cost: num(cost, u.cost), limited: num(limited, u.limited), slots: list(slots), keywords: list(keywords), stats: parsed, text: paragraphs };
      if (subtitle.trim()) edited.subtitle = subtitle.trim();
      else delete edited.subtitle;
      if (loadout.trim() !== '') edited.loadout = num(loadout, 0);
      else delete edited.loadout;
      onSave(edited);
    } else {
      const g = c as Upgrade;
      const s = list(slots);
      const edited: Upgrade = { ...g, name: name.trim() || g.name, type: type.trim() || g.type, slots: s.length ? s : [type.trim() || g.type], cost: variable && cost.trim() === '' ? variable : num(cost, 0), limited: num(limited, g.limited), text: paragraphs };
      const f = list(upgradeFactions);
      if (f.length) edited.factions = f;
      else delete edited.factions;
      onSave(edited);
    }
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} onclose={onClose}>
  <form class="dialog-body" method="dialog" onsubmit={(e) => { e.preventDefault(); save(); }}>
    <h2>{isNew ? 'New card' : `Edit ${c.name}`}</h2>
    <p class="muted small">Changes apply only to this homebrew ruleset.</p>
    <div class="two">
      <label class="field"><span>Name</span><input type="text" bind:value={name} /></label>
      {#if isUnit}
        <label class="field"><span>Subtitle</span><input type="text" bind:value={subtitle} /></label>
      {:else}
        <label class="field"><span>Slot type</span><input type="text" bind:value={type} /></label>
      {/if}
    </div>
    <div class="three">
      <label class="field"><span>Points{variable ? ' (blank keeps the varying cost)' : ''}</span><input type="text" inputmode="numeric" bind:value={cost} placeholder={variable ? `by ${variable.by}` : ''} /></label>
      {#if isUnit}<label class="field"><span>Loadout</span><input type="text" inputmode="numeric" bind:value={loadout} placeholder="none" /></label>{/if}
      <label class="field"><span>Limited (0 = no limit)</span><input type="text" inputmode="numeric" bind:value={limited} /></label>
    </div>
    {#if isUnit}
      <label class="field">
        <span>Faction</span>
        <select bind:value={faction}>{#each factions as f (f.id)}<option value={f.id}>{f.name}</option>{/each}</select>
      </label>
    {:else}
      <label class="field"><span>Factions (comma separated ids, blank = any)</span><input type="text" bind:value={upgradeFactions} /></label>
    {/if}
    <label class="field"><span>{isUnit ? 'Upgrade slots' : 'Slots it takes'} (comma separated)</span><input type="text" bind:value={slots} /></label>
    {#if isUnit}
      <label class="field"><span>Keywords (comma separated)</span><input type="text" bind:value={keywords} /></label>
      <label class="field"><span>Stats, one per line as Label = value</span><textarea rows="4" bind:value={stats}></textarea></label>
    {/if}
    <label class="field"><span>Rules text (blank line between paragraphs)</span><textarea rows="6" bind:value={text}></textarea></label>
    <div class="buttons">
      {#if onBan}<button type="button" class="ghost danger" onclick={() => { onBan(); dialog?.close(); }}>{c.custom ? 'Delete card' : 'Remove from this ruleset'}</button>{/if}
      {#if onRevert}<button type="button" class="ghost" onclick={() => { onRevert(); dialog?.close(); }}>Undo my changes</button>{/if}
      <button type="button" class="ghost" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="primary">Save</button>
    </div>
  </form>
</dialog>

<style>
  .two,
  .three {
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr 1fr;
  }
  .three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  @media (max-width: 480px) {
    .two,
    .three {
      grid-template-columns: 1fr;
    }
  }
  p {
    margin: 0;
  }
  input {
    width: 100%;
  }
</style>
