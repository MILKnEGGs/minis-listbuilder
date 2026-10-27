<script lang="ts">
  // A searchable list to choose from: units to add, or upgrades for a slot. Cards that can't be picked
  // stay visible with the reason, behind a toggle, so you can see why something is missing.
  import { onMount } from 'svelte';
  import type { PickItem } from '../types';
  import { fold } from '../util';

  let {
    title,
    items,
    filters = [],
    onPick,
    onInfo,
    onClose,
  }: {
    title: string;
    items: PickItem[];
    filters?: { id: string; label: string }[];
    onPick: (key: string) => void;
    onInfo: (key: string) => void;
    onClose: () => void;
  } = $props();

  const PAGE = 80;
  let dialog = $state<HTMLDialogElement>();
  let q = $state('');
  let term = $state('');
  let timer: ReturnType<typeof setTimeout>;
  let sel = $state<Record<string, string>>({});
  let showAll = $state(false);
  let limit = $state(PAGE);

  onMount(() => dialog?.showModal());

  const options = $derived(
    Object.fromEntries(filters.map((f) => [f.id, [...new Set(items.flatMap((i) => i.tags?.[f.id] ?? []))].sort()])),
  );
  const shown = $derived.by(() => {
    const words = fold(term).split(/\s+/).filter(Boolean);
    return items.filter(
      (i) =>
        (showAll || !i.why) &&
        words.every((w) => i.search.includes(w)) &&
        Object.entries(sel).every(([f, v]) => !v || (i.tags?.[f] ?? []).includes(v)),
    );
  });
  const hidden = $derived(items.filter((i) => i.why).length);

  function typed() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      term = q;
      limit = PAGE;
    }, 150);
  }
</script>

<dialog bind:this={dialog} onclose={onClose} class="picker">
  <div class="dialog-body">
    <div class="row">
      <h2 class="grow">{title}</h2>
      <button class="ghost" onclick={() => dialog?.close()}>Done</button>
    </div>
    <div class="search">
      <!-- svelte-ignore a11y_autofocus -->
      <input type="search" bind:value={q} oninput={typed} placeholder="Search names and rules text" autofocus />
      {#if q}<button class="ghost clear" aria-label="Clear search" onclick={() => { q = ''; term = ''; }}>×</button>{/if}
    </div>
    {#if filters.length}
      <div class="row">
        {#each filters as f (f.id)}
          {#if options[f.id].length > 1}
            <select bind:value={sel[f.id]} aria-label={f.label}>
              <option value="">All {f.label.toLowerCase()}</option>
              {#each options[f.id] as o (o)}<option value={o}>{o}</option>{/each}
            </select>
          {/if}
        {/each}
      </div>
    {/if}
    {#if hidden}
      <label class="small muted"><input type="checkbox" bind:checked={showAll} /> Show {hidden} that can't be picked</label>
    {/if}
    <ul>
      {#each shown.slice(0, limit) as i (i.key)}
        <li class:no={!!i.why}>
          <button class="pick" disabled={!!i.why} onclick={() => onPick(i.key)}>
            <span class="name">{i.name}</span>
            <span class="cost num">{i.cost}</span>
            {#if i.sub}<span class="muted small sub">{i.sub}</span>{/if}
            {#if i.why}<span class="error small sub">{i.why}</span>{/if}
          </button>
          <button class="ghost info" aria-label="Card details for {i.name}" onclick={() => onInfo(i.key)}>ⓘ</button>
        </li>
      {/each}
    </ul>
    {#if shown.length > limit}<button onclick={() => (limit += PAGE)}>Show more ({shown.length - limit})</button>{/if}
    {#if !shown.length}<p class="muted">Nothing matches.</p>{/if}
  </div>
</dialog>

<style>
  .picker {
    max-width: min(640px, calc(100vw - 24px));
    height: calc(100dvh - 24px);
  }
  .search {
    position: relative;
  }
  .search input {
    width: 100%;
    padding-right: 36px;
  }
  .clear {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 4px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .pick {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    text-align: left;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    padding: 9px 12px;
  }
  .pick:disabled {
    opacity: 0.75;
  }
  .name {
    font-weight: 600;
  }
  .cost {
    color: var(--accent);
    font-weight: 600;
  }
  .sub {
    grid-column: 1 / -1;
  }
  .info {
    font-size: 1.1rem;
  }
  h2 {
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
