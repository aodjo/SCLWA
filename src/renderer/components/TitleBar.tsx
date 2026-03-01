import { VscChromeMinimize, VscChromeMaximize, VscChromeClose, VscSettingsGear } from 'react-icons/vsc';
import '../types/electron.d.ts';

interface TitleBarProps {
  onSettingsClick?: () => void;
}

export default function TitleBar({ onSettingsClick }: TitleBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-8 bg-zinc-950 flex items-center justify-between select-none z-50">
      <div
        className="flex-1 h-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <div className="flex h-full">
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-50 cursor-pointer"
          >
            <VscSettingsGear />
          </button>
        )}
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-50 cursor-pointer"
        >
          <VscChromeMinimize />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-50 cursor-pointer"
        >
          <VscChromeMaximize />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="h-full px-4 hover:bg-red-600 transition-colors flex items-center justify-center text-zinc-400 hover:text-zinc-50 cursor-pointer"
        >
          <VscChromeClose />
        </button>
      </div>
    </div>
  );
}
