/**
 * AI prompt templates for problem generation and tutoring
 */

export const BASE_PROMPT = `당신은 C 프로그래밍 튜터입니다. {{difficulty}} 난이도의 문제를 생성해주세요.
문제는 한국어로 작성하고, 코드는 C언어로 작성합니다.
JSON 형식으로 응답해주세요.`;

export const DIFFICULTY_LABELS = ['매우 쉬운', '쉬운', '보통', '어려운', '매우 어려운'];

export const FILL_BLANK_PROMPT = `빈칸 채우기 문제를 만들어주세요.
- code: 빈칸(____) 이 포함된 코드
- testCases: 테스트 케이스 배열 (input, expected)
- solutionCode: 빈칸이 채워진 완전한 코드 (main 함수 포함, 실행 가능해야 함)`;

export const PREDICT_OUTPUT_PROMPT = `출력 예측 문제를 만들어주세요.
- code: 완전한 C 코드 (main 함수 포함, 실행 가능해야 함)
- 사용자가 출력을 예측해야 합니다`;

export const FIND_BUG_PROMPT = `버그 찾기 문제를 만들어주세요.
- code: 버그가 있는 코드
- testCases: 테스트 케이스 배열 (input, expected)
- solutionCode: 버그가 수정된 완전한 코드 (main 함수 포함, 실행 가능해야 함)`;

export const MULTIPLE_CHOICE_PROMPT = `4지선다 객관식 문제를 만들어주세요.
- choices: 4개의 선택지 배열
- answer: 정답 번호 (0부터 시작)
- code: 필요한 경우 코드 포함`;

export const CHAT_SYSTEM_PROMPT = `당신은 C 프로그래밍 튜터입니다. 현재 학생이 다음 문제를 풀고 있습니다:
문제 유형: {{type}}
문제: {{question}}
{{code}}

힌트를 제공하되, 직접적인 답은 알려주지 마세요.`;

/**
 * Builds the full system prompt for problem generation
 *
 * @param type - Problem type
 * @param difficulty - Difficulty level (1-5)
 * @returns Full system prompt string
 */
export function buildProblemPrompt(type: string, difficulty: number): string {
  const difficultyDesc = DIFFICULTY_LABELS[difficulty - 1] ?? '보통';
  const base = BASE_PROMPT.replace('{{difficulty}}', difficultyDesc);

  const typePrompts: Record<string, string> = {
    'fill-blank': FILL_BLANK_PROMPT,
    'predict-output': PREDICT_OUTPUT_PROMPT,
    'find-bug': FIND_BUG_PROMPT,
    'multiple-choice': MULTIPLE_CHOICE_PROMPT,
  };

  return `${base}\n\n${typePrompts[type] ?? ''}`;
}

/**
 * Builds the system prompt for chat/hint requests
 *
 * @param type - Problem type
 * @param question - Problem question
 * @param code - Problem code (optional)
 * @returns Chat system prompt string
 */
export function buildChatPrompt(type: string, question: string, code?: string): string {
  return CHAT_SYSTEM_PROMPT
    .replace('{{type}}', type)
    .replace('{{question}}', question)
    .replace('{{code}}', code ? `코드:\n${code}` : '');
}
