# Idle Slayer Ascension Map — design direction

This document defines the visual direction and reviewed Atlas layout for the app. **Game Layout** (the Game view below) preserves extracted native coordinates; **Detailed Layout** (previously Web) provides a separate visible-only dependency arrangement. Game Layout is the initial default, and the last explicit choice is remembered in separate local storage. Responsive design changes controls and inspector placement without mutating either layout's source data. Catalog completeness and game-rule verification remain independent release requirements.

## Connection clarity and mobile feedback

Three new arrangements received an independent spacing and interaction review after feedback on crowded connections and small screens:

1. **Dual Atlas — selected:** Web orders prerequisite paths left to right; Game retains familiar native positions. A compact toolbar keeps the two choices visible. The review found that 320–359 px screens cannot accommodate a footer and three toolbar rows; compact screens now use two rows, a Map options dialog and a docked summary. Short landscape screens use one toolbar row and a side inspector, preserving a useful canvas.
2. **Branch lens:** Focus the map on a selected upgrade, its ancestors and immediate dependents. The review found clearer paths but an additional navigation state that needs an explicit return to the whole map. The implemented Atlas borrows incident-path emphasis and the expandable summary, while keeping the whole visible graph available.
3. **Upgrade navigator:** A visible-upgrade list becomes the primary navigation with a Map/List switch. The review found this strong for keyboards and narrow phones, but permanent list and detail rails would crowd tablets. Atlas retains on-demand title/effect discovery and direct neighbor buttons without adding another browsing mode.

The chosen design uses directed paths with arrowheads, gold dashed incoming connections and magenta solid outgoing connections for the selected upgrade. Unrelated cards and paths become less prominent but remain available. Connected from and Leads to buttons navigate to visible neighbors; the exact purchase AND/OR and activation rules remain separate text. Web routing uses visible-only layered ranks and crossing minimization. Hidden nodes contribute neither spaces nor routes. Game's later native presentation refinement is described below.

The search overlay also browses all visible upgrades with an empty query and a Progress state filter. Its scrollable list has no result cap; the existing count/close header stays reachable while scrolling. Native Tab focus keeps each result title clear of that measured sticky header, including tall rows at enlarged browser text sizes. Rows pair state text and symbols with exact costs and short native effect excerpts, with stable IDs for duplicate visible titles. Available means the native purchase and reveal gates are recorded; no SP balance is inferred. Controls stay inside the on-demand overlay so the ordinary toolbar and map retain their space. Filters and search affect discovery only, and hidden upgrades never contribute rows, counts or duplicate-title hints.

## Native Game presentation refinement

Three Game-only concepts received an independent spacing and accessibility review after feedback that the large cards changed the game's appearance and obscured its lines:

1. **Native icon frames — selected:** use the reviewed 100×100 circular frame and 64×64 icon proportions, with transient hover/focus titles and selection details. Native straight lines follow the actual center-to-center angle and end at the circle boundary. The review found this preserves recognizable branches and clears all card overlaps without moving a native coordinate. The starting zoom is 0.6; selection uses 0.85, giving 60 px and 85 px targets while showing more surrounding branches.
2. **Labeled medallions:** circular icons with permanent titles below them and curved connections. Long titles consume diagonal line corridors at 320×568 and 844×390; curves change the native branch shape. The selected concept uses the game's circles but avoids permanent title blocks and curved paths.
3. **Smaller text cards:** 100×90 rectangles retaining titles and cardinal-side connections. These reduce crowding, but long titles still require several lines, and side-midpoint connections change native diagonal angles. They remain less faithful than native icon frames.

Game retains the extracted coordinates with only screen Y reflection. Its native 12-unit line thickness and grey/bright-magenta colors replace the thin Web strokes; a dark under-stroke separates crossing paths. Grey means an unowned prerequisite, magenta an owned prerequisite. Selection uses 14-unit paths, gold dashed incoming lines and solid magenta outgoing lines, with smaller arrowheads shown only on those incident paths. Connections remain behind icons. These presentation cues do not redefine purchase or activation requirements.

Titles never change the circular tile's dimensions. Hover and keyboard focus reveal a wrapped label; touch selection exposes the same title in the existing inspector. Full title/state/cost ARIA labels, non-color state symbols, keyboard focus and fixed positioning remain. Camera insets use Game's actual dimensions so its selected frame clears phone controls. Detailed Layout's 132×122 cards, labels, routes, colors and camera scales remain unchanged. Native prefab and line evidence is recorded in [data.md](docs/data.md#native-ui-presentation).

