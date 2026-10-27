<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // The match tracker for one list on your own phone: round and phase, both scores, and each unit's
  // damage, tokens and activation. Saved as you tap, so a locked phone or closed tab picks up where you were.
  import { onMount } from 'svelte';
  import { loadCatalog, rich } from '../data';
  import { getList, getMatch, putMatch } from '../db';
  import { unitCost, upgradesOf } from '../list';
  import { halfDamaged, newMatch, nextPhase, nextRound, unitState } from '../match';
  import { resolveRuleset } from '../ruleset';
  import type { Catalog, GameDef, Homebrew, List, Match, Unit, Upgrade } from '../types';

  let { game, homebrews, id }: { game: GameDef<U, G>; homebrews: Homebrew[]; id: string } = $props();

  let list = $state<List | null>(null);
  let cat = $state.raw<Catalog<U, G> | null>(null);
  let match = $state<Match | null>(null);
  let missing = $state(false);
  let error = $state('');
  let open = $state<Record<string, boolean>>({});
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let wake: { release(): Promise<void> } | null = null;

  const t = $derived(game.tracker);

  onMount(() => {
    (async () => {
      const l = await getList(id);
      if (!l) return void (missing = true);
      list = l;
      try {
        cat = await loadCatalog<U, G>(resolveRuleset(game, l.ruleset, homebrews));
      } catch (e) {
        error = String((e as Error).message ?? e);
        return;
      }
      const m = (await getMatch(id)) ?? newMatch(game, l, cat);
      // Units added to the list since the match started join it fresh.
      for (const lu of l.units) {
        const u = cat.units.get(lu.id);
        if (u && !m.units[lu.uid]) m.units[lu.uid] = unitState(game, u, upgradesOf(lu, cat));
      }
      match = m;
    })();
    void keepAwake();
    // The screen lock is dropped when the tab is hidden; take it again on return.
    const onVis = () => document.visibilityState === 'visible' && keepAwake();
    document.addEventListener('visibilitychange', onVis);
    const flush = () => saveNow();
    addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pagehide', flush);
      saveNow();
      void wake?.release().catch(() => {});
    };
  });

  /** Keeps the screen on during a match (where the browser supports it). */
  async function keepAwake() {
    try {
      wake = await (navigator as any).wakeLock?.request('screen');
    } catch {
      wake = null;
    }
  }

  function changed() {
    if (!match) return;
    match.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (match) void putMatch(match);
  }

  function restart() {
    if (!list || !cat || !confirm('Start a new match? This one is cleared.')) return;
    match = newMatch(game, list, cat);
    open = {};
    changed();
  }

  const rows = $derived.by(() => {
    if (!list || !cat || !match) return [];
    const c = cat;
    const order = (k: string) => game.kinds.indexOf(k) + 1 || 99;
    return list.units
      .map((lu) => ({ lu, unit: c.units.get(lu.id), ups: upgradesOf(lu, c) }))
      .filter((r): r is { lu: typeof r.lu; unit: U; ups: G[] } => !!r.unit && !!match!.units[r.lu.uid])
      .sort((a, b) => Number(match!.units[a.lu.uid].destroyed) - Number(match!.units[b.lu.uid].destroyed) || order(a.unit.kind) - order(b.unit.kind));
  });
  const lost = $derived(rows.filter((r) => match!.units[r.lu.uid].destroyed).reduce((n, r) => n + unitCost(game, r.lu, cat!), 0));
  const total = $derived(rows.reduce((n, r) => n + unitCost(game, r.lu, cat!), 0));

  function bump(rec: Record<string, number>, key: string, by: number, min = 0, max = Infinity) {
    rec[key] = Math.min(max, Math.max(min, (rec[key] ?? 0) + by));
    changed();
  }
</script>

