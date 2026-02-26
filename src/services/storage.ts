import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Progress, AssessmentResult, ChatMessage } from '../types/index.js';

const STORAGE_DIR = join(homedir(), '.c-tutor');
const PROGRESS_FILE = join(STORAGE_DIR, 'progress.json');
const HISTORY_DIR = join(STORAGE_DIR, 'history');
const CODE_DIR = join(STORAGE_DIR, 'code');

/**
 * 스토리지 초기화
 * 필요한 디렉토리들을 생성
 */
export async function initStorage(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  await mkdir(HISTORY_DIR, { recursive: true });
  await mkdir(CODE_DIR, { recursive: true });
}

/**
 * 진행 상황 저장
 * @param progress - 저장할 진행 상황 객체
 */
export async function saveProgress(progress: Progress): Promise<void> {
  await initStorage();
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

/**
 * 진행 상황 불러오기
 * @returns 저장된 진행 상황 또는 초기값
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
 * 기본 진행 상황 객체 반환
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
 * 세션 존재 여부 확인
 * @returns 이전 세션이 있는지 여부
 */
export async function hasExistingSession(): Promise<boolean> {
  return existsSync(PROGRESS_FILE);
}

/**
 * 평가 결과 저장
 * @param result - 저장할 평가 결과
 */
export async function saveAssessment(result: AssessmentResult): Promise<void> {
  const progress = await loadProgress();
  progress.assessment = result;
  await saveProgress(progress);
}

/**
 * 채팅 히스토리 저장
 * @param messages - 저장할 메시지 목록
 * @param date - 날짜 (선택, 기본값: 오늘)
 */
export async function saveChatHistory(
  messages: ChatMessage[],
  date?: string
): Promise<void> {
  await initStorage();
  const dateStr = date || new Date().toISOString().split('T')[0];
  const filePath = join(HISTORY_DIR, `${dateStr}.json`);
  await writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
}

/**
 * 채팅 히스토리 불러오기
 * @param date - 날짜 (선택, 기본값: 오늘)
 * @returns 저장된 메시지 목록 또는 빈 배열
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
 * 코드 저장
 * @param code - 저장할 코드
 * @param filename - 파일명
 */
export async function saveCode(code: string, filename: string): Promise<void> {
  await initStorage();
  const filePath = join(CODE_DIR, filename);
  await writeFile(filePath, code, 'utf-8');
}

/**
 * 코드 불러오기
 * @param filename - 파일명
 * @returns 저장된 코드 또는 null
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
 * 퍼즐 완료 기록
 * @param puzzleId - 완료한 퍼즐 ID
 */
export async function markPuzzleCompleted(puzzleId: string): Promise<void> {
  const progress = await loadProgress();
  if (!progress.completedPuzzles.includes(puzzleId)) {
    progress.completedPuzzles.push(puzzleId);
    await saveProgress(progress);
  }
}

/**
 * 학습 시간 업데이트
 * @param seconds - 추가할 학습 시간 (초)
 */
export async function updateStudyTime(seconds: number): Promise<void> {
  const progress = await loadProgress();
  progress.totalStudyTime += seconds;
  progress.lastSession = new Date().toISOString();
  await saveProgress(progress);
}

/**
 * 모든 진행 데이터 삭제
 */
export async function clearAllData(): Promise<void> {
  const { rm } = await import('fs/promises');
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // ignore errors
  }
}
