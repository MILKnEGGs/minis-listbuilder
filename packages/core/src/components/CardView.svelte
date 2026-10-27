<script lang="ts">
  // One card up close: stats, slots and rules text, with the picture when there is one.
  // Buttons for the action that opened it (add, remove) and for editing it in a homebrew come from the caller.
  import { onMount, type Snippet } from 'svelte';
  import { rich } from '../data';
  import type { Unit, Upgrade } from '../types';

  let {
    card,
    cost,
    details = [],
    statLine = '',
    modeNames = {},
    actions,
    onClose,
  }: {
    card: Unit | Upgrade;
    /** The points to show, e.g. "5 · loadout 18" or an upgrade's cost on the ship it's for. */
    cost: string;
    details?: [string, string][];
    statLine?: string;
    /** Mode id → name, to say where a card is legal. */
    modeNames?: Record<string, string>;
    actions?: Snippet;
    onClose: () => void;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let showImage = $state(false);
  const isUnit = $derived('stats' in card);
  onMount(() => dialog?.showModal());
</script>

<dialog bind:this={dialog} onclose={onClose}>
  <div class="dialog-body">
    <div class="head">
      <div class="grow">
        <h2>{card.name}{#if card.custom}{' '}<span class="tag custom">Homebrew</span>{/if}</h2>
        {#if 'subtitle' in card && card.subtitle}<p class="muted small">{card.subtitle}</p>{/if}
        {#if !isUnit}<p class="muted small">{(card as Upgrade).slots.join(' + ') || (card as Upgrade).type}</p>{/if}
      </div>
      <div class="cost num">{cost}</div>
    </div>

    {#if isUnit}
      {@const u = card as Unit}
      <div class="stats">
        {#each u.stats as s (s.label)}
          <span class="stat" style:--c={s.color ?? 'var(--text)'}><b class="num">{s.value}</b><span>{s.label}</span></span>
        {/each}
      </div>
      {#if statLine}<p class="muted small">{statLine}</p>{/if}
      {#if u.slots.length}<p class="small"><span class="muted">Slots:</span> {u.slots.join(', ')}</p>{/if}
    {/if}
    {#if 'keywords' in card && card.keywords?.length}
      <div class="row">{#each card.keywords as k (k)}<span class="tag">{k}</span>{/each}</div>
    {/if}

    <div class="rules">
      {#each card.text as p, i (i)}<p>{@html rich(p)}</p>{/each}
      {#if !card.text.length}<p class="muted">No rules text.</p>{/if}
    </div>

    {#if details.length || card.limited || card.modes || ('factions' in card && card.factions)}
      <dl>
        {#if card.limited}<dt>Limited</dt><dd>{card.limited === 1 ? 'Unique (1 per list)' : `${card.limited} per list`}</dd>{/if}
        {#if card.modes}<dt>Legal in</dt><dd>{card.modes.map((m) => modeNames[m] ?? m).join(', ') || 'No mode'}</dd>{/if}
        {#each details as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
      </dl>
    {/if}

    {#if card.image}
      {#if showImage}
        <img src={card.image} alt={card.name} loading="lazy" />
      {:else}
        <button class="ghost small" onclick={() => (showImage = true)}>Show card picture</button>
      {/if}
    {/if}

    <div class="buttons">
      {@render actions?.()}
      <button class="ghost" onclick={() => dialog?.close()}>Close</button>
    </div>
  </div>
</dialog>

<style>
  .head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .head p {
    margin: 2px 0 0;
  }
  .cost {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stat {
    display: grid;
    justify-items: center;
    min-width: 54px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--panel-2);
    border-top: 3px solid var(--c);
  }
  .stat b {
    font-size: 1.2rem;
    color: var(--c);
  }
  .stat span {
    font-size: 0.7rem;
    color: var(--muted);
    text-align: center;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  img {
    width: 100%;
    max-width: 420px;
    justify-self: center;
    border-radius: 10px;
  }
  p {
    margin: 0;
  }
</style>
