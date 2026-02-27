import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Progress, AssessmentResult, ChatMessage } from '../types/index.js';

const STORAGE_DIR = join(homedir(), '.sclwa');
const PROGRESS_FILE = join(STORAGE_DIR, 'progress.json');
const CONFIG_FILE = join(STORAGE_DIR, 'config.json');
const HISTORY_DIR = join(STORAGE_DIR, 'history');
const CODE_DIR = join(STORAGE_DIR, 'code');

interface AppConfig {
  geminiApiKey?: string;
}

/**
 * Ensures all local storage directories exist.
 *
 * @return {Promise<void>} Resolves when storage directories are created.
 */
export async function initStorage(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  await mkdir(HISTORY_DIR, { recursive: true });
  await mkdir(CODE_DIR, { recursive: true });
}

/**
 * Persists the full learner progress document.
 *
 * @param {Progress} progress - Progress payload to store on disk.
 * @return {Promise<void>} Resolves when progress has been written.
 */
export async function saveProgress(progress: Progress): Promise<void> {
  await initStorage();
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

/**
 * Loads learner progress from disk.
 *
 * @return {Promise<Progress>} Stored progress, or a default progress object when none exists.
 */
export async function loadProgress(): Promise<Progress> {
  try {
    const data = await readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data) as Progress;
  } catch {
    return getDefaultProgress();
  }
}

/**
 * Loads local application configuration from disk.
 *
 * @return {Promise<AppConfig>} Stored config object, or empty config when missing.
 */
async function loadConfig(): Promise<AppConfig> {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as AppConfig;
  } catch {
    return {};
  }
}

/**
 * Persists local application configuration to disk.
 *
 * @param {AppConfig} config - Configuration payload to store.
 * @return {Promise<void>} Resolves after config write completes.
 */
async function saveConfig(config: AppConfig): Promise<void> {
  await initStorage();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Loads the persisted Gemini API key.
 *
 * @return {Promise<string | null>} Stored API key, or `null` when not configured.
 */
export async function loadGeminiApiKey(): Promise<string | null> {
  const config = await loadConfig();
  const apiKey = config.geminiApiKey?.trim();
  return apiKey ? apiKey : null;
}

/**
 * Stores the Gemini API key in local app configuration.
 *
 * @param {string} apiKey - Gemini API key string.
 * @return {Promise<void>} Resolves after key is written.
 */
export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    throw new Error('Gemini API 키가 비어 있습니다.');
  }

  const config = await loadConfig();
  config.geminiApiKey = normalized;
  await saveConfig(config);
}

/**
 * Builds the default progress object used for first-time users.
 *
 * @return {Progress} Initial progress state.
 */
function getDefaultProgress(): Progress {
  return {
    completedPuzzles: [],
    currentTopic: 'basics',
    totalStudyTime: 0,
    lastSession: new Date().toISOString(),
  };
}

/**
 * Checks whether a previous study session exists.
 *
 * @return {Promise<boolean>} `true` if persisted progress file is present.
 */
export async function hasExistingSession(): Promise<boolean> {
  return existsSync(PROGRESS_FILE);
}

/**
 * Saves the latest assessment result into progress data.
 *
 * @param {AssessmentResult} result - Computed assessment result to persist.
 * @return {Promise<void>} Resolves after assessment is saved.
 */
export async function saveAssessment(result: AssessmentResult): Promise<void> {
  const progress = await loadProgress();
  progress.assessment = result;
  await saveProgress(progress);
}

/**
 * Saves chat history for a specific day.
 *
 * @param {ChatMessage[]} messages - Messages to write.
 * @param {string} [date] - Date key in `YYYY-MM-DD`; defaults to today.
 * @return {Promise<void>} Resolves after chat history file is written.
 */
export async function saveChatHistory(messages: ChatMessage[], date?: string): Promise<void> {
  await initStorage();
  const dateStr = date || new Date().toISOString().split('T')[0];
  const filePath = join(HISTORY_DIR, `${dateStr}.json`);
  await writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
}

/**
 * Loads chat history for a specific day.
 *
 * @param {string} [date] - Date key in `YYYY-MM-DD`; defaults to today.
 * @return {Promise<ChatMessage[]>} Stored messages, or an empty array when missing.
 */
export async function loadChatHistory(date?: string): Promise<ChatMessage[]> {
  const dateStr = date || new Date().toISOString().split('T')[0];
  const filePath = join(HISTORY_DIR, `${dateStr}.json`);

  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as ChatMessage[];
  } catch {
    return [];
  }
}

/**
 * Writes source code snapshot into the local code workspace.
 *
 * @param {string} code - Raw source code content.
 * @param {string} filename - Target filename.
 * @return {Promise<void>} Resolves after file write succeeds.
 */
export async function saveCode(code: string, filename: string): Promise<void> {
  await initStorage();
  const filePath = join(CODE_DIR, filename);
  await writeFile(filePath, code, 'utf-8');
}

/**
 * Loads a previously saved source file.
 *
 * @param {string} filename - Filename under the local code workspace.
 * @return {Promise<string | null>} File content or `null` when file does not exist.
 */
export async function loadCode(filename: string): Promise<string | null> {
  const filePath = join(CODE_DIR, filename);

  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Marks a puzzle as completed if it has not been recorded yet.
 *
 * @param {string} puzzleId - Unique puzzle identifier.
 * @return {Promise<void>} Resolves once progress update is persisted.
 */
export async function markPuzzleCompleted(puzzleId: string): Promise<void> {
  const progress = await loadProgress();
  if (!progress.completedPuzzles.includes(puzzleId)) {
    progress.completedPuzzles.push(puzzleId);
    await saveProgress(progress);
  }
}

/**
 * Adds study time to cumulative progress and updates last session timestamp.
 *
 * @param {number} seconds - Number of seconds to add.
 * @return {Promise<void>} Resolves after progress is saved.
 */
export async function updateStudyTime(seconds: number): Promise<void> {
  const progress = await loadProgress();
  progress.totalStudyTime += seconds;
  progress.lastSession = new Date().toISOString();
  await saveProgress(progress);
}

/**
 * Deletes all persisted tutor data from local storage.
 *
 * @return {Promise<void>} Resolves after best-effort cleanup completes.
 */
export async function clearAllData(): Promise<void> {
  const { rm } = await import('fs/promises');
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors because this is a best-effort operation.
  }
}
