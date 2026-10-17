import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import {
  MAX_HISTORY_RECORDS,
  createHistoryRecord,
  normalizeHistoryState,
  serializeHistory,
  sortHistoryRecords,
  type CompletedAnalysisInput,
  type HistoryRecord,
} from '@/lib/history'
import { readStorage, writeStorage } from '@/lib/storage'

const STORAGE_KEY = 'fsb:history:v1'

interface LoadedHistory {
  records: HistoryRecord[]
  starred: HistoryRecord[]
  corrupted: boolean
}

interface PersistOutcome {
  ok: boolean
  records: HistoryRecord[]
  starred: HistoryRecord[]
  evicted: number
}

function loadHistory(): LoadedHistory {
  const raw = readStorage(STORAGE_KEY)
  if (!raw) return { records: [], starred: [], corrupted: false }

  try {
    const parsed: unknown = JSON.parse(raw)
    const state = normalizeHistoryState(parsed)
    return { ...state, corrupted: false }
  } catch {
    return { records: [], starred: [], corrupted: true }
  }
}

export const useHistoryStore = defineStore('history', () => {
  const toast = useToast()
  const loaded = loadHistory()
  const records = ref<HistoryRecord[]>(loaded.records)
  const starred = ref<HistoryRecord[]>(loaded.starred)

  let warnedWriteFailure = false
  let warnedCorruption = false

  if (loaded.corrupted && !warnedCorruption) {
    warnedCorruption = true
    toast.error('浏览器里的分析历史无法解析，已从空白历史开始。')
  }

  const count = computed(() => records.value.length)
  const starredCount = computed(() => starred.value.length)
  const totalCount = computed(() => count.value + starredCount.value)

  function warnWriteFailure(): void {
    if (warnedWriteFailure) return
    warnedWriteFailure = true
    toast.error('无法写入浏览器本地存储，分析历史可能无法保存。')
  }

  function writeState(
    candidateRecords: HistoryRecord[],
    candidateStarred: HistoryRecord[],
  ): boolean {
    try {
      return writeStorage(STORAGE_KEY, serializeHistory(candidateRecords, candidateStarred))
    } catch {
      return false
    }
  }

  /**
   * Persist the state. Starred records are never evicted. If localStorage is
   * full, drop the oldest regular records one by one until the write succeeds.
   */
  function persistWithEviction(
    nextRecords: HistoryRecord[],
    nextStarred: HistoryRecord[],
  ): PersistOutcome {
    let candidateRecords = sortHistoryRecords(nextRecords).slice(0, MAX_HISTORY_RECORDS)
    const candidateStarred = sortHistoryRecords(nextStarred)
    let evicted = 0

    while (true) {
      if (writeState(candidateRecords, candidateStarred)) {
        return { ok: true, records: candidateRecords, starred: candidateStarred, evicted }
      }
      if (candidateRecords.length === 0) {
        return { ok: false, records: records.value, starred: starred.value, evicted }
      }
      candidateRecords = candidateRecords.slice(0, -1)
      evicted += 1
    }
  }

  function apply(outcome: PersistOutcome): void {
    records.value = outcome.records
    starred.value = outcome.starred
  }

  function notifyEvicted(evicted: number): void {
    if (evicted === 0) return
    toast.info(`本地存储空间不足，已清理 ${evicted} 条较早的普通历史；星标记录已保留。`)
  }

  function addCompletedAnalysis(data: CompletedAnalysisInput): boolean {
    const record = createHistoryRecord(data)
    if (!record) return false

    const outcome = persistWithEviction([record, ...records.value], starred.value)
    if (!outcome.ok) {
      warnWriteFailure()
      return false
    }

    apply(outcome)
    notifyEvicted(outcome.evicted)
    return true
  }

  function star(id: string): boolean {
    const record = records.value.find((item) => item.id === id)
    if (!record) return false

    const nextRecords = records.value.filter((item) => item.id !== id)
    const outcome = persistWithEviction(nextRecords, [record, ...starred.value])
    if (!outcome.ok) {
      warnWriteFailure()
      return false
    }

    apply(outcome)
    notifyEvicted(outcome.evicted)
    return true
  }

  function unstar(id: string): boolean {
    const record = starred.value.find((item) => item.id === id)
    if (!record) return false

    const nextStarred = starred.value.filter((item) => item.id !== id)
    const outcome = persistWithEviction([record, ...records.value], nextStarred)
    if (!outcome.ok) {
      warnWriteFailure()
      return false
    }

    apply(outcome)
    notifyEvicted(outcome.evicted)
    return true
  }

  function remove(id: string): boolean {
    const nextRecords = records.value.filter((record) => record.id !== id)
    if (nextRecords.length === records.value.length) return false

    const outcome = persistWithEviction(nextRecords, starred.value)
    if (!outcome.ok) {
      warnWriteFailure()
      return false
    }

    apply(outcome)
    notifyEvicted(outcome.evicted)
    return true
  }

  /** Clears regular history only; starred records are intentionally preserved. */
  function clear(): boolean {
    const outcome = persistWithEviction([], starred.value)
    if (!outcome.ok) {
      warnWriteFailure()
      return false
    }
    apply(outcome)
    return true
  }

  return {
    records,
    starred,
    count,
    starredCount,
    totalCount,
    addCompletedAnalysis,
    star,
    unstar,
    remove,
    clear,
  }
})
