import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Editor, { OnMount } from '@monaco-editor/react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { editor } from 'monaco-editor';
import tomorrowNight from '../themes/tomorrow-night.json';
import Terminal, { TerminalHandle } from './Terminal';

const GUIDE_ANCHOR_REGEX = /\[\[\(guide-anchor[\w-]*\):\(([^)]+)\)\]\]/g;
const GUIDE_ANCHOR_VALID_AT_START_REGEX = /^\[\[\(guide-anchor[\w-]*\):\([^)]+\)\]\]/;
const GUIDE_ANCHOR_FRAGMENT_MARKERS = ['[[(guide-anchor', '[(guide-anchor', '[[guide-anchor'];

function findNextGuideAnchorFragment(source: string, from: number): number {
  let next = -1;
  for (const marker of GUIDE_ANCHOR_FRAGMENT_MARKERS) {
    const idx = source.indexOf(marker, from);
    if (idx === -1) continue;
    if (next === -1 || idx < next) next = idx;
  }
  return next;
}

function removeBrokenGuideAnchorFragments(source: string): string {
  let cursor = 0;
  let result = '';
  let changed = false;

  while (cursor < source.length) {
    const start = findNextGuideAnchorFragment(source, cursor);
    if (start === -1) {
      result += source.slice(cursor);
      break;
    }

    result += source.slice(cursor, start);

    const tail = source.slice(start);
    const valid = tail.match(GUIDE_ANCHOR_VALID_AT_START_REGEX);
    if (valid) {
      result += valid[0];
      cursor = start + valid[0].length;
      continue;
    }

    changed = true;

    const lineBreak = source.indexOf('\n', start);
    const close = source.indexOf(']]', start);
    const fragmentEnd = close !== -1 && (lineBreak === -1 || close < lineBreak)
      ? close + 2
      : (lineBreak === -1 ? source.length : lineBreak);
    cursor = fragmentEnd;
  }

  return changed ? result : source;
}

interface EditorPanelProps {
  code: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  onPass?: () => void;
  onNext?: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  waitingForNext?: boolean;
  readonly?: boolean;
  runnable?: boolean;
  showConsole?: boolean;
  alertMessage?: string | null;
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
export default function EditorPanel({
  code,
  onChange,
  onSubmit,
  onPass,
  onNext,
  submitting,
  submitDisabled,
  waitingForNext,
  readonly,
  runnable = true,
  showConsole = true,
  alertMessage,
}: EditorPanelProps) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const sanitizingRef = useRef(false);
  const showActionButtons = waitingForNext || !!onSubmit || !!onPass || !!onNext;

