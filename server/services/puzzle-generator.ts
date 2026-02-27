import { getGeminiClient } from './gemini-client.js';
import type { Puzzle, PuzzleTestCase, PuzzleType, SkillLevel } from '../types/index.js';

const PUZZLE_PROMPTS: Record<PuzzleType, string> = {
  'fill-blank': `Create one C language fill-in-the-blank puzzle.

Requirements:
- Difficulty: {difficulty}
- Topic: {topic}
- All user-facing text (title/description/hints) must be in Korean.
- Code must use "______" markers for blanks.
- Include 1 to 3 blanks.
- Return JSON only, no markdown.

Output JSON shape:
{
  "title": "문제 제목",
  "description": "문제 설명",
  "code": "int x = ______;",
  "blanks": ["10"],
  "hints": ["힌트1", "힌트2"]
}`,

  'bug-finder': `Create one C language bug-finder puzzle.

Requirements:
- Difficulty: {difficulty}
- Topic: {topic}
- All user-facing text (title/description/hints) must be in Korean.
- Provide code with exactly one clear bug.
- bugLine must be a 1-based line number.
- Return JSON only, no markdown.

Output JSON shape:
{
  "title": "문제 제목",
  "description": "코드의 버그를 찾아 수정하세요.",
  "code": "버그가 있는 코드",
  "bugLine": 2,
  "hints": ["힌트1", "힌트2"]
}`,

  'code-challenge': `Create one C coding test puzzle where the learner writes code and passes test cases.

Requirements:
- Difficulty: {difficulty}
- Topic: {topic}
- All user-facing text (title/description/hints) must be in Korean.
- Description must clearly explain input/output rules.
- Provide starter code in "code".
- Provide at least 3 test cases in "testCases".
- In each test case:
  - "input" is stdin content (use "\\n" for line breaks).
  - "output" is exact stdout text.
- Do not include label-style outputs such as "Value: 3", "Result=3", "Output: 3".
- Return JSON only, no markdown.

Output JSON shape:
{
  "title": "문제 제목",
  "description": "문제 설명",
  "code": "#include <stdio.h>\\nint main(void) {\\n  return 0;\\n}",
  "testCases": [
    { "input": "1 2\\n", "output": "3" },
    { "input": "10 20\\n", "output": "30" },
    { "input": "7 8\\n", "output": "15" }
  ],
  "hints": ["힌트1", "힌트2"]
}`,
};

const PUZZLE_OUTPUT_SCHEMAS: Record<PuzzleType, Record<string, unknown>> = {
  'fill-blank': {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      code: { type: 'string' },
      blanks: {
        type: 'array',
        items: { type: 'string' },
      },
      hints: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['title', 'description', 'code', 'blanks', 'hints'],
  },
  'bug-finder': {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      code: { type: 'string' },
      bugLine: { type: 'integer' },
      hints: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['title', 'description', 'code', 'bugLine', 'hints'],
  },
  'code-challenge': {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      code: { type: 'string' },
      testCases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            input: { type: 'string' },
            output: { type: 'string' },
          },
          required: ['input', 'output'],
        },
      },
      hints: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['title', 'description', 'code', 'testCases', 'hints'],
  },
};

const TOPICS_BY_LEVEL: Record<SkillLevel, string[]> = {
  beginner: ['variables', 'operators', 'if', 'loops', 'printf/scanf'],
  intermediate: ['arrays', 'strings', 'functions', 'pointers basics', 'struct basics'],
  advanced: ['pointer arithmetic', 'dynamic memory', 'file I/O', 'struct pointers', 'function pointers'],
};

const DIFFICULTY_BY_LEVEL: Record<SkillLevel, 1 | 2 | 3> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const DEFAULT_HINT = '입력 형식과 출력 형식을 먼저 정리한 뒤 단계적으로 구현해보세요.';
const DEFAULT_FILL_BLANK_CODE = 'int x = ______;\nprintf("%d\\n", x);';
const DEFAULT_BUG_FINDER_CODE = 'int main(void) {\n    int x = 10;\n    if (x = 5) {\n        printf("%d\\n", x);\n    }\n    return 0;\n}';
const DEFAULT_CHALLENGE_CODE = '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}';

/**
 * Converts unknown error values into readable text.
 *
 * @param {unknown} error - Error-like value.
 * @return {string} Human-readable error message.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parses JSON object from model text, with fallback extraction from the first object block.
 *
 * @param {string} rawText - Raw model output text.
 * @return {Record<string, unknown>} Parsed JSON object.
 */
function parseJsonObject(rawText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to JSON block extraction
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model output did not contain a JSON object.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed JSON value is not an object.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Returns a trimmed string field or fallback value.
 *
 * @param {unknown} value - Unknown candidate value.
 * @param {string} fallback - Fallback string used when value is invalid.
 * @return {string} Normalized string value.
 */
function normalizeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : fallback;
}

/**
 * Normalizes optional hints array into at least one hint.
 *
 * @param {unknown} value - Unknown hints value.
 * @return {string[]} Non-empty hint list.
 */
function normalizeHints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [DEFAULT_HINT];
  }

  const hints = value.filter(
    (hint): hint is string => typeof hint === 'string' && hint.trim().length > 0
  );
  return hints.length > 0 ? hints : [DEFAULT_HINT];
}

/**
 * Normalizes unknown test case data into executable input/output pairs.
 *
 * @param {unknown} value - Unknown test case list from model output.
 * @return {PuzzleTestCase[]} Sanitized test case list.
 */
