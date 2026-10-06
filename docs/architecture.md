# Architecture and progress contract

`public/catalog.json` contains the complete reviewed catalog. Native IDs identify upgrades; titles may repeat. Decimal string costs format with `BigInt`, and native positions remain unchanged in the catalog. The Game layout converts Unity’s positive-up Y axis to the browser’s positive-down Y axis; pairwise game placement is preserved. The Web layout arranges the visible graph independently. `catalog.ts` validates structure, references and reachable purchase/reveal paths before rendering. Build tests compare records and icon bytes against the independently reviewed native registry receipt.

## Rules and spoilers

`rules.ts` evaluates explicit AND/OR, owned, active, milestone and previous-Ultra-Ascension expressions. Purchase and reveal predicates are separate. `visibility()` supplies the sole visible node set used by the map, edges, search, details and totals, plus milestone control predicates. Visible locked nodes remain present. Search ignores case, accents and apostrophe variants. Hiding spoilers closes an inspector that is no longer revealed. The catalog is bundled into a static site; spoiler protection governs the UI rather than data-access permissions.

Milestones represent the actual item received/crafted or Upgrade bought. Checklist controls retain consuming branches’ other native gates and require ordinary prerequisites or existing consumer ownership. They exclude their own milestone condition. An isolated consumer without ordinary prerequisites requires prior ownership; Show spoilers is the explicit first-entry route. This is an app UI policy, not a guessed game dependency.

`planPurchase()` clones progress, fills immediate prerequisites, stops for each unsatisfied OR decision, and blocks unrecorded external items or pending activation. It checks reveal gates after filling prerequisites so hidden story requirements cannot be bypassed. No partial plan is committed. Already activated Astrals require a separate confirmation when entering existing progress. Removal previews cascade to a fixed point, preserve valid alternate paths and retain earlier ownership. The last 20 snapshots support session-only undo.

## Next-upgrade suggestions

`recommendations.ts` computes a read-only result from the catalog, current profile and bundled `src/data/wiki-priorities.json`. Only unowned upgrades from the shared visibility result qualify, and their native reveal and purchase predicates must both be satisfied now. Explicit spoiler browsing does not bypass a native reveal gate. Pending owned Astral locks are excluded from repurchase; eligible new locks carry a delayed-activation note. The engine never fills prerequisites, selects an OR path, changes milestones or applies a reset.

The guide's ascending tier and row order decides priority among eligible mapped IDs. Its earliest non-supplementary occurrence supplies each rank; exact native cost and stable ID break ties. Stage labels describe the source rather than imposing extra epoch/USP requirements. If there are no eligible ranked IDs, the result uses an explicitly labeled exact-cost fallback. It distinguishes every visible upgrade being owned from unowned upgrades blocked by recorded requirements, without counting or naming hidden content.

The dialog presents a main suggestion and up to two alternatives with native effect, cost, guide section and source links. Show on map centers the selected ID in the current layout without changing progress. Record purchase delegates to the existing atomic purchase preview and undo history. Recommendations recompute after purchases, removal, milestones, activation, restore, undo and Ultra Ascension; no recommendation state enters the version 1 profile or JSON backup.

The source is wiki revision 7187, marked for game 7.0.0, reviewed against the complete native 7.2.0 catalog. It ranks 280 native IDs; eight remain explicitly unranked. Source identity, title aliases, duplicate-title costs/prerequisite witnesses and license evidence are recorded separately from game receipts. `docs/wiki-recommendations.md` describes deterministic refresh. Game costs and gates remain canonical, and no SP balance, total USP, equipment or personal-play-style optimization is inferred. The app fetches no wiki data at runtime.

## Ultra Ascension

Ownership, purchase epoch and activation remain independent. A reset activates eligible owned Astral locks, keeps Astrals, retains existing targets of active native retention sources, clears repeat purchases, keeps milestones and advances the epoch. Retention exceptions never award absent upgrades. Each later reset reevaluates the active source conditions. Native source/target pairs and ordering are documented in scripts/logic/README.md. Unknown IDs survive updates and resets because their future rules are unknown.

Recording prior Ultra Ascensions enters existing history without applying a reset. Counts cannot be lowered through that control. The app does not model SP/USP balances, Stones, Dark Divinity reset overrides or gameplay effects outside this tree.

## Storage and migration

`storage.ts` stores version 1 at `idle-slayer-ascension-map.profile.v1`. It validates exact fields, safe IDs, booleans, and nonnegative integer purchase epochs bounded by the profile epoch. Backups have a 4 MiB limit and validate before a restore preview. Catalog migration changes the revision while cloning and retaining every known/unknown purchase and milestone. No earlier profile schema exists; unsupported versions are rejected. Future schema changes need explicit migrations and round-trip/malformed-input tests.

Read failures report errors without silently deleting stored data. Write failures keep the in-memory session usable and expose retry/export. A reload restores the last successful save; undo is session-only. Clearing all progress requires a preview and remains undoable. Backups contain progress, never saves or Steam metadata.

