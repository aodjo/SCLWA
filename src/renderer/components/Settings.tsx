import { useState, useEffect } from 'react';
import { AI_PROVIDERS, AIConfig, AIProvider } from '../types/settings';
import { SiOpenai } from 'react-icons/si';
import { RiGeminiFill, RiClaudeFill } from 'react-icons/ri';
import { BiShow, BiHide } from 'react-icons/bi';
import '../types/electron.d.ts';

const AI_ICONS: Record<AIProvider, React.ReactNode> = {
  openai: <SiOpenai />,
  gemini: <RiGeminiFill />,
  claude: <RiClaudeFill />,
};

interface SettingsProps {
  onComplete: () => void;
}

/**
 * Settings page for selecting AI provider and entering API keys
 *
 * @param onComplete - Callback when settings are complete
 * @returns Settings component
 */
export default function Settings({ onComplete }: SettingsProps) {
  const [configs, setConfigs] = useState<AIConfig[]>(
    AI_PROVIDERS.map((p) => ({ provider: p.id, apiKey: '', enabled: false }))
  );
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const savedConfigs = await window.electronAPI?.getAIConfigs();
      if (savedConfigs && savedConfigs.length > 0) {
        setConfigs((prev) =>
          prev.map((config) => {
            const saved = savedConfigs.find((s) => s.provider === config.provider);
            return saved ? { ...config, ...saved } : config;
          })
        );
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = async (providerId: string) => {
    const config = configs.find((c) => c.provider === providerId);
    if (!config) return;

    const newEnabled = !config.enabled;
    setConfigs((prev) =>
      prev.map((c) => (c.provider === providerId ? { ...c, enabled: newEnabled } : c))
    );

    await window.electronAPI?.saveAIConfig(providerId, config.apiKey, newEnabled);
  };

  const updateApiKey = async (providerId: string, apiKey: string) => {
    const config = configs.find((c) => c.provider === providerId);
    if (!config) return;

    setConfigs((prev) =>
      prev.map((c) => (c.provider === providerId ? { ...c, apiKey } : c))
    );

    await window.electronAPI?.saveAIConfig(providerId, apiKey, config.enabled);
  };

  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const getConfig = (providerId: string): AIConfig | undefined => {
    return configs.find((c) => c.provider === providerId);
  };

  const canProceed = configs.some((c) => c.enabled && c.apiKey.trim());

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">SCLWA</h1>
        <p className="text-zinc-500 text-center mb-8">AI를 선택하고 API 키를 입력해주세요</p>

        <div className="flex flex-col gap-3 mb-6">
          {AI_PROVIDERS.map((provider) => {
            const config = getConfig(provider.id);
            const isEnabled = config?.enabled ?? false;
            const apiKey = config?.apiKey ?? '';

            return (
              <div
                key={provider.id}
                className={`
                  bg-zinc-900 border rounded-lg p-4 transition-all duration-150
                  ${!provider.available ? 'opacity-50' : ''}
                  ${isEnabled ? 'border-zinc-700 bg-zinc-900/80' : 'border-zinc-800'}
                `}
              >
                <div className="flex items-center justify-between">
                  <label className={`flex items-center gap-3 ${provider.available ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleProvider(provider.id)}
                      disabled={!provider.available}
                      className="hidden"
                    />
                    <span
                      className={`
                        w-[18px] h-[18px] border-2 rounded relative transition-all duration-150
                        ${isEnabled ? 'bg-zinc-50 border-zinc-50' : 'border-zinc-700'}
                      `}
                    >
                      {isEnabled && (
                        <span className="absolute left-[5px] top-[2px] w-1 h-2 border-zinc-900 border-r-2 border-b-2 rotate-45" />
                      )}
                    </span>
                    <span className={`text-lg ${isEnabled ? 'text-zinc-50' : 'text-zinc-500'}`}>
                      {AI_ICONS[provider.id]}
                    </span>
                    <span className="font-medium">{provider.name}</span>
                  </label>
                  {!provider.available && (
                    <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
                      Coming Soon
                    </span>
                  )}
                </div>

                {isEnabled && provider.available && (
                  <div className="mt-4">
                    <div className="flex gap-2">
                      <input
                        type={showApiKey[provider.id] ? 'text' : 'password'}
                        placeholder="API Key"
                        value={apiKey}
                        onChange={(e) => updateApiKey(provider.id, e.target.value)}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2.5 text-sm text-zinc-50 outline-none focus:border-zinc-700 transition-colors placeholder:text-zinc-600"
                      />
                      <button
                        onClick={() => toggleShowApiKey(provider.id)}
                        type="button"
                        className="flex items-center justify-center bg-zinc-800 rounded-md px-3 text-zinc-500 text-lg hover:bg-zinc-700 hover:text-zinc-50 transition-all"
                      >
                        {showApiKey[provider.id] ? <BiHide /> : <BiShow />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          disabled={!canProceed}
          onClick={onComplete}
          className="w-full bg-zinc-50 text-zinc-950 rounded-md py-3 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
