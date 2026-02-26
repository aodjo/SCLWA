export interface Token {
  text: string;
  color?: string;
}

const keywords = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
]);

const types = new Set([
  'int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed',
]);

const preprocessor = [
  '#include', '#define', '#ifdef', '#ifndef', '#endif', '#if', '#else', '#elif', '#pragma',
];

/**
 * Tokenizes a single line of C code and annotates each token with a display color.
 *
 * @param {string} line - Raw source line from the editor.
 * @return {Token[]} Ordered token list suitable for syntax-highlight rendering.
 */
export function highlightC(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const prepMatch = preprocessor.find((p) => remaining.startsWith(p));
    if (prepMatch) {
      tokens.push({ text: remaining, color: 'magenta' });
      break;
    }

    if (remaining.startsWith('//')) {
      tokens.push({ text: remaining, color: 'gray' });
      break;
    }

    const stringMatch = remaining.match(/^"([^"\\]|\\.)*"/);
    if (stringMatch) {
      tokens.push({ text: stringMatch[0], color: 'yellow' });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }

    const charMatch = remaining.match(/^'([^'\\]|\\.)*'/);
    if (charMatch) {
      tokens.push({ text: charMatch[0], color: 'yellow' });
      remaining = remaining.slice(charMatch[0].length);
      continue;
    }

    const numMatch = remaining.match(/^\d+(\.\d+)?/);
    if (numMatch) {
      tokens.push({ text: numMatch[0], color: 'blue' });
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    const idMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (idMatch) {
      const word = idMatch[0];
      let color: string | undefined;

      if (keywords.has(word)) {
        color = 'magenta';
      } else if (types.has(word)) {
        color = 'cyan';
      } else if (word === 'printf' || word === 'scanf' || word === 'main') {
        color = 'green';
      }

      tokens.push({ text: word, color });
      remaining = remaining.slice(word.length);
      continue;
    }

    tokens.push({ text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}
