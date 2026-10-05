# Idle Slayer Ascension Map — design direction

This document defines the visual direction and reviewed Atlas layout for the app. The map preserves extracted native coordinates; responsive design changes the surrounding controls and camera, not the tree layout. Catalog completeness and game-rule verification remain independent release requirements.

## Concepts and independent layout review

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

Use the [official Idle Slayer editor screenshot](https://idleslayer.com/img/press-kit/Editor%20Screenshot%202.png) and the installed game's Ascension tree as references. Inspect the installation before treating any screenshot or wiki diagram as a current layout. Preserve extracted game coordinates rather than arranging nodes for an invented diagram.

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

- Keep the tree fixed in its native arrangement. Pan and zoom the viewport instead of moving nodes. Give the starting region a clear return action.
- Place title search, the spoiler toggle and progress controls in a compact toolbar that remains reachable while exploring.
- Use a details side panel on desktop and a bottom sheet on mobile. Show the selected upgrade's title, icon, cost, description, prerequisites, purchase/activation state and provenance clearly.
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
