export function preview(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = normalized.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}
