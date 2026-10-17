const PUNCTUATION_ONLY_RE = /^[\s\p{P}\p{S}]+$/u

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Identity used to avoid duplicate vocabulary entries. Accents are preserved. */
export function normalizeWordKey(word: string): string {
  return word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .trim()
}

/** Case- and accent-insensitive text used for filtering and searching. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’‘`´]/g, "'")
    .trim()
}

export function isPunctuationOnly(value: string): boolean {
  return !value.trim() || PUNCTUATION_ONLY_RE.test(value)
}

export function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0 || value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
