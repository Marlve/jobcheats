export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC with no zone
 * marker, so it has to be pinned to UTC explicitly — otherwise it is read as
 * local time and every timestamp drifts by the offset.
 */
function toDate(value: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized);
}

export function formatDateTime(value: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Whole days from now until `value`, floored at 0. Null when there is no date. */
export function daysUntil(value: string | null): number | null {
  if (!value) return null;

  const then = toDate(value).getTime();
  if (Number.isNaN(then)) return null;

  return Math.max(0, Math.ceil((then - Date.now()) / 86_400_000));
}
