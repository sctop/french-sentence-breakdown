import type { HistoryRecord } from './history.ts'
import type { VocabularyEntry } from './vocabulary.ts'

export const BACKUP_FORMAT = 'french-sentence-breakdown/backup'
export const BACKUP_VERSION = 1

export interface FullBackupExport {
  format: string
  version: number
  exportedAt: string
  vocabulary: VocabularyEntry[]
  starredHistory: HistoryRecord[]
}

/** Combined backup of the vocabulary and the persistent starred analyses. */
export function buildFullBackup(
  vocabularyEntries: VocabularyEntry[],
  starredRecords: HistoryRecord[],
  now: Date = new Date(),
): FullBackupExport {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    vocabulary: vocabularyEntries,
    starredHistory: starredRecords,
  }
}
