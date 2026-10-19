import {
  IconArchive,
  IconInbox,
  IconInsights,
  IconLock,
  IconPipeline,
  IconScan,
  IconSettings,
  IconUser,
} from './Icons';

export type Route = 'insights' | 'inbox' | 'archive' | 'pipeline' | 'scan' | 'profile' | 'settings' | 'resume';

const NAV: { route: Route; label: string; Icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { route: 'insights', label: 'Insights', Icon: IconInsights },
  { route: 'inbox', label: 'Inbox', Icon: IconInbox },
  { route: 'archive', label: 'Archive', Icon: IconArchive },
  { route: 'pipeline', label: 'Pipeline', Icon: IconPipeline },
  { route: 'scan', label: 'Daily scan', Icon: IconScan },
  { route: 'profile', label: 'Profile', Icon: IconUser },
  { route: 'settings', label: 'Settings', Icon: IconSettings },
];

export function Sidebar({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
}) {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true" />
        <span className="t-title sidebar__label">JobCheats</span>
      </div>

      <ul className="sidebar__nav">
        {NAV.map(({ route: target, label, Icon }) => (
          <li key={target}>
            <button
              type="button"
              className={`sidebar__link${route === target ? ' sidebar__link--active' : ''}`}
              onClick={() => onNavigate(target)}
              aria-current={route === target ? 'page' : undefined}
              // The label is hidden on narrow windows, so name the control here.
              title={label}
              aria-label={label}
            >
              <Icon size={17} />
              <span className="sidebar__label">{label}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* The app holds a resume and a live LinkedIn session, so say plainly
          where that data goes. */}
      <div
        className="sidebar__privacy"
        title="Local only — no account, no cloud, no telemetry."
      >
        <span className="sidebar__privacy-title">
          <IconLock size={14} />
          <span className="sidebar__label">Local only</span>
        </span>
        <p className="t-caption t-muted sidebar__label">
          No account, no cloud, no telemetry. Your resume and LinkedIn session never leave this
          device.
        </p>
      </div>
    </nav>
  );
}