function normalizeTestCases(value: unknown): PuzzleTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      input: typeof item.input === 'string' ? item.input : '',
      output: typeof item.output === 'string' ? item.output : '',
    }))
    .filter((testCase) => testCase.output.trim().length > 0);
}

/**
 * Generates one puzzle payload from Gemini, with schema mode and text fallback.
 *
 * @param {string} prompt - Prepared puzzle generation prompt.
 * @param {Record<string, unknown>} outputSchema - JSON schema used for structured response.
 * @return {Promise<Record<string, unknown>>} Parsed puzzle data object.
 */
async function generatePuzzlePayload(
  prompt: string,
  outputSchema: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = await getGeminiClient();

  try {
    const structured = await client.runTurn({
      prompt,
      outputSchema,
      timeoutSeconds: 45,
    });
    return parseJsonObject(structured.text);
  } catch (structuredError) {
    const fallbackPrompt = `${prompt}\n\nReturn one JSON object only. Do not include markdown code fences.`;
    const fallback = await client.runTurn({
      prompt: fallbackPrompt,
      timeoutSeconds: 45,
    });

    try {
      return parseJsonObject(fallback.text);
    } catch (fallbackError) {
      throw new Error(
        `Puzzle generation failed: structured=${toErrorMessage(structuredError)}; fallback=${toErrorMessage(fallbackError)}`
      );
    }
  }
}

/**
 * Builds a strongly-typed puzzle from normalized raw model data.
 *
 * @param {PuzzleType} type - Requested puzzle type.
 * @param {Record<string, unknown>} data - Parsed model payload.
 * @param {1 | 2 | 3} difficulty - Difficulty assigned from skill level.
 * @return {Puzzle} Fully normalized puzzle payload.
 */
function toPuzzle(type: PuzzleType, data: Record<string, unknown>, difficulty: 1 | 2 | 3): Puzzle {
  const title = normalizeString(data.title, '새 문제');
  const description = normalizeString(data.description, '');
  const hints = normalizeHints(data.hints);

  if (type === 'fill-blank') {
    const blanks = Array.isArray(data.blanks)
      ? data.blanks.filter((blank): blank is string => typeof blank === 'string' && blank.trim().length > 0)
      : [];

    return {
      id: `${type}-${Date.now()}`,
      type,
      title,
      description,
      code: normalizeString(data.code, DEFAULT_FILL_BLANK_CODE),
      blanks: blanks.length > 0 ? blanks : ['0'],
      hints,
      difficulty,
    };
  }

  if (type === 'bug-finder') {
    const bugLine = typeof data.bugLine === 'number' && Number.isFinite(data.bugLine)
      ? Math.max(1, Math.floor(data.bugLine))
      : 1;

    return {
      id: `${type}-${Date.now()}`,
      type,
      title,
      description,
      code: normalizeString(data.code, DEFAULT_BUG_FINDER_CODE),
      bugLine,
      hints,
      difficulty,
    };
  }

  const testCases = normalizeTestCases(data.testCases);
  const expectedOutput =
    normalizeString(data.expectedOutput, '').trim().length > 0
      ? normalizeString(data.expectedOutput, '')
      : '';
  const normalizedCases = testCases.length > 0
    ? testCases
    : expectedOutput
      ? [{ input: '', output: expectedOutput }]
      : [];

  return {
    id: `${type}-${Date.now()}`,
    type,
    title,
    description,
    code: normalizeString(data.code, DEFAULT_CHALLENGE_CODE),
    testCases: normalizedCases,
    expectedOutput: normalizedCases[0]?.output || '',
    hints,
    difficulty,
  };
}

/**
 * Generates one puzzle with Gemini for the requested type and learner level.
 *
 * @param {PuzzleType} type - Puzzle format to generate.
 * @param {SkillLevel} [skillLevel='beginner'] - Learner level used to pick difficulty and topics.
 * @param {string} [topic] - Optional explicit topic override.
 * @return {Promise<Puzzle>} Generated puzzle payload.
 */
export async function generatePuzzle(
  type: PuzzleType,
  skillLevel: SkillLevel = 'beginner',
  topic?: string
): Promise<Puzzle> {
  const topics = TOPICS_BY_LEVEL[skillLevel];
  const selectedTopic = topic || topics[Math.floor(Math.random() * topics.length)];
  const difficulty = DIFFICULTY_BY_LEVEL[skillLevel];

  const prompt = PUZZLE_PROMPTS[type]
    .replace('{difficulty}', `${difficulty} (1=easy, 2=medium, 3=hard)`)
    .replace('{topic}', selectedTopic);

  try {
    const data = await generatePuzzlePayload(prompt, PUZZLE_OUTPUT_SCHEMAS[type]);
    return toPuzzle(type, data, difficulty);
  } catch {
    throw new Error('문제 생성 실패: Gemini 연결을 확인하세요');
  }
}

/**
 * Generates multiple puzzles sequentially for the requested set of types.
 *
 * @param {PuzzleType[]} types - Puzzle types to generate.
 * @param {SkillLevel} [skillLevel='beginner'] - Learner level applied to each generated puzzle.
 * @return {Promise<Puzzle[]>} Generated puzzle list in the same order as `types`.
 */
export async function generatePuzzleBatch(
  types: PuzzleType[],
  skillLevel: SkillLevel = 'beginner'
): Promise<Puzzle[]> {
  const puzzles: Puzzle[] = [];

  for (const type of types) {
    const puzzle = await generatePuzzle(type, skillLevel);
    puzzles.push(puzzle);
  }

  return puzzles;
}
