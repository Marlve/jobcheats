import { useEffect, useState } from 'react';
import { Sidebar, type Route } from './components/Sidebar';
import { hasUpdateNotice, UpdateBanner } from './components/UpdateBanner';
import { WindowControls } from './components/WindowControls';
import { ResumeScreen } from './screens/ResumeScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ScanScreen } from './screens/ScanScreen';
import { PipelineScreen } from './screens/PipelineScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import './App.css';

const NARROW_WINDOW = '(max-width: 840px)';
const COLLAPSED_KEY = 'sidebar.collapsed';

/** Storage can be blocked or empty; the sidebar should still open. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function App() {
  // Insights is the design's default landing tab, and the resume lives inside
  // it until the insights screen itself is designed.
  const [route, setRoute] = useState<Route>('insights');

  // The sidebar is an icon rail when collapsed by hand, and always in a narrow
  // window, where the content needs the room more than the labels do.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_WINDOW).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW_WINDOW);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Not remembered across launches; nothing else depends on it.
    }
  }

  const rail = collapsed || narrow;

  // The notice lives here rather than on a screen: it is about the app, and it
  // should not vanish because you changed tab.
  const [update, setUpdate] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    // Asked for first: this is the stored answer from an earlier run, so a
    // notice is up immediately rather than after a round trip to GitHub.
    void window.electron.getUpdateStatus().then(setUpdate);

    // The launch check finishes after this component mounted, so its result
    // arrives on a channel rather than being polled for.
    return window.electron.subscribeUpdateStatus(setUpdate);
  }, []);

  async function dismissUpdate() {
    if (!update?.latestVersion) return;
    setUpdate(await window.electron.dismissUpdate(update.latestVersion));
  }

  const showUpdate = hasUpdateNotice(update);

  // macOS draws its own traffic lights, and a plain browser tab has no window
  // to control — both leave the strip empty.
  const ownsWindowButtons = Boolean(window.electron) && window.electron.platform !== 'darwin';

  return (
    <div className={`app${showUpdate ? ' app--notified' : ''}${rail ? ' app--rail' : ''}`}>
      <Sidebar
        route={route}
        onNavigate={setRoute}
        rail={rail}
        onToggleRail={narrow ? undefined : toggleCollapsed}
      />

      <main className="screen">
        {(route === 'insights' || route === 'resume') && <ResumeScreen />}
        {/* Inbox and archive are the same list over a different slice. */}
        {route === 'inbox' && <InboxScreen key="inbox" view="inbox" />}
        {route === 'archive' && <InboxScreen key="archive" view="archive" />}
        {route === 'pipeline' && <PipelineScreen />}
        {route === 'scan' && <ScanScreen />}
        {route === 'profile' && <ProfileScreen />}
        {route === 'settings' && <SettingsScreen />}
      </main>

      {showUpdate && update && <UpdateBanner status={update} onDismiss={dismissUpdate} />}

      {/* Must stay last. The drag region is a single shape the OS hit-tests
          against, and it is built by walking the DOM in order — adding each
          `drag` rect and cutting out each `no-drag` one. Anything draggable
          that comes after these buttons is added back on top of them, and the
          clicks go to the title bar instead of the button. */}
      {ownsWindowButtons && <WindowControls />}
    </div>
  );
}

export default App;
