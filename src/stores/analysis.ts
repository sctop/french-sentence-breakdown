import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  analyzeSentences,
  LlmError,
  translateToFrench,
  validateApiSettings,
  type AnalysisToken,
  type ApiSettings,
  type InputMode,
} from '@/lib/llm'
import { MAX_INPUT_CHARS, MAX_SENTENCES, chunkSentences, splitSentences } from '@/lib/sentence'
import type { HistoryRecord } from '@/lib/history'
import { useHistoryStore } from './history'
import { useSettingsStore } from './settings'

export type AnalysisPhase = 'idle' | 'running' | 'done' | 'error' | 'cancelled'
export type SentenceStatus = 'queued' | 'loading' | 'done' | 'error'
export type RequestStage = 'idle' | 'translating' | 'analyzing'

export interface AnalysisSentence {
  id: string
  source: string
  translation: string
  status: SentenceStatus
  tokens: AnalysisToken[]
  error: string
}

function createSentence(source: string, index: number, runId: number): AnalysisSentence {
  return {
    id: `sentence-${runId}-${index}`,
    source,
    translation: '',
    status: 'queued',
    tokens: [],
    error: '',
  }
}

export const useAnalysisStore = defineStore('analysis', () => {
  const mode = ref<InputMode>('french')
  const input = ref('')
  const translatedText = ref('')
  const sentences = ref<AnalysisSentence[]>([])
  const phase = ref<AnalysisPhase>('idle')
  const requestStage = ref<RequestStage>('idle')
  const globalError = ref('')
  const usedCompatMode = ref(false)
  const batchIndex = ref(0)
  const batchTotal = ref(0)

  let controller: AbortController | null = null
  let runSequence = 0

  const running = computed(() => phase.value === 'running')
  const translating = computed(
    () => phase.value === 'running' && requestStage.value === 'translating',
  )
  const isEnglishMode = computed(() => mode.value === 'english')
  const totalCount = computed(() => sentences.value.length)
  const doneCount = computed(
    () => sentences.value.filter((sentence) => sentence.status === 'done').length,
  )
  const progressPercent = computed(() =>
    totalCount.value === 0 ? 0 : Math.round((doneCount.value / totalCount.value) * 100),
  )
  const tokenCount = computed(() =>
    sentences.value.reduce((total, sentence) => total + sentence.tokens.length, 0),
  )
  const hasPending = computed(() =>
    sentences.value.some((sentence) => sentence.status === 'queued' || sentence.status === 'error'),
  )
  const canAnalyze = computed(() => input.value.trim().length > 0 && !running.value)

  function abortCurrent(): void {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  function currentSettings(): { settings: ApiSettings; error: string } {
    const settingsStore = useSettingsStore()
    const validation = validateApiSettings(settingsStore.settings)
    if (!validation.ok) {
      return { settings: settingsStore.settings, error: validation.error }
    }
    return { settings: validation.settings, error: '' }
  }

  function saveCompletedAnalysis(): void {
    if (sentences.value.length === 0) return
    if (!sentences.value.every((sentence) => sentence.status === 'done')) return

    try {
      useHistoryStore().addCompletedAnalysis({
        mode: mode.value,
        input: input.value,
        translatedText: translatedText.value,
        sentences: sentences.value.map((sentence) => ({
          source: sentence.source,
          translation: sentence.translation,
          tokens: sentence.tokens,
        })),
        usedCompatMode: usedCompatMode.value,
      })
    } catch {
      // History persistence must never interrupt a completed analysis.
    }
  }

  async function runBatches(
    targets: AnalysisSentence[],
    settings: ApiSettings,
    currentRun: number,
    signal: AbortSignal,
  ): Promise<void> {
    requestStage.value = 'analyzing'
    const batches = chunkSentences(targets.map((target) => target.source))
    batchTotal.value = batches.length
    batchIndex.value = 0
    let offset = 0

    try {
      for (let index = 0; index < batches.length; index += 1) {
        if (currentRun !== runSequence) return
        const batch = batches[index]
        if (!batch) continue

        const batchTargets = targets.slice(offset, offset + batch.length)
        offset += batch.length
        batchIndex.value = index + 1

        for (const target of batchTargets) {
          target.status = 'loading'
          target.error = ''
        }

        const result = await analyzeSentences(settings, batch, { signal })
        if (currentRun !== runSequence) return
        if (result.usedCompatMode) usedCompatMode.value = true

        batchTargets.forEach((target, sentenceIndex) => {
          const parsed = result.sentences[sentenceIndex]
          if (parsed) {
            target.tokens = parsed.tokens
            target.translation = parsed.translation
            target.status = 'done'
            target.error = ''
          } else {
            target.status = 'error'
            target.error = '模型没有返回这一句的分析结果。'
          }
        })
      }

      if (currentRun !== runSequence) return
      phase.value = 'done'
      saveCompletedAnalysis()
    } catch (error) {
      if (currentRun !== runSequence) return

      const aborted = signal.aborted || (error instanceof LlmError && error.kind === 'aborted')
      const message = aborted
        ? ''
        : error instanceof LlmError
          ? error.message
          : '分析失败，请稍后重试。'

      for (const target of targets) {
        if (target.status !== 'loading') continue
        if (aborted) {
          target.status = 'queued'
          target.error = ''
        } else {
          target.status = 'error'
          target.error = message || '这一句分析失败，请重试。'
        }
      }

      if (aborted) {
        phase.value = 'cancelled'
        globalError.value = ''
      } else {
        phase.value = 'error'
        globalError.value = message || '分析失败，请稍后重试。'
      }
    } finally {
      if (currentRun === runSequence) {
        controller = null
        requestStage.value = 'idle'
      }
    }
  }

  async function analyze(): Promise<void> {
    if (running.value) return

    const text = input.value
    if (!text.trim()) {
      phase.value = 'error'
      globalError.value =
        mode.value === 'english' ? '请先输入要翻译的英语文本。' : '请先输入要分析的法语文本。'
      return
    }
    if (text.length > MAX_INPUT_CHARS) {
      phase.value = 'error'
      globalError.value = `文本超过 ${MAX_INPUT_CHARS} 个字符，请缩短后再试。`
      return
    }

    const resolved = currentSettings()
    if (resolved.error) {
      phase.value = 'error'
      globalError.value = `${resolved.error} 请先在设置页完成 API 配置。`
      return
    }

    abortCurrent()
    const currentRun = runSequence + 1
    runSequence = currentRun
    controller = new AbortController()
    const signal = controller.signal

    usedCompatMode.value = false
    globalError.value = ''
    batchIndex.value = 0
    batchTotal.value = 0
    sentences.value = []
    translatedText.value = ''
    phase.value = 'running'
    requestStage.value = mode.value === 'english' ? 'translating' : 'analyzing'

    let frenchText = text

    if (mode.value === 'english') {
      try {
        const result = await translateToFrench(resolved.settings, text.trim(), { signal })
        if (currentRun !== runSequence) return
        translatedText.value = result.translation
        frenchText = result.translation
      } catch (error) {
        if (currentRun !== runSequence) return
        const aborted = signal.aborted || (error instanceof LlmError && error.kind === 'aborted')
        if (aborted) {
          phase.value = 'cancelled'
          globalError.value = ''
        } else {
          phase.value = 'error'
          globalError.value = `翻译失败：${
            error instanceof LlmError ? error.message : '请稍后重试。'
          }`
        }
        requestStage.value = 'idle'
        controller = null
        return
      }
    }

    const parts = splitSentences(frenchText)
    if (parts.length === 0) {
      phase.value = 'error'
      globalError.value =
        mode.value === 'english'
          ? '翻译结果没有可分析的法语句子，请重试。'
          : '没有检测到可分析的法语句子，请补充文本。'
      requestStage.value = 'idle'
      controller = null
      return
    }
    if (parts.length > MAX_SENTENCES) {
      phase.value = 'error'
      globalError.value =
        mode.value === 'english'
          ? `翻译结果共 ${parts.length} 句，超过单次 ${MAX_SENTENCES} 句的上限，请缩短输入。`
          : `共检测到 ${parts.length} 句，超过单次 ${MAX_SENTENCES} 句的上限，请分次分析。`
      requestStage.value = 'idle'
      controller = null
      return
    }

    sentences.value = parts.map((source, index) => createSentence(source, index, currentRun))
    requestStage.value = 'analyzing'

    await runBatches(sentences.value, resolved.settings, currentRun, signal)
  }

  async function retryPending(): Promise<void> {
    if (running.value) return

    const targets = sentences.value.filter(
      (sentence) => sentence.status === 'queued' || sentence.status === 'error',
    )
    if (targets.length === 0) return

    const resolved = currentSettings()
    if (resolved.error) {
      phase.value = 'error'
      globalError.value = `${resolved.error} 请先在设置页完成 API 配置。`
      return
    }

    abortCurrent()
    const currentRun = runSequence + 1
    runSequence = currentRun
    controller = new AbortController()
    const signal = controller.signal

    globalError.value = ''
    batchIndex.value = 0
    batchTotal.value = 0
    for (const target of targets) {
      target.status = 'queued'
      target.tokens = []
      target.translation = ''
      target.error = ''
    }
    phase.value = 'running'
    requestStage.value = 'analyzing'

    await runBatches(targets, resolved.settings, currentRun, signal)
  }

  function cancel(): void {
    if (phase.value !== 'running') return
    controller?.abort()
  }

  function clearResults(): void {
    abortCurrent()
    runSequence += 1
    sentences.value = []
    translatedText.value = ''
    phase.value = 'idle'
    requestStage.value = 'idle'
    globalError.value = ''
    usedCompatMode.value = false
    batchIndex.value = 0
    batchTotal.value = 0
  }

  function reset(): void {
    clearResults()
    input.value = ''
  }

  function setMode(next: InputMode): void {
    if (mode.value === next) return

    abortCurrent()
    runSequence += 1
    mode.value = next
    input.value = ''
    sentences.value = []
    translatedText.value = ''
    phase.value = 'idle'
    requestStage.value = 'idle'
    globalError.value = ''
    usedCompatMode.value = false
    batchIndex.value = 0
    batchTotal.value = 0
  }

  function loadHistoryRecord(record: HistoryRecord): void {
    abortCurrent()
    runSequence += 1

    mode.value = record.mode
    input.value = record.input
    translatedText.value = record.translatedText
    sentences.value = record.sentences.map((sentence, index) => ({
      id: `history-${record.id}-${index}`,
      source: sentence.source,
      translation: sentence.translation,
      status: 'done',
      tokens: sentence.tokens.map((token) => ({ ...token })),
      error: '',
    }))
    phase.value = 'done'
    requestStage.value = 'idle'
    globalError.value = ''
    usedCompatMode.value = record.usedCompatMode
    batchIndex.value = 0
    batchTotal.value = 0
  }

  return {
    mode,
    input,
    translatedText,
    sentences,
    phase,
    requestStage,
    globalError,
    usedCompatMode,
    batchIndex,
    batchTotal,
    running,
    translating,
    isEnglishMode,
    totalCount,
    doneCount,
    progressPercent,
    tokenCount,
    hasPending,
    canAnalyze,
    analyze,
    retryPending,
    cancel,
    clearResults,
    reset,
    setMode,
    loadHistoryRecord,
  }
})
