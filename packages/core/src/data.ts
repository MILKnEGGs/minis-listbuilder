// Loads a ruleset's data file once and keeps it for the session.

import { buildCatalog } from './ruleset';
import type { Catalog, CatalogData, Ruleset, Unit, Upgrade } from './types';

const files = new Map<string, Promise<CatalogData<any, any>>>();

export function loadData<U extends Unit, G extends Upgrade>(name: string): Promise<CatalogData<U, G>> {
  let p = files.get(name);
  if (!p) {
    p = fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
    // A failed download can be tried again later.
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return p as Promise<CatalogData<U, G>>;
}

export async function loadCatalog<U extends Unit, G extends Upgrade>(ruleset: Ruleset): Promise<Catalog<U, G>> {
  return buildCatalog(ruleset, await loadData<U, G>(ruleset.data));
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Rules text as safe HTML, with game symbols like [Focus] and bold markers picked out. */
export function rich(text: string): string {
  return escape(text)
    .replace(/\[([^\]]{1,24})\]/g, '<b class="sym">$1</b>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