## Steam save import

`save-codec.ts` reads only user-selected bytes, applies the reviewed UTF-16 XOR transport and validates the complete typed native model within a 4 MiB limit. Keys may repeat across native preference types but not within one array. `game-save-import.ts` requires native version 7.2.0, maps recognized stable IDs and the native UA count, and discards every unrelated preference. `data/save-import-receipt.json` records sanitized offline native evidence; [save-import.md](save-import.md) defines compatibility, mappings and refresh checks.

The importer creates a replacement snapshot without filling dependencies, selecting OR paths, inventing milestones or granting absent targets. Pending locks stay pending. Active Astrals and existing targets of active retention sources use a synthetic earlier-epoch baseline when the imported UA count is positive. The native save has no purchase timestamps, so this policy protects current retained ownership during later map edits without claiming to reconstruct history. Existing unknown map IDs remain; epochs above an older incoming counter are clamped with an explicit warning. Spoiler preference stays unchanged.

Progress opens the native file picker. A separate preview uses the shared visibility calculation for comparison counts and shows the incoming UA count and import notes. Apply uses normal history and validated storage; cancel, read failures and malformed inputs leave progress unchanged. Cancellation invalidates asynchronous reads so late completion cannot reopen or apply a stale snapshot. Applying an import also explicitly replaces inaccessible/corrupt map storage, like JSON restore; a write failure still leaves the session usable. Raw bytes and decoded native preferences never enter local storage, backups, logs or network requests. The game file remains read-only, and the importer has no automatic directory access or cloud login.

## Usage analytics and session recording

The static app loads the authorized self-hosted Umami tracker and recorder through a separate analytics boundary. UI handlers emit typed, bounded events; pure game rules, save decoding and profile persistence do not perform tracking. Loading, storage and import failures use fixed categories rather than arbitrary messages. Automatic camera recentering is not a user event, and overlapping React Flow selection callbacks must produce one semantic selection.

Tracking starts only after a separate preference read succeeds and permits it, and browser privacy signals are respected. The opt-out is not part of `Profile`, JSON backups or undo history; resets and restores cannot enable tracking. Preference read failures keep tracking off. Changing the preference reloads to stop recorder observers and network activity. If profile saving fails first, the user chooses export-and-reload, reload without backup or cancel. A failed tracking-preference write reloads with `#analytics=off`; keeping/bookmarking that URL preserves the visit opt-out without representing it as a persistent storage preference. Reloading clears session-only undo normally.

Recordings can capture the rendered visible map, upgrade states and ordinary interaction. Search text, file inputs, UA-counter inputs, save-import and JSON-restore previews, and raw error details are excluded from replay contents before the recorder initializes. Selected files and unrelated native preferences never enter event payloads or replay DOM. Replay blocking does not suppress the recorder's coarse heatmap click/scroll coordinates, and iframe recording is disabled. URLs are canonicalized and arbitrary queries/hashes are removed; campaign values follow the bounded allowlist in [analytics.md](analytics.md).

Analytics is an optional external service: script, network and API failures must leave every map feature usable. Local/CI browser checks intercept analytics requests and validate payloads and exclusions without contacting production. [analytics.md](analytics.md) is the operator guide and event/report contract.

## Rendering and verification

React Flow renders fixed nodes with editing/deletion disabled. `map-layout.ts` supplies card centers for the Game and Web modes. Web uses pinned Dagre layered ranking and crossing minimization, with sorted stable IDs and edges for deterministic placement. Only the shared visibility result enters layout, bounds and edge routing; hidden topology cannot reserve empty spaces or affect the Web arrangement. Native coordinates and game predicates are unchanged. Layout is memoized by the visible graph and mode, rather than search or purchase-state rendering.

Arrows point from connected prerequisites to their dependent upgrades. Selection emphasizes incident paths and neighbors, gently dims unrelated paths, and exposes visible incoming/outgoing neighbor buttons. Purchase requirements still show exact AND/OR and activation predicates; a line alone does not express that logic. Both modes preserve the selected ID. Layout and inspector expansion are session-only and never enter the progress backup schema.

Keyboard focus/selection and expandable directional camera buttons support access without dragging. Compact screens use two-row controls (one row in short landscape), a Map options dialog and a docked expandable inspector. Inspector dimensions resize the actual canvas; selection and layout changes center after that resize, and screen rotation recenters the selection. Search camera changes respect reduced motion. Headings use locally bundled Press Start 2P; descriptions use system text.

Vitest covers catalog receipts, game predicates, editing, storage and deterministic visible-only layouts. Playwright tests the production bundle on desktop/mobile for both layout modes, selected connection arrows, neighbor navigation, search centering, fixed positions, persistence, hidden search/details, restore, storage failures and keyboard interaction. It also checks compact and expanded inspectors at 320×568 and 844×390, verifies that selected nodes are unobscured, and rejects horizontal/vertical page overflow. CI uploads only the gated dist folder. Git ignore, Vite deny rules and the release scan keep raw game inputs and tools out of the site.
