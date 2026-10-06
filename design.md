# Idle Slayer Ascension Map — design direction

This document defines the visual direction and reviewed Atlas layout for the app. Game preserves extracted native coordinates; Web provides a separate visible-only dependency arrangement. Responsive design changes controls and inspector placement without mutating either layout's source data. Catalog completeness and game-rule verification remain independent release requirements.

## Connection clarity and mobile feedback

Three new arrangements received an independent spacing and interaction review after feedback on crowded connections and small screens:

1. **Dual Atlas — selected:** Web orders prerequisite paths left to right; Game retains familiar native positions. A compact toolbar keeps the two choices visible. The review found that 320–359 px screens cannot accommodate a footer and three toolbar rows; compact screens now use two rows, a Map options dialog and a docked summary. Short landscape screens use one toolbar row and a side inspector, preserving a useful canvas.
2. **Branch lens:** Focus the map on a selected upgrade, its ancestors and immediate dependents. The review found clearer paths but an additional navigation state that needs an explicit return to the whole map. The implemented Atlas borrows incident-path emphasis and the expandable summary, while keeping the whole visible graph available.
3. **Upgrade navigator:** A visible-upgrade list becomes the primary navigation with a Map/List switch. The review found this strong for keyboards and narrow phones, but permanent list and detail rails would crowd tablets. Atlas retains title search and direct neighbor buttons without adding another browsing mode.

The chosen design uses directed paths with arrowheads, gold dashed incoming connections and magenta solid outgoing connections for the selected upgrade. Unrelated cards and paths become less prominent but remain available. Connected from and Leads to buttons navigate to visible neighbors; the exact purchase AND/OR and activation rules remain separate text. Web routing uses visible-only layered ranks and crossing minimization. Hidden nodes contribute neither spaces nor routes.

Compact details show the upgrade's icon, title, cost, status and purchase action. Show details expands the internally scrollable description, requirements, connections and sources. The inspector occupies an actual layout row or column so selected nodes cannot center behind it. The full footer moves into Map options. Four directional camera buttons appear only after opening Map navigation, while zoom and return-to-start remain immediately available. Browser acceptance includes 320×568 portrait, 844×390 landscape, compact/expanded details, internal scrolling and selected-node hit testing.

## Next-upgrade guidance

Three presentations were independently reviewed for the wiki-based suggestion feature:

1. **On-demand dialog — selected:** a visible Next upgrade button opens one main suggestion and two alternatives. The phone search row splits between search and a 94 px recommendation button without adding a toolbar row. The dialog scrolls internally; its first suggestion shows native benefit, exact cost, prerequisites-recorded status, guide priority and source. Show on map and Record purchase remain 44 px actions and appear before longer order/source details.
2. **Inline folding card:** keeping a suggested upgrade above or below the canvas improves discovery, but the added 60–140 px surface crowds the map and expanded inspector at 320×568 and in landscape. It was rejected for this iteration.
3. **Recommended node badge:** a map badge provides context without a new panel, but is hard to discover when offscreen or zoomed out and competes with purchase-state symbols. The chosen dialog instead offers Show on map, preserving current layout and progress.

The dialog says Prerequisites recorded rather than claiming an upgrade is affordable or universally optimal. A guide snapshot/native-version line makes the source distinction clear. Owned, hidden and gated upgrades cannot enter a suggestion or explanation; no upcoming hidden-node counts are exposed. New Astral locks identify their deferred activation. Empty states distinguish owned visible upgrades from blocked progress. Closing with Escape restores focus to the trigger, and selecting a map suggestion closes the dialog before centering and opening details. General ordering assumes mixed play; unrecorded SP/USP, equipment and play style are not optimized.

## Game-progress import

Three arrangements received an independent spacing and interaction review:

1. **Progress action and dedicated preview — selected:** Import game save opens the file picker, followed by a comparison dialog. Current and After import columns show only visible map counts plus the explicit UA counter. The header and 44 px Apply import/Cancel actions remain reachable while the content scrolls at 320×568 and 844×390. Labels and the generic Windows path wrap, and closing restores focus to the Progress import action.
2. **Inline file zone in Progress:** placing selection, comparison and warnings among backup/reset actions crowds phones and makes the apply action harder to distinguish. The selected design keeps the review in its own dialog.
3. **Map before/after overlay:** a graphical comparison adds a browsing state and reveals incoming topology before confirmation. Split maps also reduce the available phone canvas. The dialog instead uses the same visibility calculation as the map.

