import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';

interface EditorPanelProps {
  code: string;
  onChange: (code: string) => void;
}

/**
 * Code editor panel with Monaco Editor
 *
 * @param code - Current code content
 * @param onChange - Callback when code changes
 * @returns Editor panel component
 */
export default function EditorPanel({ code, onChange }: EditorPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <span className="text-sm text-zinc-400">{t('editor.title')}</span>
      </div>

      <div className="flex-1">
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

      <div className="p-4 border-t border-zinc-800">
        <button className="w-full bg-zinc-50 text-zinc-950 rounded-md py-2 text-sm font-medium hover:bg-zinc-200 transition-colors cursor-pointer">
          {t('editor.submit')}
        </button>
      </div>
    </div>
  );
}
