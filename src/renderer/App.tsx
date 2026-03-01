import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import './types/electron.d.ts';

function App() {
  const [showSettings, setShowSettings] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSettings();
  }, []);

  const checkSettings = async () => {
    try {
      const configs = await window.electronAPI?.getAIConfigs();
      const hasValid = configs?.some((c) => c.enabled && c.apiKey?.trim());
      setShowSettings(!hasValid);
    } catch (error) {
      console.error('Failed to check settings:', error);
      setShowSettings(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <TitleBar />
        <div className="pt-8 min-h-[calc(100vh-2rem)] flex items-center justify-center">
          <p className="text-zinc-500">Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TitleBar />
      <div className="pt-8">
        {showSettings ? (
          <Settings onComplete={() => setShowSettings(false)} />
        ) : (
          <div className="min-h-[calc(100vh-2rem)] flex flex-col items-center justify-center gap-4">
            <h1 className="text-5xl font-bold">SCLWA</h1>
            <p className="text-zinc-500 text-xl">Study C Language with AI</p>
            <button
              onClick={() => setShowSettings(true)}
              className="mt-8 bg-zinc-800 rounded-md px-4 py-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50 transition-colors"
            >
              설정
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
