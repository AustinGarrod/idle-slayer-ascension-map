import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import type { DependencyEdgeData } from './DependencyEdge'

/** Native connections follow the centers' angle, independently of RF handles. */
export function NativeEdge({ id, data, style, markerEnd }: EdgeProps<Edge<DependencyEdgeData, 'native'>>) {
  const points = data?.points
  if (!points || points.length !== 2) return null
  const [source, target] = points
  const path = `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  return <>
    <path className="native-connection-outline" d={path} fill="none" stroke="#080605" strokeWidth={Number(style?.strokeWidth ?? 12) + 6} aria-hidden="true" />
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={0} />
  </>
}
