# Idle Slayer Ascension Map

A static, unofficial companion for the complete native Ascension tree: **288 upgrades, 318 connections and 288 bundled pixel icons** from **Idle Slayer 7.2.0 / Steam build 25551532**. React, TypeScript, Vite and React Flow render fixed game positions.

Search titles, inspect details, record purchases and milestones, preview removals and Ultra Ascensions, undo changes, and back up one local profile as JSON. Spoilers are hidden by default across the map, connections, search, details, checklist and totals. OR paths require a choice; external items and Astral activation require explicit input. No backend, accounts, analytics, save import, SP balances or Stone allocation.

## Windows setup and checks

Use Node.js 24 and pinned Yarn 4.13.0 with the committed lockfile and node-modules linker. The public repository spelling is idle-slayer-ascension-map; leave the original Mac checkout spelling unchanged.

```powershell
git clone https://github.com/AustinGarrod/idle-slayer-ascension-map.git
cd idle-slayer-ascension-map
corepack.cmd yarn install --immutable
corepack.cmd yarn dev
```

Open the printed URL under `/idle-slayer-ascension-map/`. If Corepack is unavailable, install it with `npm.cmd install --global corepack`. Do not add npm/pnpm lockfiles.

```powershell
corepack.cmd yarn validate:catalog
corepack.cmd yarn typecheck
corepack.cmd yarn test
corepack.cmd yarn build
corepack.cmd yarn playwright install chromium
corepack.cmd yarn test:e2e
corepack.cmd yarn check:release
corepack.cmd yarn preview
```

Production browser tests start the preview on port 4173. Catalog tests compare every native ID, coordinate, cost, predicate and sprite hash with the reviewed receipt. Unit tests cover dependencies, reset epochs and storage; browser tests cover navigation, persistence, spoilers and responsive interaction. There is no lint script.

## Progress and data

Milestones mean the actual required item received, crafted or purchased. Controls for isolated external branches require explicit **Show spoilers** for first entry because the game supplies no earlier tree gate. Enter existing Ultra Ascension history in Progress and confirm already activated Astrals in their details. The app never modifies the game.

[Architecture](docs/architecture.md) documents visibility, edits, resets and storage migrations. [Data provenance](docs/data.md), [asset extraction](scripts/extract/README.md) and [native logic inspection](scripts/logic/README.md) give exact Windows refresh commands. Keep installed files, Steam manifests, saves, raw exports, downloaded tools and reconstructed assemblies inside ignored `.local-game/` or outside the repository; never serve or commit them. Optional copies use `.local-game/Idle Slayer/` and `.local-game/appmanifest_1353300.acf`.

Native English localization supplies descriptions and icons. Fourteen effects have accurate static descriptions with notes for player-dependent values. No wiki text or incomplete wiki prerequisites are substituted. [The coverage receipt](data/catalog-receipt.json) records game/build/tool versions, registry coverage, native fields and exact catalog/icon hashes. [design.md](design.md) records three reviewed layout concepts and Atlas styling; [AGENTS.md](AGENTS.md) states implementation boundaries.

## Deployment and licensing

GitHub Pages uses the Vite base `/idle-slayer-ascension-map/`. CI validates the reviewed catalog, checks types, runs unit and production-browser tests, builds and checks release verification before deploying successful main builds. Upload only dist. Re-review extraction and native methods after every game update; never publish a guessed or partial catalog. Smoke-test published assets, navigation and persistence after deployment.

Application source and extraction tools use [the MIT license](LICENSE). Game text, data and icons are **excluded** from that code license and belong to Idle Slayer's rights holders. [Third-party notices](THIRD_PARTY_NOTICES.md) separate game attribution, software and the locally bundled Press Start 2P font's SIL OFL license.
