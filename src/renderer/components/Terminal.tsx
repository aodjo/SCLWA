import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

interface TerminalProps {
  onData?: (data: string) => void;
}

/**
 * Interactive terminal component using xterm.js
 *
 * @param onData - Callback when user types in terminal
 * @param ref - Ref to access terminal methods
 * @returns Terminal component
 */
const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ onData }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useImperativeHandle(ref, () => ({
    write: (data: string) => terminalRef.current?.write(data),
    writeln: (data: string) => terminalRef.current?.writeln(data),
    clear: () => terminalRef.current?.clear(),
    focus: () => terminalRef.current?.focus(),
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      theme: {
        background: '#27272a',
        foreground: '#d4d4d8',
        cursor: '#d4d4d8',
        cursorAccent: '#27272a',
        selectionBackground: '#3f3f46',
      },
      fontFamily: 'Consolas, monospace',
      fontSize: 14,
      letterSpacing: 0,
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full p-2" />;
});

Terminal.displayName = 'Terminal';

export default Terminal;