The preview explains replacement, retained unknown map entries and spoiler preference. It describes the retained-ownership baseline because exact purchase epochs are absent from the save. Other native data and hidden titles/counts do not appear. Errors are generic and retryable; choosing a file or cancelling never applies progress. The scope is the reviewed Steam format and local browser processing, with normal undo after confirmation.

## Analytics disclosure and preference

About & sources explains self-hosted usage analytics and session recordings in plain language, including that ordinary visible map progress can be recorded. Privacy & tracking keeps the separate tracking preference reachable on desktop and through Map options on compact screens. The control distinguishes persistent preference, browser privacy signals and the disabled `#analytics=off` URL, and explains that changing it reloads the page. If current progress cannot be saved first, explicit export-and-reload, reload without backup and cancel actions protect the in-memory session; do not automatically choose one. A tracking-preference write failure reloads to the disabled URL and describes this as a visit opt-out that can be kept/bookmarked, without claiming persistence.

Keep the disclosure inside existing scrollable dialog space with 44 px actions and keyboard focus support at 320×568 and 844×390. Avoid promising that replay exclusions remove all interaction metadata: blocked elements still contribute coarse heatmap click/scroll coordinates. File/import/restore/counter/search surfaces and raw error details receive replay exclusions without changing ordinary map usability. Analytics preference changes, progress undo and resets remain separate controls. [Analytics behavior and operator setup](docs/analytics.md) defines the exact contract.

## Initial concepts and independent layout review

Three distinct arrangements were reviewed before choosing Atlas. All three use the same spoiler-safe visibility result for the canvas, connections, search, details, milestones and totals. None adds hidden-node silhouettes or a miniature view that discloses hidden topology.

### 1. Atlas — selected

A compact horizontal toolbar sits above a wide canvas. Selecting an upgrade opens a 340 px desktop inspector beside the map. Camera controls remain at the lower left and local progress actions live in a dialog. On narrow screens the inspector becomes a bottom sheet, with search spanning the toolbar width.

Spacing and accessibility review: a fixed inspector leaves too little canvas at tablet sizes, so the desktop panel becomes a sheet at 960 px. The toolbar uses separate rows for identity, search and actions below that breakpoint. At 320 px, controls retain 44 px targets and search results stay inside the screen. The mobile sheet occupies at most half the map area; the canvas retains a useful region above it and moves camera buttons into that region. Long titles and costs wrap, while sheet and dialog contents scroll independently. Short headings use the locally bundled Press Start 2P font; descriptions and controls use system text. Selected-node centering must run after the inspector changes canvas dimensions, and reduced motion makes the camera change immediate.

Atlas was selected because its controls, search and details have predictable positions without dividing the desktop canvas into three columns. The implemented CSS uses charcoal/cocoa surfaces, restrained gold framing, magenta edges and state symbols paired with different outlines. Browser review identified two mobile overlaps: search results covered the spoiler control, and the camera grid covered a selected node. Results now begin below the entire toolbar. With a sheet open on phones, camera buttons use a narrow left rail and the map summary returns when details are closed, leaving room for the selected upgrade. Camera centering accounts for the sheet's actual height.

### 2. Field journal

A 240 px left rail combines title search, a visible-upgrade list and progress information. The native map sits in the middle, and selection opens a 320 px right inspector. On mobile, a map/list switch replaces the left rail and details open in a sheet.

Spacing and accessibility review: three columns become cramped below 1280 px, especially with enlarged text. The left rail would need to collapse before the inspector, retaining a keyboard-accessible visible-upgrade list in a dialog. Search rows need at least 64 px height for an icon, title and long cost. Map/list switching introduces an extra navigation step and must preserve focus and selection. This concept suits frequent list browsing but reduces the map's available area.

### 3. Expedition

The native map fills nearly the entire screen. A floating search bar, collapsible progress tray and overlay inspector surround it. Mobile search opens as a full dialog and selection opens a bottom sheet.

