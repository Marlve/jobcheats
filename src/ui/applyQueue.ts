import { useSyncExternalStore } from 'react';

/**
 * The apply queue: chosen jobs, worked through one at a time.
 *
 * It lives here, not in a screen, so changing tab does not end it, and it is
 * saved so a restart finds it where it was — held, because nothing is running
 * after a restart. Each job opens filled in and waits for you to read it and
 * press Submit yourself.
 */

/** What the queue needs of a job: enough to name it and open it. */
export type QueueJob = Pick<JobRow, 'id' | 'title' | 'company' | 'location' | 'url'>;

export interface QueueState {
  jobs: QueueJob[];
  index: number;
  /** working: opening the form and filling it. review: waiting on you. paused: held. */
  phase: 'working' | 'review' | 'paused';
  result: AutofillResult | null;
  /** Jobs marked applied through the queue, so the inbox can drop them from view. */
  applied: number[];
}

const KEY = 'applyQueue.v1';

function load(): QueueState | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!saved || !Array.isArray(saved.jobs) || typeof saved.index !== 'number') return null;
    return { jobs: saved.jobs, index: saved.index, phase: 'paused', result: null, applied: saved.applied ?? [] };
  } catch {
    return null;
  }
}

function save(next: QueueState | null) {
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify({ jobs: next.jobs, index: next.index, applied: next.applied }));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Not remembered across launches; the queue still runs.
  }
}

let state: QueueState | null = load();
/** Bumped to disown a press that is still running, so its late answer is ignored. */
let run = 0;
const listeners = new Set<() => void>();

function set(next: QueueState | null) {
  state = next;
  save(next);
  listeners.forEach((listener) => listener());
}

export const finished = (queue: QueueState) => queue.index >= queue.jobs.length;

/** Opens the current job and fills it. Also what "Autofill again" and Resume do. */
async function press() {
  const job = state && state.jobs[state.index];
  if (!state || !job?.url) return;

  const mine = ++run;
  set({ ...state, phase: 'working', result: null });

  const result = await window.electron.autofill(job.url);
  if (mine !== run || !state) return;
  set({ ...state, phase: 'review', result });
}

function advance(applied?: number) {
  if (!state) return;
  set({ ...state, index: state.index + 1, result: null, applied: applied === undefined ? state.applied : [...state.applied, applied] });
  if (!finished(state)) void press();
}

export const applyQueue = {
  start(jobs: QueueJob[]) {
    set({ jobs, index: 0, phase: 'working', result: null, applied: [] });
    void press();
  },

  refill: () => void press(),

  /** For a press that is stuck: its window is put away and the queue is held on this job. */
  async pause() {
    if (!state || state.phase !== 'working') return;
    run++;
    set({ ...state, phase: 'paused', result: null });
    await window.electron.cancelAutofill();
  },

  resume: () => void press(),

  skip: () => advance(),

  async markApplied() {
    const job = state && state.jobs[state.index];
    if (!job) return;
    await window.electron.updateJobStatus(job.id, 'applied');
    advance(job.id);
  },

  async stop() {
    const working = state?.phase === 'working';
    run++;
    set(null);
    if (working) await window.electron.cancelAutofill();
  },
};

export function useApplyQueue(): QueueState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
