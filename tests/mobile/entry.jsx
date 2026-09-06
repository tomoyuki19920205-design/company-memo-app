import React from 'react';
import { createRoot } from 'react-dom/client';
import NewsMonitor from '../../components/NewsMonitor';
import AlertsPage from '../../components/tdnet-alerts/AlertsPage';
import CompanyViewer from '../../components/CompanyViewer';
import ScreenerPage from '../../components/ScreenerPage';
const screen = new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')).render(screen === 'news' ? <NewsMonitor /> : screen === 'tdnet' ? <AlertsPage userId="mobile-test" userEmail="mobile@example.test" /> : screen === 'screening' ? <ScreenerPage /> : <CompanyViewer />);
