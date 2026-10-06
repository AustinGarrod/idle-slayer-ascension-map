# Idle Slayer Ascension Map

A static, unofficial companion for the complete native Ascension tree: **288 upgrades, 318 connections and 288 bundled pixel icons** from **Idle Slayer 7.2.0 / Steam build 25551532**. React, TypeScript, Vite and React Flow render two fixed layouts: **Web**, a readable dependency graph, and **Game**, the original game positions.

Search titles, inspect details, record purchases and milestones, preview removals and Ultra Ascensions, undo changes, and back up one local profile as JSON. Import current progress from a reviewed Steam game save through a local preview. Spoilers are hidden by default across the map, connections, search, details, checklist and totals. OR paths require a choice; external items and Astral activation require explicit input. The app remains static, without accounts, an application backend, SP balances or Stone allocation. Self-hosted Umami collects usage analytics and session recordings as described below.

Web arranges visible paths from left to right. Arrows point from a prerequisite toward the upgrade; selecting an upgrade emphasizes its incoming and outgoing connections. **Connected from** and **Leads to** in details jump directly to visible neighbors. The exact AND/OR and activation requirements remain in the details. Switching layouts preserves selection and progress, and does not change catalog coordinates.

On small screens, **Map options** holds spoilers, milestones, progress, undo and source information. The selected upgrade appears in a compact panel with its cost and purchase action; **Show details** expands the scrollable requirements and connections. **Map navigation** exposes directional pan buttons alongside touch pan/zoom. Layout selection and panel expansion are session-only view settings.

**Next upgrade** suggests the first remaining upgrade in the reviewed wiki order whose native reveal and purchase requirements are met. It shows the benefit, exact game cost, guide source and up to two alternatives. **Show on map** opens its details; **Record purchase…** uses the normal confirmation and undo flow. Suggestions recalculate from recorded purchases, milestones and activation after edits, restore or Ultra Ascension. Hidden, owned and blocked upgrades are excluded, including owned Astral locks awaiting activation.

The wiki snapshot ranks 280 of 288 native upgrades and declares game 7.0.0; the catalog remains authoritative for 7.2.0 costs and gates. When no eligible upgrade has a wiki rank, suggestions explicitly use a native-cost **Catalog fallback**. General guide order does not account for SP balance, total USP, gear or personal play style. [Recommendation provenance and refresh](docs/wiki-recommendations.md) documents source revisions, identity mapping, eight unranked upgrades and licensing. The site bundles this data locally and makes no wiki requests.

## Import Steam progress

Open **Progress → Import game save…** (on phones, **Map options → Progress**). Choose `savedata.sav` or `backup.sav` from:

```text
%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\
```

The importer supports the reviewed **Windows Steam 7.2.0** save format. Close the game before selecting the file. Review the visible ownership, Astral activation, milestone and Ultra Ascension counts, then choose **Apply import**. Cancel keeps the current profile; undo restores it after applying. Suggestions recalculate immediately. Existing unknown map IDs and the spoiler preference remain intact.

The selected file is decoded entirely in the browser. It is never uploaded, modified, bundled or stored as a game save. Only the map's recognized progress is retained; account preferences and unrelated native data are discarded. Exact purchase history is unavailable, so active permanent and retained ownership use a documented snapshot baseline. Android progress can be imported from a Steam copy after the game's existing cross-platform sync; direct mobile file access and cloud login are outside this feature. [Format, native evidence and compatibility](docs/save-import.md).

## Usage analytics and recordings

