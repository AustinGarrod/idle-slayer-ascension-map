import type { MapCenter } from './map-layout'

export const OVERVIEW_MIN_ZOOM = 0.0001
export interface OverviewViewport { x: number; y: number; zoom: number }
export interface OverviewArea { x: number; y: number; width: number; height: number }

/** Fits visible node frames only. Hidden centers, IDs and routes never affect the result. */
export function visibleOverviewViewport({ centers, visibleIds, nodeWidth, nodeHeight, area }: {
  centers: ReadonlyMap<string, MapCenter>; visibleIds: ReadonlySet<string>
  nodeWidth: number; nodeHeight: number; area: OverviewArea
}): OverviewViewport | null {
  if (![nodeWidth, nodeHeight, area.width, area.height].every((value) => Number.isFinite(value) && value > 0)
    || ![area.x, area.y].every(Number.isFinite)) return null
  const points: MapCenter[] = []
  for (const id of visibleIds) {
    const center = centers.get(id)
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return null
    points.push(center)
  }
  if (!points.length) return null
  const minX = Math.min(...points.map((point) => point.x)) - nodeWidth / 2
  const maxX = Math.max(...points.map((point) => point.x)) + nodeWidth / 2
  const minY = Math.min(...points.map((point) => point.y)) - nodeHeight / 2
  const maxY = Math.max(...points.map((point) => point.y)) + nodeHeight / 2
  const zoom = Math.min(1, area.width / (maxX - minX), area.height / (maxY - minY))
  if (!Number.isFinite(zoom) || zoom < OVERVIEW_MIN_ZOOM) return null
  return { x: area.x + area.width / 2 - (minX + maxX) / 2 * zoom,
    y: area.y + area.height / 2 - (minY + maxY) / 2 * zoom, zoom }
}
