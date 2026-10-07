# Idle Slayer Ascension Map

[**Open the Ascension Map**](https://austingarrod.github.io/idle-slayer-ascension-map/)

A free, unofficial companion for Idle Slayer: explore the Ascension tree, record your progress, and find eligible upgrades in the reviewed wiki order. The complete catalog covers **Idle Slayer 7.2.0 / Steam build 25551532**, with **288 upgrades, 318 connections and 288 icons**.

## Start playing

1. Open the map. **Game Layout** follows native coordinates; **Detailed Layout** spreads visible dependency paths out for reading. Spoilers start hidden.
2. Search by upgrade title or effect, or leave search empty to browse all visible upgrades. Filter **Progress state** to review available, locked, owned or awaiting-activation upgrades; results show status and exact cost. Select a result or tile to inspect requirements and connected upgrades. **Next upgrade** offers eligible suggestions; availability checks native requirements without checking SP balance or claiming an optimal build.
3. Select an upgrade and choose **Record purchase…** to enter purchases manually. Alternatively, open **Progress → Import game save…** (on phones, **Map options → Progress**) for a reviewed Windows Steam 7.2.0 save. Import and consequential changes require a preview and confirmation; the app never changes the game.
4. Use **Export JSON backup** regularly. Progress belongs to this browser's local storage, with session-only Undo and validated restore; there is no account, cloud backup or automatic game-file access.

Use **Map view…** on desktop or **Map options → Overview visible map** on phones to orient within the revealed tree. **Return to inspection** or **Refocus selected upgrade** brings back your current target without changing progress.

**Map help…** in Map options, Progress or About gives optional setup and state guidance. [The player guide](docs/player-guide.md) explains layouts, existing-progress setup, pending Astrals, milestones, reset/history entry, backup/restore and recommendations. [Steam import compatibility](docs/save-import.md) explains supported files and the retained-ownership baseline. The app does not simulate SP balances or Stone allocation.

**Privacy:** the production map starts self-hosted Umami usage analytics and session recording unless disabled through **About & sources → Privacy & tracking**, Do Not Track or Global Privacy Control. Recordings can include visible map progress. Selected saves and JSON backups are excluded and never uploaded; file inputs, search text, counters and import/restore contents are blocked from replay. Layout and tracking preferences are separate from progress. See [privacy details and operator documentation](docs/analytics.md).

## Run locally on Windows

Install **Node.js 24**. The repository includes **Yarn 4.13.0** and directs normal `yarn` commands to that pinned release. Preserve `yarn.lock` and the node-modules linker; do not add other package-manager lockfiles.

```powershell
git clone https://github.com/AustinGarrod/idle-slayer-ascension-map.git
cd idle-slayer-ascension-map
yarn install --immutable
yarn dev
```

Open the printed URL under `/idle-slayer-ascension-map/`. If Node.js is installed but no `yarn` launcher exists, use the tracked CLI directly:

```powershell
node .yarn/releases/yarn-4.13.0.cjs install --immutable
node .yarn/releases/yarn-4.13.0.cjs dev
```

No Corepack command or global Yarn upgrade is needed. [Bundled CLI provenance and license](.yarn/releases/README.md).

## Verify a change

```powershell
yarn validate:catalog
yarn typecheck
yarn test
yarn test:tools
yarn build
yarn playwright install chromium
yarn test:e2e
yarn check:release
```

Browser checks use a local production preview on port 4173 by default; `yarn preview` opens one manually. For a fresh build on a free port, follow the [Windows local browser-check recipe](docs/local-browser-checks.md), including a scoped `PLAYWRIGHT_BASE_URL` and cleanup. Keep all automated checks on local or isolated CI builds. Production confirmation is deliberate manual inspection only. Catalog checks compare every native ID, coordinate, cost, predicate and icon hash with reviewed evidence; unit tests cover rules/storage and browser tests cover interactions, spoilers and responsiveness. There is no lint script.

Failed local/CI browser tests retain a trace, screenshot and HTML report. CI uploads only synthetic failure diagnostics for five days. See [browser diagnostics](docs/browser-diagnostics.md) for Windows retrieval and local viewer commands.

GitHub Pages CI validates and deploys successful main builds using the repository base path. `yarn check:release` inspects actual built entries, referenced assets, byte-identical catalog, all reviewed icons, complete runtime notices and exclusion of private inputs. Upload only `dist`; a merge or deployment alone does not establish manual production behavior.

`yarn test:tools` runs the real normalization and offline wiki-parser entry points on invented fixtures using Python 3.10+ standard library only. It needs no UnityPy, installed game, saves, downloaded wiki responses or network access. Use `python` on Windows, `python3` elsewhere, or set `$env:PYTHON` to an interpreter path. [Coverage and limits](scripts/extract/README.md#synthetic-transformation-checks) supplement independent native review and real-input release gates.

## Contributor and maintenance documentation

- [Architecture and progress contracts](docs/architecture.md), [design](design.md), [accepted scope and release gates](docs/implementation-plan.md), and [agent instructions](AGENTS.md).
- [Catalog provenance and refresh](docs/data.md), [offline asset extraction](scripts/extract/README.md), [native-rule inspection](scripts/logic/README.md), and [wiki recommendation refresh](docs/wiki-recommendations.md). Keep binaries, Steam manifests, saves, raw exports and tools in ignored `.local-game/` or outside Git; never serve them. A game update requires renewed native review, complete catalog coverage and asset verification.
- [Analytics event/privacy contract and private operator reports](docs/analytics.md).
- [Third-party attribution](THIRD_PARTY_NOTICES.md) and [bundled runtime notices](public/licenses/index.html). After reviewing dependency/license changes in the [version/hash inventory](public/licenses/notices.json), run `yarn notices:refresh` to copy complete bytes, hash them and regenerate the index. `yarn notices:check` checks source artifacts without writing; build and release checks verify actual bundle coverage. [The Windows maintenance recipe](docs/runtime-notices.md) covers additions, removals, embedded dependencies, helpers and human review responsibilities. The app links the license index in **About & sources**.

Application code and extraction tools use [MIT](LICENSE). Game text, data and icons are excluded from that code license and belong to their rights holders; wiki-derived ordering and font/software notices retain their separate attribution.
