import type { AnalysisToken, InputMode } from './llm.ts'
import { normalizePos, supportsInflection } from './pos.ts'
import { createId, isPunctuationOnly, isRecord, normalizeWhitespace, truncate } from './text.ts'

export const HISTORY_VERSION = 1
export const MAX_HISTORY_RECORDS = 100
export const STARRED_HISTORY_FORMAT = 'french-sentence-breakdown/starred-history'
export const STARRED_HISTORY_VERSION = 1

export interface HistorySentence {
  source: string
  translation: string
  tokens: AnalysisToken[]
}

export interface HistoryRecord {
  id: string
  createdAt: string
  mode: InputMode
  input: string
  translatedText: string
  sentences: HistorySentence[]
  tokenCount: number
  usedCompatMode: boolean
}

export interface HistoryState {
  records: HistoryRecord[]
  starred: HistoryRecord[]
}

export interface CompletedAnalysisInput {
  mode: InputMode
  input: string
  translatedText: string
  sentences: HistorySentence[]
  usedCompatMode: boolean
}

export interface StarredHistoryExport {
  format: string
  version: number
  exportedAt: string
  records: HistoryRecord[]
}

const MAX_INPUT_LENGTH = 8000
const MAX_TRANSLATED_TEXT_LENGTH = 12_000
const MAX_SOURCE_LENGTH = 8000
const MAX_TRANSLATION_LENGTH = 1200
const MAX_TOKEN_LENGTH = 120
const MAX_MEANING_LENGTH = 300
const MAX_PRONUNCIATION_LENGTH = 120
const MAX_LEMMA_LENGTH = 120

function normalizeHistoryToken(raw: unknown): AnalysisToken | null {
  if (!isRecord(raw) || typeof raw.text !== 'string') return null
  const text = normalizeWhitespace(raw.text)
  if (!text || isPunctuationOnly(text)) return null

  const pos = normalizePos(raw.pos)
  if (!pos) return null

  const lemma =
    typeof raw.lemma === 'string' ? truncate(normalizeWhitespace(raw.lemma), MAX_LEMMA_LENGTH) : ''
  const meaning =
    typeof raw.meaning === 'string'
      ? truncate(normalizeWhitespace(raw.meaning), MAX_MEANING_LENGTH)
      : ''
  const respelling =
    typeof raw.respelling === 'string'
      ? truncate(normalizeWhitespace(raw.respelling), MAX_PRONUNCIATION_LENGTH)
      : ''
  const ipa =
    typeof raw.ipa === 'string'
      ? truncate(normalizeWhitespace(raw.ipa), MAX_PRONUNCIATION_LENGTH)
      : ''
  const inflection =
    supportsInflection(pos) && typeof raw.inflection === 'string'
      ? truncate(normalizeWhitespace(raw.inflection), 60)
      : ''

  return {
    text: truncate(text, MAX_TOKEN_LENGTH),
    pos,
    inflection,
    lemma,
    meaning: meaning || '—',
    respelling,
    ipa,
  }
}

function normalizeHistorySentence(raw: unknown): HistorySentence | null {
  if (!isRecord(raw) || typeof raw.source !== 'string') return null

  const source = truncate(normalizeWhitespace(raw.source), MAX_SOURCE_LENGTH)
  if (!source || !Array.isArray(raw.tokens)) return null

  const translation =
    typeof raw.translation === 'string'
      ? truncate(normalizeWhitespace(raw.translation), MAX_TRANSLATION_LENGTH)
      : ''

  const tokens = raw.tokens
    .map((token) => normalizeHistoryToken(token))
    .filter((token): token is AnalysisToken => token !== null)

  return tokens.length > 0 ? { source, translation, tokens } : null
}

function normalizeHistoryRecord(raw: unknown): HistoryRecord | null {
  if (!isRecord(raw)) return null

  const input = typeof raw.input === 'string' ? truncate(raw.input.trim(), MAX_INPUT_LENGTH) : ''
  if (!input || !Array.isArray(raw.sentences)) return null

  const sentences = raw.sentences
    .map((sentence) => normalizeHistorySentence(sentence))
    .filter((sentence): sentence is HistorySentence => sentence !== null)
  if (sentences.length === 0) return null

  let createdAt = new Date().toISOString()
  if (typeof raw.createdAt === 'string') {
    const parsed = new Date(raw.createdAt)
    if (!Number.isNaN(parsed.getTime())) createdAt = parsed.toISOString()
  }

  const rawId = typeof raw.id === 'string' ? raw.id.trim() : ''
  const id = rawId && rawId.length <= 120 ? rawId : createId()
  const mode: InputMode = raw.mode === 'english' ? 'english' : 'french'
  const translatedText =
    mode === 'english' && typeof raw.translatedText === 'string'
      ? truncate(raw.translatedText.trim(), MAX_TRANSLATED_TEXT_LENGTH)
      : ''

  return {
    id,
    createdAt,
    mode,
    input,
    translatedText,
    sentences,
    tokenCount: sentences.reduce((total, sentence) => total + sentence.tokens.length, 0),
    usedCompatMode: raw.usedCompatMode === true,
  }
}

/** Builds a normalized, cloned record suitable for localStorage. */
export function createHistoryRecord(
  data: CompletedAnalysisInput,
  now: Date = new Date(),
): HistoryRecord | null {
  return normalizeHistoryRecord({
    id: createId(),
    createdAt: now.toISOString(),
    mode: data.mode,
    input: data.input,
    translatedText: data.translatedText,
    sentences: data.sentences,
    usedCompatMode: data.usedCompatMode,
  })
}

export function sortHistoryRecords(records: HistoryRecord[]): HistoryRecord[] {
  return [...records].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )
}

export function serializeHistory(records: HistoryRecord[], starred: HistoryRecord[]): string {
  return JSON.stringify({
    version: HISTORY_VERSION,
    records: records.slice(0, MAX_HISTORY_RECORDS),
    starred,
  })
}

function normalizeRecordList(rawRecords: unknown[]): HistoryRecord[] {
  const records: HistoryRecord[] = []
  const seenIds = new Set<string>()

  for (const raw of rawRecords) {
    const record = normalizeHistoryRecord(raw)
    if (!record) continue
    if (seenIds.has(record.id)) record.id = createId()
    seenIds.add(record.id)
    records.push(record)
  }

  return sortHistoryRecords(records)
}

/**
 * Tolerant loader for both the current { records, starred } envelope and
 * older { records } / bare-array data. Regular history is capped; starred
 * records are preserved independently.
 */
export function normalizeHistoryState(input: unknown): HistoryState {
  let rawRecords: unknown[] = []
  let rawStarred: unknown[] = []

  if (Array.isArray(input)) {
    rawRecords = input
  } else if (isRecord(input)) {
    if (Array.isArray(input.records)) rawRecords = input.records
    if (Array.isArray(input.starred)) rawStarred = input.starred
  }

  const starred = normalizeRecordList(rawStarred)
  const starredIds = new Set(starred.map((record) => record.id))
  const records = normalizeRecordList(rawRecords)
    .filter((record) => !starredIds.has(record.id))
    .slice(0, MAX_HISTORY_RECORDS)

  return { records, starred }
}

export function buildStarredHistoryExport(
  records: HistoryRecord[],
  now: Date = new Date(),
): StarredHistoryExport {
  return {
    format: STARRED_HISTORY_FORMAT,
    version: STARRED_HISTORY_VERSION,
    exportedAt: now.toISOString(),
    records,
  }
}