The production app uses self-hosted [Umami](https://analytics.garrod.house) for page views, bounded interaction events, browser/device and referral/campaign information, approximate location when available, performance data and session recordings. Recordings can include the visible map and its recorded progress. Selected game saves and JSON backups are never uploaded; file inputs, search text, counters and import/restore previews are excluded from replay contents. Heatmaps still collect coarse click and scroll coordinates, including over excluded elements.

Tracking starts automatically unless disabled through **About & sources → Privacy & tracking** or the browser's privacy signals. The preference is separate from map progress and survives reloads, undo, restore and clearing progress. If it cannot be read, tracking stays off. Changing it reloads the page; if map progress cannot be saved first, choose export-and-reload, reload without backup or cancel. A failed tracking-preference write reloads with `#analytics=off`, which disables tracking for that URL/visit without claiming a durable preference. Keep or bookmark that URL if storage remains unavailable. [Analytics setup and operator guide](docs/analytics.md) documents the settings, event contract, URL safeguards, reports and local verification.

The private Umami setup includes a [product overview board](https://analytics.garrod.house/boards/f10ebd6f-2e22-4148-983a-ecb405e6524d), five conversion goals, three ten-minute funnels and three rolling 30-day cohorts. The native five-step `app_ready` journey is configured as an Events view; Umami 3.4 keeps that recipe only in the current view, so it must be reapplied after reopening. Dedicated Performance, Replays and Heatmaps screens provide deeper inspection.

## Windows setup and checks

Use Node.js 24. The repository includes Yarn 4.13.0, and `.yarnrc.yml` directs normal `yarn` commands to that pinned release, including when the installed launcher is Yarn Classic. Keep the committed lockfile and node-modules linker. The public repository spelling is idle-slayer-ascension-map; leave the original Mac checkout spelling unchanged.

```powershell
git clone https://github.com/AustinGarrod/idle-slayer-ascension-map.git
cd idle-slayer-ascension-map
yarn install --immutable
yarn dev
```

Open the printed URL under `/idle-slayer-ascension-map/`. No Corepack command or global Yarn upgrade is needed. If a fresh machine has Node.js but no `yarn` launcher, invoke the included release directly:

```powershell
node .yarn/releases/yarn-4.13.0.cjs install --immutable
node .yarn/releases/yarn-4.13.0.cjs dev
```

Do not add npm/pnpm lockfiles. [The bundled Yarn release](.yarn/releases/README.md) records its source, checksum and license. CI uses the direct Node invocation; Playwright starts Vite directly with Node.

```powershell
yarn validate:catalog
yarn typecheck
yarn test
yarn build
yarn playwright install chromium
yarn test:e2e
yarn check:release
yarn preview
```

Browser tests exercise a production build on the local preview at port 4173. Keep all automated tests and probes on local or isolated CI builds; production confirmation is manual only. Never point the suite or scheduled checks at the live site. Catalog tests compare every native ID, coordinate, cost, predicate and sprite hash with the reviewed receipt. Unit tests cover dependencies, reset epochs and storage; browser tests cover navigation, persistence, spoilers and responsive interaction. There is no lint script.

## Progress and data

Milestones mean the actual required item received, crafted or purchased. Controls for isolated external branches require explicit **Show spoilers** for first entry because the game supplies no earlier tree gate. Enter existing Ultra Ascension history in Progress and confirm already activated Astrals in their details. The app never modifies the game.

[Architecture](docs/architecture.md) documents visibility, edits, resets and storage migrations. [Data provenance](docs/data.md), [asset extraction](scripts/extract/README.md) and [native logic inspection](scripts/logic/README.md) give exact Windows refresh commands. Keep installed files, Steam manifests, saves, raw exports, downloaded tools and reconstructed assemblies inside ignored `.local-game/` or outside the repository; never serve or commit them. Optional copies use `.local-game/Idle Slayer/` and `.local-game/appmanifest_1353300.acf`.

Native English localization supplies descriptions and icons. Fourteen effects have accurate static descriptions with notes for player-dependent values. Wiki priority ordering is separate from the native catalog; wiki descriptions and dependencies are not substituted. [The coverage receipt](data/catalog-receipt.json) records game/build/tool versions, registry coverage, native fields and exact catalog/icon hashes. [design.md](design.md) records reviewed layout concepts and Atlas styling; [AGENTS.md](AGENTS.md) states implementation boundaries.

## Deployment and licensing

GitHub Pages uses the Vite base `/idle-slayer-ascension-map/`. CI validates the reviewed catalog, checks types, runs unit and local production-bundle browser tests, builds and checks release verification before deploying successful main builds. Upload only dist. Re-review extraction and native methods after every game update; never publish a guessed or partial catalog. Manually smoke-test published assets, navigation and persistence after an authorized deployment; automated suites remain local or isolated in CI.

Application source and extraction tools use [the MIT license](LICENSE). Game text, data and icons are **excluded** from that code license and belong to Idle Slayer's rights holders. [Third-party notices](THIRD_PARTY_NOTICES.md) separate game attribution, software and the locally bundled Press Start 2P font's SIL OFL license.
