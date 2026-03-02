import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import Learning from './components/Learning';
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
      <TitleBar onSettingsClick={() => setShowSettings(true)} />
      <div className="pt-8">
        {showSettings ? (
          <Settings
            onComplete={() => {
              setShowSettings(false);
            }}
          />
        ) : (
          <Learning />
        )}
      </div>
    </>
  );
}

export default App;
