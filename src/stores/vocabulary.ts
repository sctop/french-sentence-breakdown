import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { readStorage, writeJson } from '@/lib/storage'
import {
  VOCABULARY_VERSION,
  createVocabularyEntry,
  mergeVocabularyEntries,
  normalizeStoredVocabulary,
  parseImportText,
  vocabularyEntryKey,
  type VocabularyEntry,
} from '@/lib/vocabulary'
import type { AnalysisToken } from '@/lib/llm'
import type { PosTag } from '@/lib/pos'

const STORAGE_KEY = 'fsb:vocabulary:v1'

interface StoredVocabulary {
  version: number
  entries: VocabularyEntry[]
}

export type VocabularyImportOutcome =
  { ok: true; added: number; skipped: number; invalid: number } | { ok: false; error: string }

function loadEntries(): { entries: VocabularyEntry[]; corrupted: boolean } {
  const raw = readStorage(STORAGE_KEY)
  if (!raw) return { entries: [], corrupted: false }

  try {
    const parsed: unknown = JSON.parse(raw)
    return { entries: normalizeStoredVocabulary(parsed), corrupted: false }
  } catch {
    return { entries: [], corrupted: true }
  }
}

export const useVocabularyStore = defineStore('vocabulary', () => {
  const toast = useToast()
  const loaded = loadEntries()
  const entries = ref<VocabularyEntry[]>(loaded.entries)
  let warnedWriteFailure = false
  let warnedCorruption = false

  if (loaded.corrupted && !warnedCorruption) {
    warnedCorruption = true
    toast.error('浏览器里的生词本数据无法解析，已从空白生词本开始。')
  }

  const count = computed(() => entries.value.length)
  const savedKeys = computed(
    () => new Set(entries.value.map((entry) => vocabularyEntryKey(entry.word, entry.pos))),
  )

  function persist(): boolean {
    const payload: StoredVocabulary = {
      version: VOCABULARY_VERSION,
      entries: entries.value,
    }
    const ok = writeJson(STORAGE_KEY, payload)
    if (!ok && !warnedWriteFailure) {
      warnedWriteFailure = true
      toast.error('无法写入浏览器本地存储，生词本的修改可能不会保存。')
    }
    return ok
  }

  function isSaved(word: string, pos: PosTag): boolean {
    return savedKeys.value.has(vocabularyEntryKey(word, pos))
  }

  function addToken(token: AnalysisToken, context: string): 'added' | 'exists' {
    if (isSaved(token.text, token.pos)) return 'exists'
    entries.value = [...entries.value, createVocabularyEntry(token, context)]
    persist()
    return 'added'
  }

  function remove(id: string): VocabularyEntry | null {
    const removed = entries.value.find((entry) => entry.id === id) ?? null
    if (!removed) return null
    entries.value = entries.value.filter((entry) => entry.id !== id)
    persist()
    return removed
  }

  function restore(entry: VocabularyEntry): boolean {
    if (isSaved(entry.word, entry.pos)) return false
    entries.value = [...entries.value, entry]
    persist()
    return true
  }

  function clear(): void {
    entries.value = []
    persist()
  }

  function importFromText(rawText: string): VocabularyImportOutcome {
    try {
      const parsed = parseImportText(rawText)
      const merged = mergeVocabularyEntries(entries.value, parsed.entries)
      entries.value = merged.entries
      persist()
      return {
        ok: true,
        added: merged.added,
        skipped: merged.skipped,
        invalid: parsed.invalid,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '导入失败，请检查文件内容。',
      }
    }
  }

  return {
    entries,
    count,
    isSaved,
    addToken,
    remove,
    restore,
    clear,
    importFromText,
  }
})
