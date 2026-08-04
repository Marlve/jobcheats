import { useState } from 'react';
import { Sidebar, type Route } from './components/Sidebar';
import { ResumeScreen } from './screens/ResumeScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import './App.css';

function App() {
  // Insights is the design's default landing tab, and the resume lives inside
  // it until the insights screen itself is designed.
  const [route, setRoute] = useState<Route>('insights');

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
    </div>
  );
}

export default App;
