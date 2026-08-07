import { IconCross, IconDownload, IconExternal } from './Icons';

interface UpdateBannerProps {
  status: UpdateStatus;
  onDismiss: () => void;
}

/**
 * Whether there is anything worth interrupting someone about.
 *
 * A dismissal is remembered against the version it was for, compared by plain
 * equality: the next release is a different string, so waving one notice away
 * silences that release rather than the feature.
 */
export function hasUpdateNotice(status: UpdateStatus | null): boolean {
  if (!status || status.state !== 'available' || !status.latestVersion) return false;
  return status.latestVersion !== status.dismissedVersion;
}

/**
 * The new-version notice.
 *
 * Pinned to the bottom of the window rather than pushed into a screen: it
 * belongs to the app rather than to whatever you happen to be looking at, and
 * every screen already owns its own header and scrolling body.
 *
 * The download is a link out to the release page, not a button that installs
 * anything — the app does not update itself, and the notice should not imply
 * that it might.
 */
export function UpdateBanner({ status, onDismiss }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status">
      <span className="update-banner__icon"><IconDownload size={17} /></span>

      <div className="update-banner__main">
        <p className="t-label">
          Version {status.latestVersion} is available
          <span className="t-secondary"> — you have {status.currentVersion}.</span>
        </p>
        {status.releaseNotes && (
          <p className="t-caption t-muted update-banner__notes">{status.releaseNotes}</p>
        )}
      </div>

      {/* target=_blank is handed to the default browser by the main process, so
          this opens where you are already signed in rather than in a bare
          Electron window. */}
      <a
        className="btn btn--secondary btn--sm"
        href={status.releaseUrl}
        target="_blank"
        rel="noreferrer"
      >
        <IconExternal size={14} /> Download
      </a>

      <button
        type="button"
        className="update-banner__close"
        aria-label={`Dismiss the notice for version ${status.latestVersion}`}
        onClick={onDismiss}
      >
        <IconCross size={14} />
      </button>
    </div>
  );
}
