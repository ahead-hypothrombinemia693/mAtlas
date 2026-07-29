export function normalizeCitationPart(value: unknown): string {
  return String(value ?? '').trim()
    .replace(/(?:\s*\([^)]*\))+$/g, '')
    .trim()
    .toLowerCase();
}

export function splitSourceLabel(label: string): { prefix: string; rest: string } {
  const separator = ' — ';
  const [prefix = '', ...restParts] = label.split(separator);
  return { prefix, rest: restParts.join(separator) };
}

export function shortenSourceLabel(
  label: string,
  title: string,
  citationLegend: Readonly<Record<string, string>> = {}
): string {
  const { prefix, rest } = splitSourceLabel(label);
  const prefixShort = citationLegend[prefix] ?? prefix;
  const normalizedRest = normalizeCitationPart(rest);
  const normalizedTitle = normalizeCitationPart(title);
  if (rest && normalizedRest && normalizedRest === normalizedTitle) return prefixShort;
  if (!rest) return prefixShort;
  return `${prefixShort} — ${rest}`;
}

export function stripInlineMathText(text: string): string {
  return text.replace(/\$([^$\n]+?)\$/g, '$1');
}

export function hasInlineMathText(text: unknown): boolean {
  return /\$([^$\n]+?)\$/.test(String(text ?? ''));
}

export function summarizePlainText(text: string, maxLength = 240): string {
  const normalized = stripInlineMathText(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