{#if missing}
  <main class="page"><p>That {game.noun} isn't on this device. <a href="#/">Back</a></p></main>
{:else if error}
  <main class="page"><p class="error">Couldn't load the card data: {error}</p></main>
{:else if list && cat && match}
  <div class="topbar">
    <div class="topbar-inner">
      <a class="button ghost" href="#/list/{list.id}" aria-label="Back to the {game.noun}">←</a>
      <div class="grow">
        <strong>{list.name}</strong>
        <div class="muted small">Destroyed {lost}/{total} pts</div>
      </div>
      <button class="ghost small" onclick={restart}>New match</button>
    </div>
    <div class="topbar-inner turn">
      <div class="round">
        <button class="ghost step" aria-label="Previous round" onclick={() => { if (match!.round > 1) { match!.round--; changed(); } }}>−</button>
        <span><span class="muted small">{t.round.label}</span> <strong class="num">{match.round}{t.round.max ? `/${t.round.max}` : ''}</strong></span>
        <button class="ghost step" aria-label="Next round" onclick={() => { nextRound(match!); changed(); }}>+</button>
      </div>
      <button class="phase grow" onclick={() => { nextPhase(game, match!); changed(); }}>
        <span class="muted small">Phase</span> <strong>{t.phases[match.phase]}</strong> <span class="muted">→</span>
      </button>
    </div>
    <div class="topbar-inner scores">
      {#each [['myScore', 'You'], ['theirScore', 'Opponent']] as const as [key, label] (key)}
        <div class="score">
          <span class="muted small">{label}</span>
          <button class="ghost step" aria-label="{label} score down" onclick={() => { match![key] = Math.max(0, match![key] - 1); changed(); }}>−</button>
          <strong class="num">{match[key]}</strong>
          <button class="ghost step" aria-label="{label} score up" onclick={() => { match![key]++; changed(); }}>+</button>
        </div>
      {/each}
    </div>
  </div>

  <main class="page">
    {#if t.note}<p class="muted small note">{t.note}</p>{/if}
    {#if match.round > (t.round.max ?? Infinity)}<p class="warning">The game ended after round {t.round.max}.</p>{/if}

    <ul class="units">
      {#each rows as { lu, unit, ups } (lu.uid)}
        {@const s = match.units[lu.uid]}
        {@const counters = t.counters(unit, ups)}
        {@const toggles = t.toggles?.(unit) ?? []}
        {@const dials = t.dials?.(unit)}
        <li class="unit panel" class:dead={s.destroyed} class:done={s.activated && !s.destroyed}>
          <div class="head">
            <button class="name" onclick={() => (open[lu.uid] = !open[lu.uid])}>
              <strong>{unit.name}</strong>
              <span class="muted small">{[unit.subtitle, game.statLine(unit)].filter(Boolean).join(' · ')} · {unitCost(game, lu, cat)} pts{halfDamaged(game, unit, ups, s) && !s.destroyed ? ' · half damaged' : ''}</span>
            </button>
            {#if !s.destroyed}
              <button class="chip" class:on={s.activated} onclick={() => { s.activated = !s.activated; changed(); }}>{s.activated ? 'Activated' : 'Ready'}</button>
            {/if}
          </div>

          {#if !s.destroyed}
            <div class="counters">
              {#each counters as c (c.id)}
                <div class="counter" style:--c={c.color ?? 'var(--text)'}>
                  <span class="label">{c.label}</span>
                  <button class="step" aria-label="{c.label} down" onclick={() => bump(s.counters, c.id, -1, 0, c.max)}>−</button>
                  <span class="value num"><b>{s.counters[c.id] ?? c.max}</b>/{c.max}</span>
                  <button class="step" aria-label="{c.label} up" onclick={() => bump(s.counters, c.id, 1, 0, c.max)}>+</button>
                </div>
              {/each}
            </div>

            {#if toggles.length}
              <div class="row">
                {#each toggles as x (x.id)}
                  {@const state = s.toggles[x.id] ?? 0}
                  <button class="chip toggle s{state}" onclick={() => { s.toggles[x.id] = (state + 1) % x.states.length; changed(); }}>{x.label}: {x.states[state]}</button>
                {/each}
              </div>
            {/if}

            {#if dials}
              <div class="dials">
                <span class="muted small">Dials ({s.dials.length}/{dials.size}):</span>
                {#each s.dials as d, i (i)}
                  <button class="chip on" title="Reveal (remove)" onclick={() => { s.dials.splice(i, 1); changed(); }}>{i === 0 ? '▶ ' : ''}{d}</button>
                {/each}
                {#if s.dials.length < dials.size}
                  {#each dials.options as o (o)}<button class="chip" onclick={() => { s.dials.push(o); changed(); }}>+ {o}</button>{/each}
                {/if}
              </div>
            {/if}

            <div class="tokens">
              <span class="muted small">Tokens:</span>
              {#each t.tokens as tok (tok)}
                {@const n = s.tokens[tok] ?? 0}
                <span class="token" class:has={n > 0}>
                  <button class="chip" onclick={() => bump(s.tokens, tok, 1)}>{tok}{n ? ` ×${n}` : ''}</button>
                  {#if n}<button class="ghost tiny" aria-label="Remove a {tok} token" onclick={() => bump(s.tokens, tok, -1)}>−</button>{/if}
                </span>
              {/each}
            </div>
          {/if}

          {#if open[lu.uid]}
            <div class="rules small">
              {#each unit.text as p, i (i)}<p>{@html rich(p)}</p>{/each}
              {#each ups as g, i (i)}
                <p><strong>{g.name}:</strong> {@html rich(g.text.join(' '))}</p>
              {/each}
            </div>
          {:else if ups.length}
            <p class="muted small ups">{ups.map((g) => g.name).join(' · ')}</p>
          {/if}

          <div class="foot">
            <button class="ghost small" onclick={() => (open[lu.uid] = !open[lu.uid])}>{open[lu.uid] ? 'Hide rules' : 'Rules'}</button>
            <button class="ghost small" class:danger={!s.destroyed} onclick={() => { s.destroyed = !s.destroyed; changed(); }}>{s.destroyed ? 'Undo destroyed' : 'Destroyed'}</button>
          </div>
        </li>
      {/each}
    </ul>

    <label class="field notes">
      <span>Match notes</span>
      <textarea rows="3" bind:value={match.notes} oninput={changed} placeholder="Opponent, scenario, what happened…"></textarea>
    </label>
  </main>
{:else}
  <main class="page"><p class="muted">Loading…</p></main>
{/if}

<style>
  .turn,
  .scores {
    padding-top: 0;
  }
  .round,
  .score {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .scores {
    justify-content: space-between;
  }
  .step {
    min-width: 40px;
    min-height: 40px;
    font-size: 1.2rem;
    padding: 4px 10px;
  }
  .phase {
    text-align: left;
    min-height: 40px;
  }
  .score strong,
  .round strong {
    font-size: 1.25rem;
    min-width: 2ch;
    text-align: center;
  }
  .note {
    margin: 12px 0 0;
  }
  .units {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .unit {
    padding: 10px 12px;
    display: grid;
    gap: 10px;
  }
  .unit.done {
    opacity: 0.7;
  }
  .unit.dead {
    opacity: 0.45;
  }
  .unit.dead .name strong {
    text-decoration: line-through;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .name {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    display: grid;
    gap: 2px;
  }
  .counters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .counter {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    background: var(--panel-2);
    border-radius: 8px;
    border-top: 3px solid var(--c);
    padding: 4px;
  }
  .counter .label {
    grid-column: 1 / -1;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .value {
    text-align: center;
  }
  .value b {
    font-size: 1.35rem;
    color: var(--c);
  }
  .toggle.s1 {
    color: var(--warning);
    border-color: var(--warning);
  }
  .toggle.s2 {
    color: var(--muted);
    text-decoration: line-through;
  }
  .dials,
  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .token {
    display: inline-flex;
    align-items: center;
  }
  .token.has .chip {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tiny {
    padding: 2px 8px;
  }
  .rules p,
  .ups {
    margin: 0 0 4px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
  }
  .notes {
    margin-top: 20px;
  }
</style>
