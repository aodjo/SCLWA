import { stdin as input, stdout as output } from 'node:process';
import { loadGeminiApiKey, saveGeminiApiKey } from './storage.js';

/**
 * Prompts one line of hidden input and echoes `*` characters.
 *
 * @param {string} prompt - Prompt text shown before input.
 * @return {Promise<string>} Entered input string.
 */
async function promptHiddenInput(prompt: string): Promise<string> {
  output.write(prompt);

  if (typeof input.setRawMode !== 'function') {
    throw new Error('현재 터미널에서 보안 입력을 지원하지 않습니다.');
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
    };

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');

      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('입력이 취소되었습니다.'));
          return;
        }

        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }

        if (char === '\u0008' || char === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }

        if (char === '\u001b') {
          continue;
        }

        value += char;
        output.write('*');
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

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

  output.write('\n[Gemini 설정] API 키가 필요합니다.\n');
  const apiKey = (await promptHiddenInput('Gemini API Key를 입력하세요: ')).trim();
  if (!apiKey) {
    throw new Error('API 키 입력이 필요합니다.');
  }

  await saveGeminiApiKey(apiKey);
  output.write('Gemini API 키를 저장했습니다.\n\n');
}
