import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from 'react-icons/vsc';
import '../types/electron.d.ts';

export default function TitleBar() {
  return (
    <div className="fixed top-0 left-0 right-0 h-8 bg-zinc-950 flex items-center justify-between select-none z-50">
      <div
        className="flex-1 h-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <div className="flex h-full">
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
