# Architecture and progress contract

`public/catalog.json` contains the complete reviewed catalog. Native IDs identify upgrades; titles may repeat. Decimal string costs format with `BigInt`, and native positions remain unchanged in the catalog. Rendering converts Unity’s positive-up Y axis to the browser’s positive-down Y axis; pairwise game placement is preserved. `catalog.ts` validates structure, references and reachable purchase/reveal paths before rendering. Build tests compare records and icon bytes against the independently reviewed native registry receipt.

## Rules and spoilers

`rules.ts` evaluates explicit AND/OR, owned, active, milestone and previous-Ultra-Ascension expressions. Purchase and reveal predicates are separate. `visibility()` supplies the sole visible node set used by the map, edges, search, details and totals, plus milestone control predicates. Visible locked nodes remain present. Search ignores case, accents and apostrophe variants. Hiding spoilers closes an inspector that is no longer revealed. The catalog is bundled into a static site; spoiler protection governs the UI rather than data-access permissions.

Milestones represent the actual item received/crafted or Upgrade bought. Checklist controls retain consuming branches’ other native gates and require ordinary prerequisites or existing consumer ownership. They exclude their own milestone condition. An isolated consumer without ordinary prerequisites requires prior ownership; Show spoilers is the explicit first-entry route. This is an app UI policy, not a guessed game dependency.

`planPurchase()` clones progress, fills immediate prerequisites, stops for each unsatisfied OR decision, and blocks unrecorded external items or pending activation. It checks reveal gates after filling prerequisites so hidden story requirements cannot be bypassed. No partial plan is committed. Already activated Astrals require a separate confirmation when entering existing progress. Removal previews cascade to a fixed point, preserve valid alternate paths and retain earlier ownership. The last 20 snapshots support session-only undo.

## Ultra Ascension

Ownership, purchase epoch and activation remain independent. A reset activates eligible owned Astral locks, keeps Astrals, retains existing targets of active native retention sources, clears repeat purchases, keeps milestones and advances the epoch. Retention exceptions never award absent upgrades. Each later reset reevaluates the active source conditions. Native source/target pairs and ordering are documented in scripts/logic/README.md. Unknown IDs survive updates and resets because their future rules are unknown.

Recording prior Ultra Ascensions enters existing history without applying a reset. Counts cannot be lowered through that control. The app does not model SP/USP balances, Stones, Dark Divinity reset overrides or gameplay effects outside this tree.

## Storage and migration

`storage.ts` stores version 1 at `idle-slayer-ascension-map.profile.v1`. It validates exact fields, safe IDs, booleans, and nonnegative integer purchase epochs bounded by the profile epoch. Backups have a 4 MiB limit and validate before a restore preview. Catalog migration changes the revision while cloning and retaining every known/unknown purchase and milestone. No earlier profile schema exists; unsupported versions are rejected. Future schema changes need explicit migrations and round-trip/malformed-input tests.

Read failures report errors without silently deleting stored data. Write failures keep the in-memory session usable and expose retry/export. A reload restores the last successful save; undo is session-only. Clearing all progress requires a preview and remains undoable. Backups contain progress, never saves or Steam metadata.

## Rendering and verification

React Flow renders fixed nodes with editing/deletion disabled. Keyboard focus/selection and separate camera buttons support access without dragging. Search camera changes account for inspector layout and mobile sheet overlap and respect reduced motion. Headings use locally bundled Press Start 2P; descriptions use system text.

Vitest covers catalog receipts, game predicates, editing and storage. Playwright tests the production bundle on desktop/mobile for search centering, fixed positions, persistence, hidden search/details, restore, storage failures, keyboard interaction and responsive overflow. CI uploads only the gated dist folder. Git ignore, Vite deny rules and the release scan keep raw game inputs and tools out of the site.
