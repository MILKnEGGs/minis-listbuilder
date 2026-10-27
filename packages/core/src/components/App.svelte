<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // The whole app: your lists (#/), one list (#/list/<id>), its match tracker (#/match/<id>), and the
  // rules and homebrew view (#/rules). Homebrew rulesets are loaded once and shared by every screen.
  import { onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { listHomebrew, requestPersistence, useDatabase } from '../db';
  import type { GameDef, Homebrew, Unit, Upgrade } from '../types';
  import Editor from './Editor.svelte';
  import Home from './Home.svelte';
  import MatchView from './MatchView.svelte';
  import Rules from './Rules.svelte';

  let { game }: { game: GameDef<U, G> } = $props();

  // svelte-ignore state_referenced_locally
  useDatabase(game.id);

  let homebrews = $state<Homebrew[]>([]);
  let ready = $state(false);
  let hash = $state(location.hash);
  const route = $derived.by(() => {
    const m = /^#\/(list|match|rules)(?:\/(.+))?$/.exec(hash);
    return m ? { page: m[1], id: m[2] ? decodeURIComponent(m[2]) : '' } : { page: 'home', id: '' };
  });

  const { needRefresh, updateServiceWorker } = useRegisterSW();

  async function reloadHomebrew() {
    homebrews = (await listHomebrew()).sort((a, b) => a.name.localeCompare(b.name));
  }

  onMount(() => {
    requestPersistence();
    reloadHomebrew().then(() => (ready = true));
    const onHash = () => {
      hash = location.hash;
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });
</script>

{#if $needRefresh}
  <div class="update">
    <span>A new version is ready (it may have new points).</span>
    <button class="primary" onclick={() => updateServiceWorker(true)}>Update</button>
    <button class="ghost" onclick={() => needRefresh.set(false)}>Later</button>
  </div>
{/if}

{#if !ready}
  <main class="center"><p class="muted">Loading…</p></main>
{:else if route.page === 'list'}
  {#key route.id}
    <Editor {game} {homebrews} id={route.id} {reloadHomebrew} />
  {/key}
{:else if route.page === 'match'}
  {#key route.id}
    <MatchView {game} {homebrews} id={route.id} />
  {/key}
{:else if route.page === 'rules'}
  <Rules {game} {homebrews} {reloadHomebrew} start={route.id} />
{:else}
  <Home {game} {homebrews} {reloadHomebrew} />
{/if}

<style>
  .center {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    text-align: center;
    padding: 16px;
  }
  .update {
    position: fixed;
    z-index: 50;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 8px 8px 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    width: max-content;
    max-width: calc(100vw - 24px);
  }
  :global(.sym) {
    font-weight: 600;
    color: var(--accent);
  }
</style>
