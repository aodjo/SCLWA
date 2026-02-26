import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadGeminiApiKey, saveGeminiApiKey } from './storage.js';

/**
 * Ensures a persisted Gemini API key exists before the app UI starts.
 *
 * @return {Promise<void>} Resolves after key exists in local config.
 */
export async function ensureGeminiApiKey(): Promise<void> {
  const existingKey = await loadGeminiApiKey();
  if (existingKey) {
    return;
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error('Gemini API 키가 없고 대화형 입력이 불가능합니다. ~/.sclwa/config.json에 키를 설정하세요.');
  }

  const rl = createInterface({ input, output });
  try {
    output.write('\n[Gemini 설정] API 키가 필요합니다.\n');
    const apiKey = (await rl.question('Gemini API Key를 입력하세요: ')).trim();
    if (!apiKey) {
      throw new Error('API 키 입력이 필요합니다.');
    }

    await saveGeminiApiKey(apiKey);
    output.write('Gemini API 키를 저장했습니다.\n\n');
  } finally {
    rl.close();
  }
}
