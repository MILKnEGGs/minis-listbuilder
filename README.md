# Milk's List Builders

Offline list builders for miniatures games, with each ruleset's list rules, your own homebrew rules, and a match tracker.
Live at https://milkneggs.github.io/minis-listbuilder/.

| App | Game | Rulesets |
|---|---|---|
| [Milk's X-Wing Squad Builder](apps/xwing) | Star Wars: X-Wing (second edition) | X-Wing Alliance (50 points), AMG final points (20 points), 2.0 Legacy (200 points) |
| [Milk's Armada Fleet Builder](apps/armada) | Star Wars: Armada | Standard (400 points) |

Every app has:

- **List building:** add ships, pilots and squadrons, then fill each one's upgrade slots. Points, limited/unique names, slot fit, faction and upgrade restrictions, and the game's own list rules are checked as you go.
- **Rules & homebrew:** each ruleset links its official rules documents and lists reminders, and every card's rules text is searchable.
  A homebrew is your own ruleset on top of a built-in one. It stores only your changes (points, card text, slots, new cards, removed cards, a different points limit, house rules), so data updates still come through. Share one as a small file.
- **Match tracker:** one list per phone. Round and phase, both scores, and each unit's hull, shields, charges and tokens (Armada: defense tokens and command dials). It keeps the screen awake and picks up where you left off.

Lists, homebrews and matches stay in the browser's storage on that device.

## Where the data comes from

**X-Wing:** cards from [xwing-data2](https://github.com/xwingtmg/xwing-data2) (2.5) and [xwing-data2-legacy](https://github.com/SogeMoge/xwing-data2-legacy) (2.0 Legacy). Points come from [xwing-points](https://github.com/eirikmun/xwing-points), where the X-Wing Alliance and X2PO publish theirs.
`apps/xwing/scripts/data.mjs` downloads the current points revision of each team into `public/data/` (not committed). The deploy workflow runs it on every push and weekly, so new points arrive without code changes.

**Armada:** every official card, converted once from [Flagship](https://github.com/videege/flagship) (MIT, last changed April 2023) by `apps/armada/scripts/flagship.mjs`. The script reads Flagship's TypeScript data files with the TypeScript parser, so nothing from Flagship is run.
The output, `apps/armada/public/data/armada.json`, is committed. Fix errata or add community content (Armada Legacy, ARC, Nexus) with a homebrew.

## How it's put together

- `packages/core`: everything the games share: the list model and shared checks (`list.ts`), rulesets and homebrew (`ruleset.ts`), the match tracker (`match.ts`), storage (`db.ts`), and the whole UI. A game plugs in by providing a `GameDef` (see `src/types.ts`).
- `apps/<game>`: one installable PWA per game, with its own `game.ts` (card shape, rulesets, restrictions, list rules, tracker counters, exports).
- `site/`: the landing page linking to each app.

## Working on it

```bash
npm install
npm run data         # download X-Wing cards and points (needed once before dev)
npm run dev          # X-Wing at http://localhost:5190
npm run dev:armada   # Armada at http://localhost:5191
npm test
npm run build        # every app into dist/, plus the landing page
```

Visual Studio: open `minis-listbuilder.sln`. F5 runs the X-Wing app with the debugger, and Test Explorer shows the Vitest tests.

Game names are trademarks of their owners; this is an unofficial fan project.
