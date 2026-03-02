import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import LevelTest from './components/LevelTest';
import './types/electron.d.ts';

type AppMode = 'level-test' | 'learning';

function App() {
  const [showSettings, setShowSettings] = useState(true);
  const [appMode, setAppMode] = useState<AppMode>('level-test');
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
        const progress = await window.electronAPI.getStudentProgress();
        setAppMode((progress.history?.length ?? 0) >= 5 ? 'learning' : 'level-test');
      }
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
          <Settings onComplete={() => setShowSettings(false)} />
        ) : (
          <LevelTest
            key={appMode}
            mode={appMode}
            onEnterLearning={() => setAppMode('learning')}
          />
        )}
      </div>
    </>
  );
}

export default App;
