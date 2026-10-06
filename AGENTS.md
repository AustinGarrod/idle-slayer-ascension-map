# Agent instructions

## Current task and repository state

This is a static React/TypeScript/Vite/Yarn/React Flow Ascension Map. Its reviewed catalog covers Idle Slayer 7.2.0 / Steam build 25551532: 288 upgrades, 318 connections and 288 icons. Map interactions and local progress are implemented. Read docs/architecture.md, docs/data.md and extraction/native-rule READMEs before changing those contracts. docs/implementation-plan.md preserves accepted scope and release gates.

The public remote is `AustinGarrod/idle-slayer-ascension-map`. The existing Mac checkout has the spelling `idle-slayer-ascention-map`; do not rename it as incidental cleanup. Use the public repository spelling for fresh checkouts and URLs.

Read `README.md`, `design.md` and `docs/implementation-plan.md` before implementing map features. Follow the user's requested scope. A request for local feature work does not imply publishing, deployment or changing the installed game.

## Development

- Use Node.js 24 and the repository's pinned `yarn@4.13.0` CLI in `.yarn/releases/`. Normal `yarn` commands delegate through `yarnPath`; without a global launcher use `node .yarn/releases/yarn-4.13.0.cjs <command>`. Keep the reviewed CLI/license tracked while ignoring generated `.yarn` state. Keep `yarn.lock` committed, use `yarn install --immutable`, and avoid other package-manager lockfiles. Preserve the `node-modules` linker in `.yarnrc.yml`.
- Use React and TypeScript for application code. Keep game-rule evaluation and local persistence separate from rendering so they can be tested independently.
- Use scripts `yarn dev`, `yarn validate:catalog`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn test:e2e`, `yarn check:release` and `yarn preview`. On Windows use `yarn <script>`. Install Chromium with `yarn playwright install chromium`. No lint script exists.
- Run `yarn typecheck` and `yarn build` for application changes. Add meaningful tests when implementing game rules, storage and interactions; report checks that exist and passed without implying absent test suites passed.
- Keep the production site static. React Flow renders fixed positions in Game and Web modes; never enable node dragging or connection edits.
- Follow `design.md` for appearance and accessible interaction. Keep documentation updated when behavior, commands or interfaces change.

## Local game inputs and data provenance

- Read the Windows Steam installation and `appmanifest_1353300.acf` to identify the game version and build. The optional copied input layout is `.local-game/Idle Slayer/` and `.local-game/appmanifest_1353300.acf`.
- Keep binaries, raw asset exports, Steam inputs, player saves, credentials and private working files out of Git. Do not put them in `public/`, bundle them into browser code or include them in `dist/`. User-selected save bytes may be read temporarily by the authorized importer; persist only the normalized map profile. Preserve the Vite deny rules for local game inputs and sensitive files.
- Extract offline first. Assess UnityPy and type-tree tooling against the actual Unity files before choosing the extraction method. If a read-only runtime exporter is needed, make it independent of game mutations: never invoke purchases, saving, unlocks or reset methods to gather data.
- A snapshot of one player's current progress cannot establish the complete reveal or dependency rules. Inspect serialized requirements and relevant game logic as well as assets.
- Treat the installed game as canonical for native IDs, coordinates, connections, costs, reveal/purchase requirements, permanent flags, activation and reset behavior. Supplement descriptions and icons with wiki sources; resolve discrepancies against the game.
- Commit the normalized catalog, reviewed assets and reproducible extraction tools. Record Steam build, game version, source URLs/revisions and extraction provenance. Keep application-code licensing separate from game assets and wiki text.
- A complete verified catalog is a release requirement. Do not publish a guessed layout or silently substitute incomplete wiki dependencies.

## Behavioral constraints for future implementation

- Preserve native tree coordinates in the catalog and Game layout, and use stable IDs in both layouts. Web placement and route bounds must depend only on the shared visible graph, never hidden topology. Titles are not identities: separate upgrades can share a title. Represent large costs as decimal strings and prerequisite AND/OR relationships explicitly.
- Keep purchase requirements, reveal requirements, permanent grants and Astral activation distinct. One visibility calculation must govern nodes, connections, search, details, milestone controls and progress totals.
- Hide spoilers by default using the game's reveal rules. Visible locked nodes may remain visible. Title search must not disclose hidden nodes.
- Recommendations use reviewed wiki order only for priority. Native reveal and purchase requirements must both be met, including when browsing spoilers; never suggest repurchasing owned pending Astrals. Keep guide provenance/licensing separate from game data, explicitly label unranked cost fallbacks, and do not claim affordability or an optimal build without the required player inputs.
- External milestones represent the required item received or purchased, not an inferred earlier event. Record them explicitly.
- Filling prerequisites must resolve an unsatisfied OR path with the user before applying changes. Clearing purchases must preview downstream invalidations and preserve valid alternate paths and retained Astral ownership.
- Model Ultra Ascension and Astrals with separate ownership, purchase epoch and activation state. Preview resets, clear repeat purchases, retain permanent upgrades and milestones, activate eligible locks and recompute permanent grants according to extracted game rules.
- Store one profile in versioned local storage, with validated JSON backup/restore and undo. Preserve unknown IDs during catalog updates and keep the current session usable when storage fails.
- User-authorized game-save import is limited to the reviewed Windows Steam 7.2.0 format. Read a selected file locally, validate before preview, apply only on confirmation, and support undo. Import current ownership, activation, UA count and verified milestones; never persist unrelated native preferences. Document the synthetic retained-ownership baseline because purchase history is absent. Review native semantics again before supporting another version or platform.
- Do not add SP-balance simulation, Stone allocation, accounts, a backend, analytics, cloud authentication or automatic game-file access.

## Verification and handoff

Keep automated browser/API checks on local or isolated CI builds. Never point automated suites, probes or scheduled checks at the live production site. Production confirmation must be deliberate manual inspection; do not retry or work around hosting rate limits. A deployment success and local/CI checks are distinct from manual production readback.

When implementing the full app, validate catalog coverage, references, asset presence, coordinates and reachable dependency paths against the game export. Test dependency/reveal/reset/storage rules independently, then verify map interactions and spoiler behavior in a production browser build. Add GitHub Pages deployment only when requested implementation reaches its documented release gate.

In the final handoff, report what changed, relevant passing checks, remaining unverified behavior and whether anything was pushed or deployed. Include exact commands needed for the next Windows agent rather than assuming it has the Mac environment.
