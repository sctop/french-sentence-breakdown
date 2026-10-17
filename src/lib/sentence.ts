import { isPunctuationOnly } from './text.ts'

export const MAX_INPUT_CHARS = 8000
export const MAX_SENTENCES = 100
export const BATCH_MAX_SENTENCES = 8
export const BATCH_MAX_CHARS = 1200

const TERMINATORS = new Set(['.', '!', '?', ';', '…', '。', '！', '？', '；'])
const FULL_WIDTH_TERMINATORS = new Set(['。', '！', '？', '；', '…'])
const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']', '}', '）', '】', '》', '」', '』'])

const ABBREVIATIONS = new Set([
  'm',
  'mm',
  'mme',
  'mmes',
  'mlle',
  'mlles',
  'dr',
  'pr',
  'st',
  'ste',
  'cf',
  'ex',
  'p',
  'pp',
  'vol',
  'fig',
  'chap',
  'art',
  'env',
  'av',
  'apr',
])

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character)
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

/** Prevent treating the dot in "M. Dupont" or "J. Dupont" as a sentence end. */
function isAbbreviationDot(text: string, dotIndex: number): boolean {
  let index = dotIndex - 1
  while (index >= 0 && !isWhitespace(text[index])) index -= 1
  const prefix = text.slice(index + 1, dotIndex)
  const bare = prefix.replace(/^[«"'“‘(]+/, '').trim()
  if (!bare) return false
  if (ABBREVIATIONS.has(bare.toLowerCase())) return true
  return /^[A-ZÀ-ÖØ-Þ]$/.test(bare)
}

/**
 * Split normalized French text into sentences at . ! ? ; and ellipses.
 * Closing quotes/brackets that follow the punctuation are kept in the sentence.
 */
export function splitSentences(raw: string): string[] {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return []

  const sentences: string[] = []
  let start = 0
  let index = 0

  while (index < text.length) {
    const character = text[index]
    if (character === undefined || !TERMINATORS.has(character)) {
      index += 1
      continue
    }

    if (character === '.' && isDigit(text[index - 1]) && isDigit(text[index + 1])) {
      index += 1
      continue
    }

    if (character === '.' && isAbbreviationDot(text, index)) {
      index += 1
      continue
    }

    let end = index + 1
    while (end < text.length) {
      const next = text[end]
      if (next === undefined || !TERMINATORS.has(next)) break
      end += 1
    }

    // Keep closing quotes/brackets even when French typography adds a space before them.
    let scan = end
    while (scan < text.length && text[scan] === ' ') scan += 1
    let closerEnd = scan
    while (closerEnd < text.length) {
      const next = text[closerEnd]
      if (next === undefined || !CLOSERS.has(next)) break
      closerEnd += 1
    }
    const hasCloser = closerEnd > scan
    if (hasCloser) end = closerEnd

    const nextCharacter = text[end]
    const canSplit =
      nextCharacter === undefined ||
      isWhitespace(nextCharacter) ||
      hasCloser ||
      FULL_WIDTH_TERMINATORS.has(character) ||
      character === '!' ||
      character === '?' ||
      character === ';'

    if (!canSplit) {
      index = end
      continue
    }

    const fragment = text.slice(start, end).trim()
    if (fragment && !isPunctuationOnly(fragment)) sentences.push(fragment)
    start = end
    index = end
  }

  const tail = text.slice(start).trim()
  if (tail && !isPunctuationOnly(tail)) sentences.push(tail)
  return sentences
}

/** Group sentences into sequential batches to keep each LLM request bounded. */
export function chunkSentences(
  sentences: readonly string[],
  maxSentences: number = BATCH_MAX_SENTENCES,
  maxChars: number = BATCH_MAX_CHARS,
): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let currentChars = 0

  for (const sentence of sentences) {
    if (
      current.length > 0 &&
      (current.length >= maxSentences || currentChars + sentence.length > maxChars)
    ) {
      batches.push(current)
      current = []
      currentChars = 0
    }
    current.push(sentence)
    currentChars += sentence.length
  }

  if (current.length > 0) batches.push(current)
  return batches
}
