/**
 * Sorting saved and applied jobs into the branches of the pipeline diagram.
 * Pure: rows in, graph out, so every branch can be checked on its own.
 *
 * A job lands in exactly one end point, decided by where it is now and where it
 * has been. The history is what keeps a job that was turned down after an
 * interview on the interview branch — its current status alone would say it was
 * turned down straight after applying.
 */

export interface PipelineRow {
  status: JobStatus
  /** Every status the job has ever been moved to. */
  reached: JobStatus[]
}

type Leaf =
  | 'savedOnly'
  | 'droppedEarly'
  | 'waiting'
  | 'turnedDownApply'
  | 'withdrewApply'
  | 'interviewing'
  | 'offer'
  | 'hired'
  | 'turnedDownInterview'
  | 'withdrewInterview'

const PAST_APPLYING = new Set<JobStatus>(['applied', 'interview', 'offer', 'hired', 'turned_down'])
const PAST_INTERVIEW = new Set<JobStatus>(['interview', 'offer', 'hired'])

function has(row: PipelineRow, group: Set<JobStatus>): boolean {
  return group.has(row.status) || row.reached.some(status => group.has(status))
}

export function leafOf(row: PipelineRow): Leaf | null {
  const interviewed = has(row, PAST_INTERVIEW)

  switch (row.status) {
    case 'saved': return 'savedOnly'
    case 'applied': return 'waiting'
    case 'interview': return 'interviewing'
    case 'offer': return 'offer'
    case 'hired': return 'hired'
    case 'turned_down': return interviewed ? 'turnedDownInterview' : 'turnedDownApply'
    case 'withdrawn':
      if (interviewed) return 'withdrewInterview'
      return has(row, PAST_APPLYING) ? 'withdrewApply' : 'droppedEarly'
    default: return null
  }
}

const NODES: Omit<PipelineNode, 'value'>[] = [
  { id: 'tracked', label: 'Saved or applied', rank: 0, tone: 'neutral' },
  { id: 'savedOnly', label: 'Saved, not applied', rank: 1, tone: 'muted' },
  { id: 'droppedEarly', label: 'Dropped before applying', rank: 1, tone: 'muted' },
  { id: 'applied', label: 'Applied', rank: 1, tone: 'info' },
  { id: 'waiting', label: 'Waiting to hear back', rank: 2, tone: 'warn' },
  { id: 'turnedDownApply', label: 'Turned down, no interview', rank: 2, tone: 'danger' },
  { id: 'withdrewApply', label: 'Withdrew', rank: 2, tone: 'muted' },
  { id: 'interviewed', label: 'Reached interviews', rank: 2, tone: 'info' },
  { id: 'interviewing', label: 'Interviewing', rank: 3, tone: 'info' },
  { id: 'offer', label: 'Offer', rank: 3, tone: 'success' },
  { id: 'hired', label: 'Hired', rank: 3, tone: 'success' },
  { id: 'turnedDownInterview', label: 'Turned down after interviewing', rank: 3, tone: 'danger' },
  { id: 'withdrewInterview', label: 'Withdrew after interviewing', rank: 3, tone: 'muted' },
]

export function buildPipeline(rows: PipelineRow[]): PipelineGraph {
  const count: Record<string, number> = {}
  for (const row of rows) {
    const leaf = leafOf(row)
    if (leaf) count[leaf] = (count[leaf] ?? 0) + 1
  }
  const n = (id: string) => count[id] ?? 0

  const interviewed = n('interviewing') + n('offer') + n('hired') + n('turnedDownInterview') + n('withdrewInterview')
  const applied = n('waiting') + n('turnedDownApply') + n('withdrewApply') + interviewed
  const value: Record<string, number> = {
    ...count,
    tracked: n('savedOnly') + n('droppedEarly') + applied,
    applied,
    interviewed,
  }

  const links: PipelineLink[] = [
    ['tracked', 'savedOnly'],
    ['tracked', 'droppedEarly'],
    ['tracked', 'applied'],
    ['applied', 'waiting'],
    ['applied', 'turnedDownApply'],
    ['applied', 'withdrewApply'],
    ['applied', 'interviewed'],
    ['interviewed', 'interviewing'],
    ['interviewed', 'offer'],
    ['interviewed', 'hired'],
    ['interviewed', 'turnedDownInterview'],
    ['interviewed', 'withdrewInterview'],
  ].map(([source, target]) => ({ source, target, value: value[target] ?? 0 }))

  return {
    nodes: NODES.map(node => ({ ...node, value: value[node.id] ?? 0 })).filter(node => node.value > 0),
    links: links.filter(link => link.value > 0),
    total: value.tracked,
  }
}
