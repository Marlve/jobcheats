import { Tooltip } from './Tooltip';

/**
 * Job status. Saved and applied are archived — they are exempt from the 7-day
 * retention sweep, so the pill doubles as "this one is kept".
 */

const LABEL: Record<JobStatus, string> = {
  new: 'New',
  saved: 'Saved',
  applied: 'Applied',
  rejected: 'Rejected',
};

const TITLE: Record<JobStatus, string> = {
  new: 'Not acted on yet — expires with the inbox',
  saved: 'Saved — kept indefinitely',
  applied: 'Applied — kept indefinitely',
  rejected: 'Rejected — expires with the inbox',
};

/** Board names are stored lowercase; "Linkedin" is not how it is spelled. */
export const SOURCE_LABEL: Record<JobSource, string> = {
  linkedin: 'LinkedIn',
  seek: 'Seek',
};

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <Tooltip content={TITLE[status]}>
      <span className={`pill pill--${status}`}>{LABEL[status]}</span>
    </Tooltip>
  );
}
