import { useState, useEffect } from 'react';
import { Settings as SettingsType, AI_PROVIDERS, AIConfig, AIProvider } from '../types/settings';
import { SiOpenai } from 'react-icons/si';
import { RiGeminiFill, RiClaudeFill } from 'react-icons/ri';
import './Settings.css';

const AI_ICONS: Record<AIProvider, React.ReactNode> = {
  openai: <SiOpenai />,
  gemini: <RiGeminiFill />,
  claude: <RiClaudeFill />,
};

const STORAGE_KEY = 'sclwa-settings';

function loadSettings(): SettingsType {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    aiConfigs: AI_PROVIDERS.map((p) => ({
      provider: p.id,
      apiKey: '',
      enabled: false,
    })),
  };
}

function saveSettings(settings: SettingsType) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface SettingsProps {
  onComplete: () => void;
}

export default function Settings({ onComplete }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>(loadSettings);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const toggleProvider = (providerId: string) => {
    setSettings((prev) => ({
      ...prev,
      aiConfigs: prev.aiConfigs.map((config) =>
        config.provider === providerId
          ? { ...config, enabled: !config.enabled }
          : config
      ),
    }));
  };

  const updateApiKey = (providerId: string, apiKey: string) => {
    setSettings((prev) => ({
      ...prev,
      aiConfigs: prev.aiConfigs.map((config) =>
        config.provider === providerId ? { ...config, apiKey } : config
      ),
    }));
  };

  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const getConfig = (providerId: string): AIConfig | undefined => {
    return settings.aiConfigs.find((c) => c.provider === providerId);
  };

  const canProceed = settings.aiConfigs.some((c) => c.enabled && c.apiKey.trim());

  return (
    <div className="settings">
      <div className="settings-container">
        <h1>SCLWA</h1>
        <p className="settings-subtitle">AI를 선택하고 API 키를 입력하세요</p>

        <div className="ai-list">
          {AI_PROVIDERS.map((provider) => {
            const config = getConfig(provider.id);
            const isEnabled = config?.enabled ?? false;
            const apiKey = config?.apiKey ?? '';

            return (
              <div
                key={provider.id}
                className={`ai-card ${!provider.available ? 'disabled' : ''} ${isEnabled ? 'selected' : ''}`}
              >
                <div className="ai-card-header">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleProvider(provider.id)}
                      disabled={!provider.available}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="ai-icon">{AI_ICONS[provider.id]}</span>
                    <span className="ai-name">{provider.name}</span>
                  </label>
                  {!provider.available && (
                    <span className="coming-soon">Coming Soon</span>
                  )}
                </div>

                {isEnabled && provider.available && (
                  <div className="api-key-input">
                    <div className="input-wrapper">
                      <input
                        type={showApiKey[provider.id] ? 'text' : 'password'}
                        placeholder="API Key"
                        value={apiKey}
                        onChange={(e) => updateApiKey(provider.id, e.target.value)}
                      />
                      <button
                        className="toggle-visibility"
                        onClick={() => toggleShowApiKey(provider.id)}
                        type="button"
                      >
                        {showApiKey[provider.id] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          className="proceed-button"
          disabled={!canProceed}
          onClick={onComplete}
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
