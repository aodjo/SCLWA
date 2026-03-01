import { useState } from 'react';
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-5xl font-bold">SCLWA</h1>
      <p className="text-zinc-500 text-xl">Study C Language with AI</p>
      <button
        onClick={() => setShowSettings(true)}
        className="mt-8 bg-zinc-800 rounded-md px-4 py-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50 transition-colors"
      >
        설정
      </button>
    </div>
  );
}

export default App;
