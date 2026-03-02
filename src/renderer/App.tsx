import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import LevelTest from './components/LevelTest';
import './types/electron.d.ts';

type AppMode = 'level-test' | 'learning';
const APP_MODE_STORAGE_KEY = 'sclwa-app-mode';

function getStoredAppMode(): AppMode {
  try {
    const raw = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    return raw === 'learning' ? 'learning' : 'level-test';
  } catch {
    return 'level-test';
  }
}

function storeAppMode(mode: AppMode): void {
  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failure and keep in-memory mode.
  }
}

function App() {
  const [showSettings, setShowSettings] = useState(true);
  const [appMode, setAppMode] = useState<AppMode>(getStoredAppMode);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSettings();
  }, []);

  const checkSettings = async () => {
    try {
      const configs = await window.electronAPI?.getAIConfigs();
      const hasValid = configs?.some((c) => c.enabled && c.apiKey?.trim());
      setShowSettings(!hasValid);

      if (hasValid) {
        setAppMode(getStoredAppMode());
      } else {
        setAppMode('level-test');
      }
    } catch (error) {
      console.error('Failed to check settings:', error);
      setShowSettings(true);
      setAppMode('level-test');
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
              setAppMode(getStoredAppMode());
            }}
          />
        ) : (
          <LevelTest
            key={appMode}
            mode={appMode}
            onEnterLearning={() => {
              setAppMode('learning');
              storeAppMode('learning');
            }}
          />
        )}
      </div>
    </>
  );
}

export default App;
