/**
 * Splits generated C code into display lines while preserving escaped newlines
 * inside string/char literals.
 *
 * @param {string} rawCode - Raw code text from model output.
 * @return {string[]} Line array for UI rendering.
 */
export function splitGeneratedCodeLines(rawCode: string): string[] {
  const normalized = normalizeGeneratedCode(rawCode);
  return normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * Normalizes generated C code so escaped newlines outside literals become
 * executable line breaks while preserving escapes inside literals.
 *
 * @param {string} rawCode - Raw code text from model output.
 * @return {string} Normalized executable C code text.
 */
export function normalizeGeneratedCode(rawCode: string): string {
  return normalizeEscapedNewlinesOutsideLiterals(rawCode);
}

/**
 * Converts escaped newline tokens (`\\n`, `\\r\\n`) into real line breaks only
 * when they are outside of C string/char literals.
 *
 * @param {string} source - Source code text to normalize.
 * @return {string} Normalized code text.
 */
function normalizeEscapedNewlinesOutsideLiterals(source: string): string {
  let result = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escapedInLiteral = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (escapedInLiteral) {
      result += char;
      escapedInLiteral = false;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += char;
      continue;
    }

    if (char === '\\') {
      if (inDoubleQuote || inSingleQuote) {
        result += char;
        escapedInLiteral = true;
        continue;
      }

      if (next === 'n') {
        result += '\n';
        i += 1;
        continue;
      }

      if (next === 'r' && source[i + 2] === '\\' && source[i + 3] === 'n') {
        result += '\n';
        i += 3;
        continue;
      }

      if (next === '\\' && source[i + 2] === 'n') {
        result += '\n';
        i += 2;
        continue;
      }

      if (
        next === '\\'
        && source[i + 2] === 'r'
        && source[i + 3] === '\\'
        && source[i + 4] === 'n'
      ) {
        result += '\n';
        i += 4;
        continue;
      }
    }

    result += char;
  }

  return result;
}
