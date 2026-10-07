# Third-party content

## Idle Slayer

This unofficial companion is unaffiliated with Idle Slayer or its creator. Game text, upgrade data and pixel icons belong to Pablo Leban and their respective rights holders, and are excluded from the application MIT license. No game binaries are redistributed.

The normalized catalog and 288 individual icons were extracted offline from Idle Slayer 7.2.0, Steam app 1353300, build 25551532. Native English localization supplies text, with plain-text formatting and documented static projections for player-dependent effects. Sources: [Steam](https://store.steampowered.com/app/1353300/Idle_Slayer/), [official site](https://idleslayer.com/) and [visual reference](https://idleslayer.com/img/press-kit/Editor%20Screenshot%202.png). Exact native/catalog/icon hashes are in data/catalog-receipt.json. Wiki ordering is licensed and attributed separately below; wiki descriptions and icons are not bundled.

## Wiki recommendation priorities

The ordering in `src/data/wiki-priorities.json` is adapted from the [Idle Slayer Wiki Ascension Tree Tier List, revision 7187](https://idleslayer.fandom.com/wiki/Ascension_Tree_Tier_List?oldid=7187), by Idle Slayer Wiki contributors, dated 2026-07-05. It is licensed under [Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/), separately from the application's MIT code license. [Source history](https://idleslayer.fandom.com/wiki/Ascension_Tree_Tier_List?action=history) identifies contributors. The wiki declares game 7.0.0; current costs and gates come from the extracted 7.2.0 game catalog.

Changes: purchase-order facts were mapped to stable native IDs, repeated recommendations use their earliest general-guide rank, supplementary quick-UA tables supply identity evidence, and documented spelling/table syntax differences were reconciled. Brief notes were written from native effects; wiki paragraphs and images were not copied. Exact source hashes, revisions, mapping evidence and the Fandom licensing-policy witness are in the generated data and [provenance documentation](docs/wiki-recommendations.md). The refresh script is original MIT-licensed code.

## Press Start 2P

Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net), with Reserved Font Name “Press Start 2P”. SIL Open Font License 1.1. Bundled locally through @fontsource/press-start-2p; the complete font license is public/licenses/press-start-2p-OFL.txt.

## Software

React/React DOM, React Flow and Vite retain their MIT licenses. TypeScript and Playwright retain their Apache 2.0 licenses; Vitest retains its MIT license. Pinned package versions and transitive dependencies are recorded in yarn.lock. UnityPy and Cpp2IL retain their MIT licenses; extraction docs record upstream versions and checksums. Downloaded tools and reconstructed game assemblies remain private local inputs.

Dagre and its Graphlib dependency supply the Web graph layout under the MIT license. Complete installed upstream notices for all bundled runtime/CSS/font packages and generated Vite/Rolldown helpers are in [public/licenses/index.html](public/licenses/index.html), also available through **About & sources → Bundled software licenses** in the deployed app. The reviewed [notice manifest](public/licenses/notices.json) records package versions, license identifiers and complete notice hashes. It includes Rolldown's additional third-party notices and distinguishes embedded Graphlib and generated helpers from normal package modules. The Vite upstream license file retains its complete bundled notice text; this does not imply that every tooling dependency listed within that upstream file is an application runtime dependency.

Build validation compares the actual module graph with this inventory, verifies the embedded Graphlib version from Dagre's sourcemap, and rejects missing or stale installed versions/notices. The release gate checks distributed notice/index bytes and binds runtime coverage to emitted JavaScript hashes. Application code, game assets and wiki content retain the separate licensing boundaries above.

The repository-local Yarn 4.13.0 CLI is development tooling under the BSD 2-Clause license, copyright Yarn Contributors. Its official distribution, checksum and full license are in `.yarn/releases/`. It is not included in the deployed browser application.