  /**
   * Applies guide-anchor decorations to the editor
   */
  const applyGuideAnchorDecorations = useCallback(() => {
    if (!editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const text = model.getValue();
    const decorations: editor.IModelDeltaDecoration[] = [];

    let match;
    while ((match = GUIDE_ANCHOR_REGEX.exec(text)) !== null) {
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);
      const labelText = match[1];

      decorations.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          inlineClassName: 'guide-anchor-hidden',
          before: {
            content: labelText,
            inlineClassName: 'guide-anchor-button',
          },
          hoverMessage: { value: '클릭하여 코드를 입력하세요' },
        },
      });
    }

    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }
    decorationsRef.current = editorRef.current.createDecorationsCollection(decorations);
  }, []);

  /**
   * Handles Monaco editor mount event
   */
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme('tomorrow-night', tomorrowNight as editor.IStandaloneThemeData);
    monaco.editor.setTheme('tomorrow-night');
    applyGuideAnchorDecorations();

    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (!model) return;

      if (sanitizingRef.current) {
        sanitizingRef.current = false;
        applyGuideAnchorDecorations();
        return;
      }

      const currentText = model.getValue();
      const sanitizedText = removeBrokenGuideAnchorFragments(currentText);
      if (sanitizedText !== currentText) {
        sanitizingRef.current = true;
        editor.executeEdits('sanitize-guide-anchor', [
          {
            range: model.getFullModelRange(),
            text: sanitizedText,
            forceMoveMarkers: true,
          },
        ]);
        return;
      }

      applyGuideAnchorDecorations();
    });

    editor.onMouseDown((e) => {
      if (!e.target.position) return;

      const model = editor.getModel();
      if (!model) return;

      const position = e.target.position;
      const lineContent = model.getLineContent(position.lineNumber);

      const match = GUIDE_ANCHOR_REGEX.exec(lineContent);
      GUIDE_ANCHOR_REGEX.lastIndex = 0;

      if (match) {
        const startCol = match.index + 1;
        const endCol = startCol + match[0].length;

        if (position.column >= startCol && position.column <= endCol) {
          model.pushEditOperations(
            [],
            [{
              range: {
                startLineNumber: position.lineNumber,
                startColumn: startCol,
                endLineNumber: position.lineNumber,
                endColumn: endCol,
              },
              text: '',
            }],
            () => null
          );

          editor.setPosition({ lineNumber: position.lineNumber, column: startCol });
          editor.focus();
        }
      }
    });
  }, [applyGuideAnchorDecorations]);

  useEffect(() => {
    const cleanupStdout = window.electronAPI.onDockerStdout((data) => {
      terminalRef.current?.write(data);
    });

    const cleanupStderr = window.electronAPI.onDockerStderr((data) => {
      terminalRef.current?.write(`\x1b[31m${data}\x1b[0m`);
    });

    const cleanupExit = window.electronAPI.onDockerExit((exitCode) => {
      terminalRef.current?.writeln(`\r\n\x1b[36m${t('editor.processEnded')} (${exitCode})\x1b[0m`);
      setRunning(false);
    });

    return () => {
      cleanupStdout();
      cleanupStderr();
      cleanupExit();
    };
  }, [t]);

  /**
   * Resets the code editor to empty state
   */
  const handleReset = () => {
    onChange('');
    terminalRef.current?.clear();
  };

  /**
   * Strips guide-anchor markers from code
   */
  const stripGuideAnchors = (sourceCode: string): string => {
    return sourceCode.replace(GUIDE_ANCHOR_REGEX, '');
  };

  /**
   * Runs the code in interactive mode
   */
  const handleRun = async () => {
    setRunning(true);
    terminalRef.current?.clear();
    terminalRef.current?.writeln(`\x1b[36m${t('editor.processStarted')}\x1b[0m`);
    terminalRef.current?.focus();

    const cleanCode = stripGuideAnchors(code);
    const result = await window.electronAPI.dockerExecuteInteractive(cleanCode);

    if (!result.success) {
      terminalRef.current?.writeln(`\x1b[31m${result.error}\x1b[0m`);
      setRunning(false);
    }
  };

  /**
   * Stops the currently running code execution
   */
  const handleStop = async () => {
    await window.electronAPI.dockerStop();
    setRunning(false);
    terminalRef.current?.writeln(`\r\n\x1b[33m${t('editor.stopped')}\x1b[0m`);
  };

  /**
   * Handles terminal input and sends to docker stdin
   *
   * @param data - Input data from terminal (Enter sends \r)
   */
  const handleTerminalInput = useCallback((data: string) => {
    console.log('[Terminal] Input:', JSON.stringify(data), 'Running:', running);
    if (running) {
      // Convert \r to \n for proper line ending (scanf expects \n)
      const converted = data.replace(/\r/g, '\n');
      window.electronAPI.dockerStdin(converted);
    }
  }, [running]);

  const renderActionButtons = (className: string) => (
    <div className={className}>
      {waitingForNext ? (
        <button
          onClick={onNext}
          className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-500 transition-colors cursor-pointer"
        >
          {t('editor.next')}
        </button>
      ) : (
        <>
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
            disabled={submitting || submitDisabled}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? t('editor.submitting') : t('editor.submit')}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-zinc-900">
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700 bg-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300 px-2 py-1 border-r border-zinc-700">C</span>
          <span className="bg-zinc-700 text-zinc-300 text-sm px-2 py-1 rounded">C17</span>
        </div>
        <div className="flex items-center gap-1">
          {!readonly && (
            <button
              onClick={handleReset}
              className="px-3 py-1 text-sm bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors cursor-pointer"
            >
              {t('editor.reset')}
            </button>
          )}
          {runnable && (
            <>
              {running ? (
                <button
                  onClick={handleStop}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors cursor-pointer"
                >
                  {t('editor.stop')}
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  {t('editor.run')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <Group
        orientation="vertical"
        className="flex-1"
        autoSave="level-test-editor-vertical-panels"
      >
        <Panel defaultSize={showConsole ? '70%' : '100%'} minSize="30%">
          <div className="h-full relative">
            {alertMessage && (
              <div className="absolute right-3 top-3 z-20 rounded-md border border-red-400 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                {alertMessage}
              </div>
            )}
            <Editor
              height="100%"
              defaultLanguage="c"
              theme="tomorrow-night"
              value={code}
              onChange={(value) => onChange(value ?? '')}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                fontFamily: 'Consolas, Monaco, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                automaticLayout: true,
                readOnly: readonly,
              }}
            />
          </div>
        </Panel>

        {showConsole && (
          <>
            <Separator className="resize-handle-horizontal" />

            <Panel defaultSize="30%" minSize="15%">
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700">
                  <span className="text-sm font-medium text-zinc-300">{t('editor.output')}</span>
                </div>

                <div className="flex-1 bg-zinc-800 overflow-hidden min-h-0">
                  <Terminal ref={terminalRef} onData={handleTerminalInput} />
                </div>

                {showActionButtons && renderActionButtons('p-2 border-t border-zinc-700 flex justify-end gap-2')}
              </div>
            </Panel>
          </>
        )}
      </Group>

      {!showConsole && showActionButtons && renderActionButtons('p-2 border-t border-zinc-700 bg-zinc-900 flex justify-end gap-2')}
    </div>
  );
}
