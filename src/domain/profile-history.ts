/** Bounded visit-only labels: never store titles, hidden identities, filenames or counts. */
const labels = {
  change: 'Progress change', purchase: 'Purchase recording', removal: 'Purchase removal',
  milestone: 'Milestone recording', milestone_removal: 'Milestone removal',
  astral_activation: 'Astral activation', ultra_ascension: 'Ultra Ascension',
  prior_ascensions: 'Previous ascension history', clear: 'Clear progress', restore: 'JSON restore',
  game_import: 'Game save import', recovery: 'Progress recovery', spoilers: 'Spoiler setting',
} as const

export type HistoryAction = keyof typeof labels
export function historyActionLabel(action: HistoryAction): string { return labels[action] }
