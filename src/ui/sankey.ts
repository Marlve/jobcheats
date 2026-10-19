/**
 * Positions for a Sankey diagram: boxes in columns, with ribbons between them
 * whose thickness is the count they carry. Pure, so the SVG that draws it has
 * nothing to decide.
 */

export interface PlacedNode extends PipelineNode {
  x: number
  y: number
  width: number
  height: number
}

export interface PlacedLink extends PipelineLink {
  /** SVG path of the filled ribbon. */
  d: string
}

export interface SankeyLayout {
  nodes: PlacedNode[]
  links: PlacedLink[]
  width: number
  height: number
}

const NODE_WIDTH = 16
const NODE_GAP = 14
/** Room beside the columns for the labels, which sit outside the boxes. */
const PADDING = { top: 16, right: 210, bottom: 16, left: 120 }
/** A box thinner than this would be invisible, so it is drawn at least this tall. */
const MIN_HEIGHT = 4

export function layoutSankey(graph: PipelineGraph, width = 920, height = 420): SankeyLayout {
  const nodes = graph.nodes.filter(node => node.value > 0)
  if (!nodes.length) return { nodes: [], links: [], width, height }

  const ranks = [...new Set(nodes.map(node => node.rank))].sort((a, b) => a - b)
  const innerWidth = width - PADDING.left - PADDING.right - NODE_WIDTH
  const innerHeight = height - PADDING.top - PADDING.bottom
  const columnGap = ranks.length > 1 ? innerWidth / (ranks.length - 1) : 0

  // One scale for the whole diagram, set by the most crowded column, so a count
  // of 3 is the same thickness wherever it appears.
  const scale = Math.min(...ranks.map(rank => {
    const column = nodes.filter(node => node.rank === rank)
    const total = column.reduce((sum, node) => sum + node.value, 0)
    return (innerHeight - (column.length - 1) * NODE_GAP) / total
  }))

  const placed = new Map<string, PlacedNode>()
  for (const [index, rank] of ranks.entries()) {
    const column = nodes.filter(node => node.rank === rank)
    const used = column.reduce((sum, node) => sum + Math.max(node.value * scale, MIN_HEIGHT), 0)
      + (column.length - 1) * NODE_GAP
    let y = PADDING.top + Math.max(0, innerHeight - used) / 2

    for (const node of column) {
      const boxHeight = Math.max(node.value * scale, MIN_HEIGHT)
      placed.set(node.id, { ...node, x: PADDING.left + index * columnGap, y, width: NODE_WIDTH, height: boxHeight })
      y += boxHeight + NODE_GAP
    }
  }

  // Each ribbon takes the next free slice of the box it leaves and the box it
  // enters, top to bottom, which is what stops them crossing needlessly.
  const outUsed = new Map<string, number>()
  const inUsed = new Map<string, number>()
  const ordered = [...graph.links].sort((a, b) =>
    (placed.get(a.target)?.y ?? 0) - (placed.get(b.target)?.y ?? 0))

  const links: PlacedLink[] = []
  for (const link of ordered) {
    const from = placed.get(link.source)
    const to = placed.get(link.target)
    if (!from || !to || link.value <= 0) continue

    const thickness = link.value * scale
    const y0 = from.y + (outUsed.get(from.id) ?? 0)
    const y1 = to.y + (inUsed.get(to.id) ?? 0)
    outUsed.set(from.id, (outUsed.get(from.id) ?? 0) + thickness)
    inUsed.set(to.id, (inUsed.get(to.id) ?? 0) + thickness)

    const x0 = from.x + from.width
    const x1 = to.x
    const mid = (x0 + x1) / 2
    links.push({
      ...link,
      d: `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 + thickness} `
        + `C${mid},${y1 + thickness} ${mid},${y0 + thickness} ${x0},${y0 + thickness} Z`,
    })
  }

  return { nodes: [...placed.values()], links, width, height }
}