The layout buttons read Game Layout and Detailed Layout, with Game first. At the default browser text size, the compact toolbar keeps its existing two rows: wider buttons wrap their labels into two lines on narrow phones, while the brand also wraps as needed. Short landscape retains one row and single-line layout labels. A separate third layout row was rejected for this ordinary text size because it consumes another 44 px of map space; keeping full labels beside the unchanged brand was too wide at 320 px. Targets remain at least 44 px, and the stored selection does not enter progress backups or undo.

Larger browser text grows the toolbar rows and layout-button columns instead of clipping their labels. Font-relative breakpoints switch narrow views to three rows for identity/menu, layout choices, and search/Next upgrade. The search icon's inset also scales with text. When the enlarged toolbar and usable map area exceed the viewport height, the page can scroll vertically; controls and labels stay within its width. Browser acceptance uses an actual 32px Chromium default font at 320×568, with both layouts, rather than a CSS font override. Default-size portrait and landscape arrangements remain unchanged.

Compact details show the upgrade's icon, title, cost, status and purchase action. Show details expands the internally scrollable description, requirements, connections and sources. The inspector occupies an actual layout row or column so selected nodes cannot center behind it. The full footer moves into Map options. Four directional camera buttons appear only after opening Map navigation, while zoom and return-to-start remain immediately available. Browser acceptance includes 320×568 portrait, 844×390 landscape, 568×320 and 375×350 short windows, compact/expanded details, internal scrolling and selected-node hit testing. Short windows use measured available space: 480–639px landscape widths place details beside the canvas, and narrower views reduce the map reservation so dismissal and purchase actions remain reachable. Selection fits the smaller canvas and uses space beside camera controls when needed; normal portrait allocation remains intact.

## Visible map overview

Overview is an on-demand camera mode, reached through Map options or the compact desktop Map view button. It temporarily hides the inspector so the revealed graph can use the existing canvas; selection and inspector expansion are retained for return. It shows the complete visible node shape with normal branch contrast and a short orientation caption. Nodes can become very small, so the existing return-to-start camera slot changes to Return to inspection while a selection exists, or Return to previous view otherwise. Refocus selected upgrade in Map options remains available during ordinary exploration.

This adds no permanent minimap, camera button or phone panel. The four existing camera targets keep their footprint. Overview leaves room below its caption and above camera controls, fits only current shared visible frames, and uses the current reduced-motion preference. Refocus restores the existing useful node scale and responsive inspection insets. Spoiler changes retain the exact camera instead of widening or resetting the view automatically.

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
- Style the spoiler checkbox with the toolbar's brown surface and gold framing, a visible check mark and a label-wide keyboard focus ring. Keep the map's pan and zoom when spoilers change, including when a selected hidden upgrade's inspector closes.
- Use a details side panel on desktop and a compact expandable docked panel on mobile. Show the selected upgrade's title, icon, cost, description, prerequisites, purchase/activation state and provenance clearly.
- Separate visible locked, available, purchased and pending-activation states with distinct symbols and outlines. Color can reinforce a state but must not be its only cue.
- Filter hidden upgrades and their connections out of the map and related UI consistently. Do not show placeholder silhouettes or search hints that reveal hidden branches unless the game's reveal rules call for them.
- Use clear preview dialogs for cascading removal and Ultra Ascension. Name the changes before the user applies them and provide undo for progress edits.

## Accessibility and motion

Ensure readable text contrast and an obvious keyboard focus ring. Give touch controls at least a 44-pixel target. Provide keyboard access to search results, upgrade details and progress actions; offer map navigation controls that do not depend only on dragging or a scroll wheel.

Keyboard graph exploration has one Tab stop. Arrow keys browse previous/next visible upgrades in catalog order, with Home/End shortcuts and the existing selection keys. Focus centers the upgrade using the map's camera insets and retains the gold ring. A focus-revealed shortcut allows direct camera access before entering the graph; Tab and Shift+Tab leave the graph immediately. Its brief instructions and the Keyboard map controls dialog explain the order, exits and screen-reader interaction mode. The shortcut disappears after focus leaves it, preserving the ordinary map layout. Keyboard exploration closes the directional pan panel so focused upgrades remain usable beside camera controls even in a short expanded-inspector canvas; Map navigation reopens all pan actions.

Keep motion brief and purposeful, such as centering a selected node. Respect reduced-motion preferences by making camera changes immediate. Do not add continuous animation behind the map.

## Acceptance checklist

- The map resembles the game without compromising readable text or controls.
- Native node placement and pixel icon proportions are preserved.
- State meaning remains clear in grayscale and with keyboard focus.
- Search and detail panels are usable on narrow screens and at increased text size.
- A spoiler-hidden screen exposes only content allowed by the shared visibility rules.
- Added fonts, icons and wiki text have recorded provenance and attribution.
