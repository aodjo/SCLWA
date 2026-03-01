import { useTranslation } from 'react-i18next';

interface EditorPanelProps {
  code: string;
  onChange: (code: string) => void;
}

/**
 * Code editor panel with textarea (to be replaced with Monaco)
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

      <div className="flex-1 p-4">
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('editor.placeholder')}
          className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-md p-4 text-sm font-mono text-zinc-300 resize-none outline-none focus:border-zinc-700 placeholder:text-zinc-600"
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
