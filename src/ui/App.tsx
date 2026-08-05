import { useState } from 'react';
import { Sidebar, type Route } from './components/Sidebar';
import { WindowControls } from './components/WindowControls';
import { ResumeScreen } from './screens/ResumeScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import './App.css';

function App() {
  // Insights is the design's default landing tab, and the resume lives inside
  // it until the insights screen itself is designed.
  const [route, setRoute] = useState<Route>('insights');

  // macOS draws its own traffic lights, and a plain browser tab has no window
  // to control — both leave the strip empty.
  const ownsWindowButtons = Boolean(window.electron) && window.electron.platform !== 'darwin';

  return (
    <div className="app">
      <Sidebar route={route} onNavigate={setRoute} />

      <main className="screen">
        {(route === 'insights' || route === 'resume') && <ResumeScreen />}
        {/* Inbox and archive are the same list over a different slice. */}
        {route === 'inbox' && <InboxScreen key="inbox" view="inbox" />}
        {route === 'archive' && <InboxScreen key="archive" view="archive" />}
        {route === 'scan' && <ScanScreen />}
        {route === 'settings' && <SettingsScreen />}
      </main>

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
