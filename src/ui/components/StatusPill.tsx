import { Tooltip } from './Tooltip';

/**
 * Job status. Everything you acted on except "Not for me" is archived — exempt
 * from the 7-day retention sweep, so the pill doubles as "this one is kept".
 */

const LABEL: Record<JobStatus, string> = {
  new: 'New',
  saved: 'Saved',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  turned_down: 'Turned down',
  withdrawn: 'Withdrew',
  rejected: 'Not for me',
};

const TITLE: Record<JobStatus, string> = {
  new: 'Not acted on yet — expires with the inbox',
  saved: 'Saved — kept indefinitely',
  applied: 'Applied — kept indefinitely',
  interview: 'Interviewing — kept indefinitely',
  offer: 'You have an offer — kept indefinitely',
  hired: 'Hired — kept indefinitely',
  turned_down: 'The employer said no — kept indefinitely',
  withdrawn: 'You withdrew — kept indefinitely',
  rejected: 'You passed on it — expires with the inbox',
};

/** Board names are stored lowercase; "Linkedin" is not how it is spelled. */
export const SOURCE_LABEL: Record<JobSource, string> = {
  linkedin: 'LinkedIn',
  seek: 'Seek',
  japandev: 'Japan Dev',
  watchlist: 'Watchlist',
};

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <Tooltip content={TITLE[status]}>
      <span className={`pill pill--${status}`}>{LABEL[status]}</span>
    </Tooltip>
  );
}
