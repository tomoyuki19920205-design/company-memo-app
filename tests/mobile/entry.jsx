import React from 'react';
import { createRoot } from 'react-dom/client';
import NewsMonitor from '../../components/NewsMonitor';
import AlertsPage from '../../components/tdnet-alerts/AlertsPage';
import CompanyViewer from '../../components/CompanyViewer';
import ScreenerPage from '../../components/ScreenerPage';
import { emitPinFixtureUpdate, emitPinFixtureInsert } from './supabase';
const screen = new URLSearchParams(location.search).get('screen');
const pinFixture = new URLSearchParams(location.search).has('pinFixture');
createRoot(document.getElementById('root')).render(<>
  {pinFixture && <aside>
    <button onClick={emitPinFixtureUpdate}>UPDATE受信・再取得・並べ替え</button>
    <button onClick={emitPinFixtureInsert}>INSERT受信</button>
  </aside>}
  {screen === 'news' ? <NewsMonitor /> : screen === 'tdnet' ? <AlertsPage userId="mobile-test" userEmail="mobile@example.test" /> : screen === 'screening' ? <ScreenerPage /> : <CompanyViewer />}
</>);
