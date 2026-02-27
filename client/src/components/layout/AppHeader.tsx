import { TAB_LABELS } from '../../constants/app';
import type { AppTab } from '../../types/app';

interface AppHeaderProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
}

export function AppHeader({ activeTab, onChangeTab }: AppHeaderProps): JSX.Element {
  return (
    <header className="rounded-xl border border-line bg-panel/80 p-4 shadow-glow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-cyan-300">Study C Lang With AI</h1>
        <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-400">
          React + Tailwind Platform
        </span>
      </div>
      <nav className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as AppTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChangeTab(tab)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              activeTab === tab
                ? 'border-cyan-700 bg-cyan-950/70 text-cyan-100'
                : 'border-line bg-slate-900/70 text-slate-300 hover:border-slate-600'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
    </header>
  );
}
