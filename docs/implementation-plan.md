# Accepted implementation plan: Idle Slayer Ascension Map

## Summary and current state

Build a static React and TypeScript app with Vite, Yarn and React Flow. Preserve the game's map positions, support title search and purchase tracking, and hide spoilers according to the game's reveal rules.

Publish through GitHub Pages from `AustinGarrod/idle-slayer-ascension-map`. Progress stays in local storage, with JSON backup and restore.

The current repository is a minimal bootstrap. It has a placeholder page, development/build commands and these handoff documents. It does not yet implement the map, catalog extraction, progress tracking or Pages deployment. Continue with the work below on Windows after providing game inputs.

## Data and game rules

The required source input is a copy of the Windows Steam installation folder and `appmanifest_1353300.acf`, or direct read-only access to those installed paths. Complete, verified tree data is a release requirement; the public wiki alone has layout and prerequisite gaps.

- Inspect the copied Unity assets using [UnityPy](https://github.com/K0lb3/UnityPy#monobehaviour), assessing type-tree tooling if needed. Extract native upgrade IDs, positions, connections, costs, localization, requirements, permanent flags and activation rules.
- If necessary, prepare an independent read-only exporter for the installed game. Collect data without invoking purchase, save, unlock or reset methods. Inspect serialized requirements and relevant game logic; a snapshot of one player's progress cannot establish every reveal rule.
- Supplement the extracted catalog with wiki descriptions and individual icons. Resolve conflicting wiki entries against the installed game. Bundle reviewed assets locally so the deployed app needs no wiki requests.
- Give every node a stable identity, including separate nodes sharing titles such as “Astral Key.” Store large costs as decimal strings to avoid numerical precision loss.
- Keep purchase requirements, reveal requirements, Astral activation and permanent grants separate. Preserve AND/OR relationships explicitly.
- Record game version, Steam build, source revisions and extraction provenance. Keep game binaries outside Git; commit the normalized catalog, reviewed assets and reproducible extraction tools.

Include every node belonging to the Ascension tree, including Ultra, Astral and later branches. Other progression systems appear only as milestones needed to unlock those branches.

## Map and progress behavior

- Provide a fixed-position map with mouse and touch pan/zoom, zoom controls and a return-to-start action. Nodes cannot be rearranged.
- Search titles without case or apostrophe sensitivity. Results include icons and costs; selecting one centers the map and opens its details.
- Details show title, description, cost, prerequisites, purchase/activation status and source references. Use a side panel on desktop and a bottom sheet on mobile.
- Default to hiding spoilers. Apply the game's reveal rules while retaining visible locked nodes. Filter search, milestone controls, details, connections and progress totals through the same visibility logic.
- Provide a milestone checklist for unlocks outside the tree. Milestones represent the required item purchased or received—for example, Victor's Soul—not simply its preceding boss defeat.
- Marking a purchase fills missing prerequisites. For an unsatisfied OR requirement, let the user choose the path before applying changes. Outside milestones and Astral activation require explicit user input.
- Unmarking a prerequisite previews and clears purchases that lose their valid dependency path. Preserve retained Astral ownership from earlier Ultra Ascensions.
- Model Ultra Ascension with a previewed reset: clear repeat purchases, retain permanent upgrades and milestones, activate eligible Astral locks, and recalculate permanent grants. Track purchase epoch and activation separately, and allow users to record already activated Astrals when entering existing progress.
- Offer undo for progress changes and confirmation for clearing all progress. Do not simulate SP balances or Stone allocations.
- Version saved data. Validate imports before replacing progress, preserve unknown IDs across catalog updates, and report storage failures without discarding the current session.

## Design and documentation

Follow `design.md` around the game's [official visual reference](https://idleslayer.com/img/press-kit/Editor%20Screenshot%202.png): dark brown and charcoal surfaces, gold framing, magenta connections and crisp pixel icons.

Use pixel typography for headings and readable text for descriptions. Distinguish states with symbols and outlines as well as color; support keyboard navigation, touch controls and reduced motion.

Maintain `AGENTS.md` and `README.md`, and add focused architecture and data documentation alongside implementation. Document setup, checks, extraction and refresh commands, source reconciliation, spoiler rules, storage migrations and deployment. Clearly separate application-code licensing from game-asset and wiki-text attribution.

## Validation and release

- Validate catalog coverage against the game export, unique IDs, references, icons, coordinates and reachable prerequisite paths.
- Test AND/OR dependencies, story gates, hidden search results, prerequisite filling, cascading removal, pending Astrals, permanent grants and repeated Ultra Ascensions.
- Test backup round trips, malformed imports, storage failures and catalog migrations.
- Use Playwright to verify search-to-node navigation, persistence, spoiler toggling and responsive interactions against the production build.
- Configure CI for catalog validation, type checking, tests and build. Deploy successful `main` builds through GitHub Actions with the correct Pages base path.
- Publish only after the complete catalog and reveal/reset behavior are verified. Then smoke-test the deployed site's assets, navigation and persistence.

V1 defaults: English, one local progress profile, spoilers hidden, and no backend, accounts, analytics or game-save import.

## Windows handoff

See `README.md` for exact clone and Corepack/Yarn commands. Use Node.js 24 with `yarn@4.13.0`, the committed `yarn.lock` and Yarn's `node-modules` linker. Place optional copied inputs at `.local-game/Idle Slayer/` and `.local-game/appmanifest_1353300.acf`. Keep raw game inputs outside Git and outside the served site; do not infer that a public code repository authorizes redistribution of the complete game.