Spacing and accessibility review: overlays can conceal selected nodes and camera controls. The camera would need explicit insets equal to the inspector and tray, while every floating control needs a stable keyboard order. At 320 px, the search bar must become full-width and the progress tray must collapse to a single 44 px menu control. Increased text size makes simultaneous overlays impractical. This concept emphasizes immersion but needs more layout and focus management than Atlas.

## Visual reference

Use the [official Idle Slayer editor screenshot](https://idleslayer.com/img/press-kit/Editor%20Screenshot%202.png) and the installed game's Ascension tree as references. Inspect the installation before treating any screenshot or wiki diagram as a current layout. Preserve extracted game coordinates in the catalog and Game view; the Web diagram changes only presentation.

The app should feel related to Idle Slayer through charcoal and cocoa surfaces, gold framing, magenta tree connections and crisp pixel icons. Surround those game elements with readable controls and descriptions that work on desktop and mobile.

## Initial palette

These are initial app colors, not extracted game constants. Adjust them together when validating the map against the game and accessibility requirements.

| Role | Color | Usage |
| --- | --- | --- |
| Canvas | `#15120F` | Main backdrop behind the map. |
| Surface | `#231E19` | Toolbars, cards and detail panels. |
| Raised surface | `#2C241D` | Selected controls and panel sections. |
| Frame | `#D6AE61` | Gold borders and primary accents. |
| Bright gold | `#F1D79B` | Focus and emphasized labels. |
| Connection | `#B860AF` | Magenta paths between upgrades. |
| Text | `#F8EFD9` | Main readable text. |
| Muted text | `#BFB199` | Secondary descriptions and metadata. |
| Complete | `#94BA88` | Completion accent paired with a check mark. |
| Destructive | `#CD7C6C` | Reset/removal controls paired with text. |

Avoid broad gradients, glossy surfaces and oversized decoration. Use restrained shadows, clear borders and compact spacing so the tree remains the central visual element.

## Typography and assets

- Use the locally bundled Press Start 2P display face for short headings. It is supplied by `@fontsource/press-start-2p` under the SIL Open Font License; record its license with application dependencies. Use readable system sans-serif text for controls, descriptions, source notes and long costs.
- Bundle reviewed icons locally. Preserve their aspect ratios and original pixels; use nearest-neighbor rendering (`image-rendering: pixelated`) where appropriate and avoid blur from fractional scaling.
- Give every icon a consistent frame without cropping meaningful content. Keep icons sharp at ordinary zoom levels.
- Use semantic labels and accessible names alongside icons. Icon-only buttons need explicit accessible names and visible tooltips.

## Map and controls

- Keep each layout fixed. Game uses the native arrangement; Web uses the visible dependency graph. Pan and zoom the viewport instead of moving nodes. Give the starting region a clear return action.
- Place title search, the spoiler toggle and progress controls in a compact toolbar that remains reachable while exploring.
- Use a details side panel on desktop and a compact expandable docked panel on mobile. Show the selected upgrade's title, icon, cost, description, prerequisites, purchase/activation state and provenance clearly.
- Separate visible locked, available, purchased and pending-activation states with distinct symbols and outlines. Color can reinforce a state but must not be its only cue.
- Filter hidden upgrades and their connections out of the map and related UI consistently. Do not show placeholder silhouettes or search hints that reveal hidden branches unless the game's reveal rules call for them.
- Use clear preview dialogs for cascading removal and Ultra Ascension. Name the changes before the user applies them and provide undo for progress edits.

## Accessibility and motion

Ensure readable text contrast and an obvious keyboard focus ring. Give touch controls at least a 44-pixel target. Provide keyboard access to search results, upgrade details and progress actions; offer map navigation controls that do not depend only on dragging or a scroll wheel.

Keep motion brief and purposeful, such as centering a selected node. Respect reduced-motion preferences by making camera changes immediate. Do not add continuous animation behind the map.

## Acceptance checklist

- The map resembles the game without compromising readable text or controls.
- Native node placement and pixel icon proportions are preserved.
- State meaning remains clear in grayscale and with keyboard focus.
- Search and detail panels are usable on narrow screens and at increased text size.
- A spoiler-hidden screen exposes only content allowed by the shared visibility rules.
- Added fonts, icons and wiki text have recorded provenance and attribution.
