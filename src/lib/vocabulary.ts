import { normalizePos, type PosTag } from './pos.ts'
import {
  createId,
  isPunctuationOnly,
  isRecord,
  normalizeWhitespace,
  normalizeWordKey,
  truncate,
} from './text.ts'

export interface VocabularyEntry {
  id: string
  word: string
  pos: PosTag
  lemma: string
  meaning: string
  respelling: string
  ipa: string
  context: string
  addedAt: string
}

export interface VocabularyImportResult {
  entries: VocabularyEntry[]
  invalid: number
}

export interface VocabularyMergeResult {
  entries: VocabularyEntry[]
  added: number
  skipped: number
}

export interface VocabularyExport {
  format: string
  version: number
  exportedAt: string
  entries: VocabularyEntry[]
}

export class VocabularyImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VocabularyImportError'
  }
}

export const VOCABULARY_FORMAT = 'french-sentence-breakdown/vocabulary'
export const VOCABULARY_VERSION = 1
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ENTRIES = 10000

const MAX_WORD_LENGTH = 100
const MAX_MEANING_LENGTH = 300
const MAX_LEMMA_LENGTH = 120
const MAX_PRONUNCIATION_LENGTH = 120
const MAX_CONTEXT_LENGTH = 400

export function vocabularyEntryKey(word: string, pos: PosTag): string {
  return `${normalizeWordKey(word)}|${pos}`
}

export function vocabularyKeyOfEntry(entry: VocabularyEntry): string {
  return vocabularyEntryKey(entry.word, entry.pos)
}

export function createVocabularyEntry(
  token: {
    text: string
    pos: PosTag
    lemma: string
    meaning: string
    respelling: string
    ipa: string
  },
  context: string,
  now: Date = new Date(),
): VocabularyEntry {
  return {
    id: createId(),
    word: truncate(normalizeWhitespace(token.text), MAX_WORD_LENGTH),
    pos: token.pos,
    lemma: truncate(normalizeWhitespace(token.lemma), MAX_LEMMA_LENGTH),
    meaning: truncate(normalizeWhitespace(token.meaning), MAX_MEANING_LENGTH),
    respelling: truncate(normalizeWhitespace(token.respelling), MAX_PRONUNCIATION_LENGTH),
    ipa: truncate(normalizeWhitespace(token.ipa), MAX_PRONUNCIATION_LENGTH),
    context: truncate(normalizeWhitespace(context), MAX_CONTEXT_LENGTH),
    addedAt: now.toISOString(),
  }
}

function coerceImportedEntry(raw: unknown, nowIso: string): VocabularyEntry | null {
  if (!isRecord(raw)) return null

  const word =
    typeof raw.word === 'string' ? truncate(normalizeWhitespace(raw.word), MAX_WORD_LENGTH) : ''
  if (!word || isPunctuationOnly(word)) return null

  const pos = normalizePos(raw.pos)
  if (!pos) return null

  const meaning =
    typeof raw.meaning === 'string'
      ? truncate(normalizeWhitespace(raw.meaning), MAX_MEANING_LENGTH)
      : ''
  if (!meaning) return null

  const lemma =
    typeof raw.lemma === 'string' ? truncate(normalizeWhitespace(raw.lemma), MAX_LEMMA_LENGTH) : ''
  const respelling =
    typeof raw.respelling === 'string'
      ? truncate(normalizeWhitespace(raw.respelling), MAX_PRONUNCIATION_LENGTH)
      : ''
  const ipa =
    typeof raw.ipa === 'string'
      ? truncate(normalizeWhitespace(raw.ipa), MAX_PRONUNCIATION_LENGTH)
      : ''
  const context =
    typeof raw.context === 'string'
      ? truncate(normalizeWhitespace(raw.context), MAX_CONTEXT_LENGTH)
      : ''

  let addedAt = nowIso
  if (typeof raw.addedAt === 'string') {
    const parsed = new Date(raw.addedAt)
    if (!Number.isNaN(parsed.getTime())) addedAt = parsed.toISOString()
  }

  const rawId = typeof raw.id === 'string' ? raw.id.trim() : ''
  const id = rawId && rawId.length <= 120 ? rawId : createId()

  return { id, word, pos, lemma, meaning, respelling, ipa, context, addedAt }
}

function rawEntryList(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (isRecord(input) && Array.isArray(input.entries)) {
    if (typeof input.version === 'number' && input.version > VOCABULARY_VERSION) {
      throw new VocabularyImportError(
        `导入文件版本（${input.version}）高于当前支持版本（${VOCABULARY_VERSION}）。`,
      )
    }
    return input.entries
  }
  throw new VocabularyImportError('文件结构无法识别，应为本站导出的生词本 JSON。')
}

export function parseImportedEntries(input: unknown): VocabularyImportResult {
  const rawEntries = rawEntryList(input)
  if (rawEntries.length > MAX_IMPORT_ENTRIES) {
    throw new VocabularyImportError(`单个文件最多导入 ${MAX_IMPORT_ENTRIES} 个生词。`)
  }

  const nowIso = new Date().toISOString()
  const entries: VocabularyEntry[] = []
  let invalid = 0

  for (const raw of rawEntries) {
    const entry = coerceImportedEntry(raw, nowIso)
    if (entry) entries.push(entry)
    else invalid += 1
  }

  return { entries, invalid }
}

export function parseImportText(rawText: string): VocabularyImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new VocabularyImportError('文件不是合法的 JSON。')
  }
  return parseImportedEntries(parsed)
}

/** Tolerant loader for localStorage data; never throws. */
export function normalizeStoredVocabulary(input: unknown): VocabularyEntry[] {
  let rawEntries: unknown[] = []
  if (Array.isArray(input)) rawEntries = input
  else if (isRecord(input) && Array.isArray(input.entries)) rawEntries = input.entries

  const nowIso = new Date().toISOString()
  const entries: VocabularyEntry[] = []
  const seen = new Set<string>()

  for (const raw of rawEntries.slice(0, MAX_IMPORT_ENTRIES)) {
    const entry = coerceImportedEntry(raw, nowIso)
    if (!entry) continue
    const key = vocabularyKeyOfEntry(entry)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }

  return entries
}

export function mergeVocabularyEntries(
  existing: VocabularyEntry[],
  incoming: VocabularyEntry[],
): VocabularyMergeResult {
  const entries = [...existing]
  const keys = new Set(existing.map(vocabularyKeyOfEntry))
  const ids = new Set(existing.map((entry) => entry.id))
  let added = 0
  let skipped = 0

  for (const item of incoming) {
    const key = vocabularyKeyOfEntry(item)
    if (keys.has(key)) {
      skipped += 1
      continue
    }

    const entry = { ...item }
    if (!entry.id || ids.has(entry.id)) entry.id = createId()
    entries.push(entry)
    keys.add(key)
    ids.add(entry.id)
    added += 1
  }

  return { entries, added, skipped }
}

export function buildVocabularyExport(
  entries: VocabularyEntry[],
  now: Date = new Date(),
): VocabularyExport {
  return {
    format: VOCABULARY_FORMAT,
    version: VOCABULARY_VERSION,
    exportedAt: now.toISOString(),
    entries: entries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      pos: entry.pos,
      lemma: entry.lemma,
      meaning: entry.meaning,
      respelling: entry.respelling,
      ipa: entry.ipa,
      context: entry.context,
      addedAt: entry.addedAt,
    })),
  }
}
