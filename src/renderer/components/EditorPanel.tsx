import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { Group, Panel, Separator } from 'react-resizable-panels';

const C_STANDARDS = ['C17', 'C11', 'C99'] as const;

interface EditorPanelProps {
  code: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  onPass?: () => void;
  submitting?: boolean;
}

/**
 * Code editor panel with Monaco Editor
 *
 * @param code - Current code content
 * @param onChange - Callback when code changes
 * @param onSubmit - Callback when submitting code
 * @param submitting - Whether submission is in progress
 * @returns Editor panel component
 */
export default function EditorPanel({ code, onChange, onSubmit, onPass, submitting }: EditorPanelProps) {
  const { t } = useTranslation();
  const [output, setOutput] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [standard, setStandard] = useState<typeof C_STANDARDS[number]>('C17');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /**
     * Closes dropdown when clicking outside
     */
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Resets the code editor to empty state
   */
  const handleReset = () => {
    onChange('');
    setOutput('');
  };

  /**
   * Runs the code and displays output
   */
  const handleRun = async () => {
    setRunning(true);
    setOutput('');

    try {
      const result = await window.electronAPI.dockerExecute(code, '');
      if (result.success) {
        setOutput(result.output || t('editor.noOutput'));
      } else {
        setOutput(result.error || t('editor.error'));
      }
    } catch (err) {
      setOutput(t('editor.error'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-900">
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700 bg-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300 px-2 py-1 border-r border-zinc-700">C</span>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1 bg-zinc-700 text-zinc-300 text-sm px-2 py-1 rounded cursor-pointer hover:bg-zinc-600 transition-colors"
            >
              {standard}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-2 bg-zinc-700 rounded-lg shadow-lg z-10 min-w-full p-1">
                {C_STANDARDS.map((std) => (
                  <button
                    key={std}
                    onClick={() => {
                      setStandard(std);
                      setDropdownOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors rounded ${
                      standard === std ? 'bg-zinc-600 text-white' : 'text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    {std}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="px-3 py-1 text-sm bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors cursor-pointer"
          >
            {t('editor.reset')}
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {running ? t('editor.running') : t('editor.run')}
          </button>
        </div>
      </div>

      <Group orientation="vertical" className="flex-1">
        <Panel defaultSize="70%" minSize="30%">
          <div className="h-full">
            <Editor
              height="100%"
              defaultLanguage="c"
              theme="vs-dark"
              value={code}
              onChange={(value) => onChange(value ?? '')}
              options={{
                fontSize: 14,
                fontFamily: 'Consolas, Monaco, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                automaticLayout: true,
              }}
            />
          </div>
        </Panel>

        <Separator className="resize-handle-horizontal" />

        <Panel defaultSize="30%" minSize="15%">
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700">
              <span className="text-sm font-medium text-zinc-300">{t('editor.output')}</span>
            </div>

            <div className="flex-1 p-4 overflow-auto bg-zinc-800">
              <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
                {output || <span className="text-zinc-600">{t('editor.outputPlaceholder')}</span>}
              </pre>
            </div>

            <div className="p-2 border-t border-zinc-700 flex justify-end gap-2">
              {onPass && (
                <button
                  onClick={onPass}
                  disabled={submitting}
                  className="px-4 py-1.5 text-sm bg-zinc-600 text-white rounded hover:bg-zinc-500 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('editor.pass')}
                </button>
              )}
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? t('editor.submitting') : t('editor.submit')}
              </button>
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
