# Idle Slayer Ascension Map — initial design direction

This document defines the visual direction for the app. The bootstrap contains only a starter page; the map layouts and state treatments described below are implementation guidance.

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

- Use a pixel-style display face for short headings once a licensed font is selected. Use readable system sans-serif text for controls, descriptions, source notes and long costs; the bootstrap may use system fonts throughout.
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
