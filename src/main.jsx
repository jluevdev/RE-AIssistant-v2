import React from 'react';
import ReactDOM from 'react-dom/client';
import { getFirebaseEnvIssues } from './config/env';
import SetupRequired from './pages/SetupRequired.jsx';
import './index.css';

const issues = getFirebaseEnvIssues();

if (issues.length > 0) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <SetupRequired issues={issues} />
    </React.StrictMode>
  );
} else {
  import('./bootstrap.jsx');
}
