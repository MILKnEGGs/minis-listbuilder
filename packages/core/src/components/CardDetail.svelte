<script lang="ts" generics="U extends Unit, G extends Upgrade">
  // A card's details, with "Edit" when the ruleset is a homebrew. Edits are saved as differences from
  // the card as the data has it, and the caller reloads its catalog afterwards.
  import type { Snippet } from 'svelte';
  import { loadData } from '../data';
  import { putHomebrew } from '../db';
  import { banCard, revertCard, saveCardEdit } from '../ruleset';
  import type { Catalog, GameDef, Unit, Upgrade } from '../types';
  import CardEditor from './CardEditor.svelte';
  import CardView from './CardView.svelte';

  let {
    game,
    cat,
    kind,
    card,
    /** For an upgrade: the unit it's on or being picked for, so a varying cost can be shown. */
    on,
    actions: outer,
    onChanged,
    onClose,
  }: {
    game: GameDef<U, G>;
    cat: Catalog<U, G>;
    kind: 'units' | 'upgrades';
    card: U | G;
    on?: U;
    actions?: Snippet;
    onChanged: () => Promise<void>;
    onClose: () => void;
  } = $props();

  let editing = $state(false);
  const hb = $derived(cat.ruleset.homebrew);
  const modeNames = $derived(Object.fromEntries((cat.ruleset.modes ?? []).map((m) => [m.id, m.name])));

  function costText(): string {
    if (kind === 'units') {
      const u = card as U;
      return `${u.cost} pts${u.loadout != null && cat.ruleset.loadout ? ` · loadout ${u.loadout}` : ''}`;
    }
    const g = card as G;
    if (on) return `${game.upgradeCost(g, on)} pts`;
    if (typeof g.cost === 'number') return `${g.cost} pts`;
    return `${Math.min(...Object.values(g.cost.values))}–${Math.max(...Object.values(g.cost.values))} pts`;
  }

  function details(): [string, string][] {
    if (kind === 'units') return game.details?.(card as U) ?? [];
    const g = card as G;
    const rows: [string, string][] = [];
    if (typeof g.cost === 'object') rows.push([`Cost by ${g.cost.by}`, Object.entries(g.cost.values).map(([k, v]) => `${k}: ${v}`).join(', ')]);
    if (g.factions) rows.push(['Factions', g.factions.map((f) => game.factions.find((x) => x.id === f)?.name ?? f).join(', ')]);
    return rows;
  }

  async function save(edited: Unit | Upgrade) {
    if (!hb) return;
    const base = await loadData<U, G>(cat.ruleset.data);
    const original = (kind === 'units' ? base.units : base.upgrades).find((c) => c.id === edited.id);
    saveCardEdit(hb, kind, card.custom ? undefined : original, edited);
    await putHomebrew(hb);
    await onChanged();
    onClose();
  }

  async function revert() {
    if (!hb) return;
    revertCard(hb, kind, card.id);
    await putHomebrew(hb);
    await onChanged();
    onClose();
  }

  async function ban() {
    if (!hb) return;
    banCard(hb, kind, card.id);
    await putHomebrew(hb);
    await onChanged();
    onClose();
  }
</script>

{#if editing && hb}
  <CardEditor
    {card}
    factions={game.factions}
    onSave={save}
    onRevert={hb[kind][card.id] ? revert : undefined}
    onBan={ban}
    onClose={() => (editing = false)}
  />
{:else}
  <CardView {card} cost={costText()} details={details()} statLine={kind === 'units' ? game.statLine(card as U) : ''} {modeNames} {onClose}>
    {#snippet actions()}
      {#if hb}
        <button onclick={() => (editing = true)}>Edit{hb[kind][card.id] ? ' (changed)' : ''}</button>
      {/if}
      {@render outer?.()}
    {/snippet}
  </CardView>
{/if}
