import { useState, useEffect } from 'react';
import Settings from './components/Settings';

const STORAGE_KEY = 'sclwa-settings';

function hasValidSettings(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;

  const settings = JSON.parse(saved);
  return settings.aiConfigs?.some(
    (c: { enabled: boolean; apiKey: string }) => c.enabled && c.apiKey.trim()
  );
}

function App() {
  const [showSettings, setShowSettings] = useState(!hasValidSettings());

  if (showSettings) {
    return <Settings onComplete={() => setShowSettings(false)} />;
  }

  return (
    <div className="app">
      <h1>SCLWA</h1>
      <p>Study C Language with AI</p>
      <button
        onClick={() => setShowSettings(true)}
        style={{
          marginTop: '2rem',
          background: '#27272a',
          border: 'none',
          borderRadius: '6px',
          padding: '0.5rem 1rem',
          color: '#a1a1aa',
          cursor: 'pointer',
        }}
      >
        설정
      </button>
    </div>
  );
}

export default App;
