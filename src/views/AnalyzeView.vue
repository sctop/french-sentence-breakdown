<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import PosBadge from '@/components/PosBadge.vue'
import { useToast } from '@/composables/useToast'
import type { AnalysisToken, InputMode } from '@/lib/llm'
import { MAX_INPUT_CHARS } from '@/lib/sentence'
import { useAnalysisStore, type SentenceStatus } from '@/stores/analysis'
import { useSettingsStore } from '@/stores/settings'
import { useVocabularyStore } from '@/stores/vocabulary'

const analysis = useAnalysisStore()
const settings = useSettingsStore()
const vocabulary = useVocabularyStore()
const toast = useToast()

const maxInputChars = MAX_INPUT_CHARS
const FRENCH_SAMPLE_INPUT =
  "Bonjour ! Comment vas-tu ? Je vais bien ; j'apprends le français depuis deux ans."
const ENGLISH_SAMPLE_INPUT =
  "Hello! How are you? I'm doing well; I've been learning French for two years now."

const configured = computed(() => settings.isConfigured)
const isEnglishMode = computed(() => analysis.isEnglishMode)
const overLimit = computed(() => analysis.input.length > maxInputChars)
const primaryLabel = computed(() => {
  if (isEnglishMode.value) {
    return analysis.sentences.length > 0 ? '重新翻译并解析' : '翻译并解析'
  }
  return analysis.sentences.length > 0 ? '重新分析' : '开始解析'
})
const runningLabel = computed(() => (analysis.translating ? '正在翻译…' : '分析中…'))
const inputHeading = computed(() => (isEnglishMode.value ? '输入英语' : '输入法语'))
const inputHint = computed(() =>
  isEnglishMode.value
    ? 'AI 会先译成自然法语，再逐句解析；翻译与分析是两次独立请求。'
    : '支持一次输入多句；分号也会被当作句子边界。',
)
const inputLabel = computed(() => (isEnglishMode.value ? '英语原文' : '法语原文'))
const inputPlaceholder = computed(() =>
  isEnglishMode.value
    ? '例如：Hello! My name is Marie and I have been learning French for two years.'
    : '例如：Bonjour ! Je m’appelle Marie et j’apprends le français.',
)
const sampleInput = computed(() =>
  isEnglishMode.value ? ENGLISH_SAMPLE_INPUT : FRENCH_SAMPLE_INPUT,
)
const buttonDisabled = computed(() => !analysis.canAnalyze || !configured.value || overLimit.value)
const hasResults = computed(() => analysis.sentences.length > 0)
const hasInflection = computed(() =>
  analysis.sentences.some((sentence) => sentence.tokens.some((token) => Boolean(token.inflection))),
)
const errorLinksToSettings = computed(
  () => !configured.value || /设置|API 地址|模型名称|密钥/.test(analysis.globalError),
)

function fillSample(): void {
  analysis.input = sampleInput.value
}

function handleModeChange(next: InputMode): void {
  analysis.setMode(next)
}

function clearInput(): void {
  analysis.input = ''
}

function handleAnalyze(): void {
  void analysis.analyze()
}

function handleRetry(): void {
  void analysis.retryPending()
}

function handleCancel(): void {
  analysis.cancel()
}

function addWord(token: AnalysisToken, source: string): void {
  const result = vocabulary.addToken(token, source)
  if (result === 'added') {
    toast.success(`已收藏「${token.text}」`)
  } else {
    toast.info(`「${token.text}（${token.pos}）」已在生词本中`)
  }
}

function isSaved(token: AnalysisToken): boolean {
  return vocabulary.isSaved(token.text, token.pos)
}

function lemmaFor(token: AnalysisToken): string {
  if (!token.lemma) return '—'
  if (token.lemma.toLowerCase() === token.text.toLowerCase()) return '—'
  return token.lemma
}

function statusLabel(status: SentenceStatus): string {
  if (status === 'queued') return '等待中'
  if (status === 'loading') return '分析中'
  if (status === 'done') return '已完成'
  return '失败'
}
</script>

<template>
  <section class="page analyze-page">
    <header class="page-header">
      <p class="eyebrow">ANALYSE · 逐词解析</p>
      <h1 class="page-title">把法语句子，拆成看得懂的样子</h1>
      <p class="page-subtitle">
        输入法语句子或段落，自动切句并逐词标出英文词性、近似读音、标准
        IPA、原形与释义，同时给出整句英译。
        也可以输入英语，先译成自然法语，再按同样的方式解析。遇到想记住的词，点一下就能放进本地生词本。
      </p>
    </header>

    <section class="composer card">
      <div class="mode-switch" role="group" aria-label="输入模式">
        <button
          type="button"
          class="mode-switch__button"
          :class="{ 'is-active': !isEnglishMode }"
          :aria-pressed="!isEnglishMode"
          :disabled="analysis.running"
          @click="handleModeChange('french')"
        >
          法语原文
        </button>
        <button
          type="button"
          class="mode-switch__button"
          :class="{ 'is-active': isEnglishMode }"
          :aria-pressed="isEnglishMode"
          :disabled="analysis.running"
          title="输入英语，先翻译成自然法语再逐词解析"
          @click="handleModeChange('english')"
        >
          英语 → 法语
        </button>
      </div>

      <div class="composer__head">
        <div>
          <h2 class="section-title">{{ inputHeading }}</h2>
          <p class="composer__hint">{{ inputHint }}</p>
        </div>
        <span class="composer__count" :class="{ 'is-over': overLimit }">
          {{ analysis.input.length }} / {{ maxInputChars }}
        </span>
      </div>

      <label class="visually-hidden" for="source-text">{{ inputLabel }}</label>
      <textarea
        id="source-text"
        v-model="analysis.input"
        class="textarea composer__textarea"
        :lang="isEnglishMode ? 'en' : 'fr'"
        :disabled="analysis.running"
        :placeholder="inputPlaceholder"
      ></textarea>

      <p v-if="overLimit" class="field__error" role="alert">
        文本已超过 {{ maxInputChars }} 个字符，请缩短后再分析。
      </p>

      <div v-if="!configured" class="banner banner--info composer__banner">
        <div class="banner__body">
          <strong>还没有配置 API。</strong>
          请先在
          <RouterLink to="/settings" class="text-link">设置页</RouterLink>
          填写 OpenAI Chat Completions 兼容接口的地址与模型，密钥保存在此浏览器本地。
        </div>
      </div>

      <div class="composer__footer">
        <div class="composer__tools">
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="analysis.running"
            @click="fillSample"
          >
            填入示例
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="analysis.running || !analysis.input"
            @click="clearInput"
          >
            清空输入
          </button>
        </div>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="buttonDisabled"
          @click="handleAnalyze"
        >
          <span v-if="analysis.running" class="spinner" aria-hidden="true"></span>
          {{ analysis.running ? runningLabel : primaryLabel }}
        </button>
      </div>
    </section>

    <div
      v-if="analysis.translating"
      class="banner banner--info translation-progress"
      role="status"
      aria-live="polite"
    >
      <span class="spinner" aria-hidden="true"></span>
      <div class="banner__body">
        <strong>正在把英语翻译成自然法语…</strong>
        <p>翻译完成后会用第二次请求逐句分析法语译文。</p>
      </div>
      <button type="button" class="btn btn--secondary btn--sm" @click="handleCancel">
        取消翻译
      </button>
    </div>

    <div v-if="analysis.globalError" class="banner banner--error analyze-error" role="alert">
      <div class="banner__body">
        <strong class="banner__title">处理没有完成</strong>
        <p>{{ analysis.globalError }}</p>
        <div class="banner__actions">
          <RouterLink v-if="errorLinksToSettings" to="/settings" class="text-link">
            检查 API 设置
          </RouterLink>
          <button
            v-if="analysis.hasPending && !analysis.running"
            type="button"
            class="btn btn--secondary btn--sm"
            @click="handleRetry"
          >
            重试未完成的句子
          </button>
        </div>
      </div>
    </div>

    <div v-if="analysis.usedCompatMode" class="banner banner--info compat-banner">
      <div class="banner__body">
        当前接口不支持 JSON Schema 严格模式，已自动切换为兼容模式；返回结果仍会按同一结构校验。
      </div>
    </div>

    <section
      v-if="isEnglishMode && analysis.translatedText"
      class="translation-card card"
      aria-live="polite"
    >
      <div class="translation-card__head">
        <span class="translation-card__eyebrow">法文翻译</span>
        <span class="translation-card__note">自然法语 · 由英语原文生成</span>
      </div>
      <p class="translation-card__text" lang="fr">{{ analysis.translatedText }}</p>
    </section>

    <section v-if="hasResults" class="results" aria-live="polite">
      <div class="results__head">
        <div>
          <h2 class="results__title">分析结果</h2>
          <p class="results__meta">
            {{ analysis.totalCount }} 句 · {{ analysis.tokenCount }} 个词 · 已完成
            {{ analysis.doneCount }} 句
          </p>
        </div>
        <div class="results__actions">
          <button
            v-if="analysis.running"
            type="button"
            class="btn btn--secondary btn--sm"
            @click="handleCancel"
          >
            取消分析
          </button>
          <button
            v-else-if="analysis.hasPending"
            type="button"
            class="btn btn--primary btn--sm"
            @click="handleRetry"
          >
            重试未完成
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="analysis.running"
            @click="analysis.clearResults()"
          >
            清空结果
          </button>
        </div>
      </div>

      <p v-if="hasInflection" class="results__legend">
        形式为中文简写，仅标注 v./aux./pron./det./n.；例如「直现·一单」＝直陈式现在时第一人称单数，
        「阴复」＝阴性复数。直/虚/条/命＝直陈/虚拟/条件/命令式；一/二/三＋单/复＝人称与数。
      </p>

      <div v-if="analysis.running || analysis.phase === 'cancelled'" class="progress-block">
        <div
          class="progress"
          role="progressbar"
          aria-label="分析进度"
          :aria-valuenow="analysis.progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress__bar" :style="{ width: `${analysis.progressPercent}%` }"></div>
        </div>
        <p class="progress-block__text">
          <template v-if="analysis.running">
            正在分析第 {{ analysis.batchIndex }} / {{ analysis.batchTotal }} 批 · 已完成
            {{ analysis.doneCount }} / {{ analysis.totalCount }} 句
          </template>
          <template v-else>分析已取消，可重试未完成的句子。</template>
        </p>
      </div>

      <article
        v-for="(sentence, index) in analysis.sentences"
        :key="sentence.id"
        class="sentence-card card"
        :data-status="sentence.status"
      >
        <header class="sentence-card__head">
          <span class="sentence-card__index">第 {{ index + 1 }} 句</span>
          <span class="sentence-status" :data-status="sentence.status">
            <span v-if="sentence.status === 'loading'" class="spinner" aria-hidden="true"></span>
            {{ statusLabel(sentence.status) }}
          </span>
        </header>

        <div class="sentence-card__text">
          <p class="sentence-card__source" lang="fr">{{ sentence.source }}</p>
          <p v-if="sentence.translation" class="sentence-card__translation">
            <span class="sentence-card__translation-label" lang="zh-CN">英译</span>
            <span lang="en">{{ sentence.translation }}</span>
          </p>
        </div>

        <div v-if="sentence.status === 'done'" class="word-table">
          <div class="word-table__head" aria-hidden="true">
            <span>单词</span>
            <span>词性</span>
            <span title="变位/变化形式（中文简写）">形式</span>
            <span>读音</span>
            <span>原形</span>
            <span>英文释义</span>
            <span></span>
          </div>
          <ul class="word-list">
            <li
              v-for="(token, tokenIndex) in sentence.tokens"
              :key="`${sentence.id}-${tokenIndex}`"
              class="word-row"
            >
              <span class="word-row__word" lang="fr">{{ token.text }}</span>
              <span class="word-row__pos"><PosBadge :pos="token.pos" /></span>
              <span class="word-row__form" :class="{ 'is-empty': !token.inflection }">
                <span class="word-row__form-label">形式</span>
                {{ token.inflection || '—' }}
              </span>
              <span class="word-row__pron">
                <span class="pron-line">
                  <span class="pron-tag">英语近似</span>
                  <span class="pron-value pron-value--respelling" lang="en">
                    {{ token.respelling || '—' }}
                  </span>
                </span>
                <span class="pron-line">
                  <span class="pron-tag">IPA</span>
                  <span class="pron-value pron-value--ipa">{{ token.ipa || '—' }}</span>
                </span>
              </span>
              <span class="word-row__lemma">{{ lemmaFor(token) }}</span>
              <span class="word-row__meaning" lang="en">{{ token.meaning }}</span>
              <span class="word-row__action">
                <button
                  v-if="!isSaved(token)"
                  type="button"
                  class="btn btn--secondary btn--sm"
                  :aria-label="`将 ${token.text} 加入生词本`"
                  @click="addWord(token, sentence.source)"
                >
                  + 生词本
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn--ghost btn--sm word-row__saved"
                  disabled
                >
                  已收藏
                </button>
              </span>
            </li>
          </ul>
        </div>

        <p v-else-if="sentence.status === 'loading'" class="sentence-card__state">
          <span class="spinner" aria-hidden="true"></span>
          正在拆解这一句…
        </p>
        <p
          v-else-if="sentence.status === 'error'"
          class="sentence-card__state sentence-card__state--error"
        >
          {{ sentence.error || '这一句分析失败，请重试。' }}
        </p>
        <p v-else class="sentence-card__state">等待分析…</p>
      </article>
    </section>

    <section v-else-if="!analysis.running" class="starter">
      <article class="starter__card card">
        <span class="starter__number">01</span>
        <h2>输入文本</h2>
        <p>法语原文可以直接解析；英语文本会先被译成自然法语，再进入逐词解析。</p>
      </article>
      <article class="starter__card card">
        <span class="starter__number">02</span>
        <h2>自动拆解</h2>
        <p>
          根据标点切成句子，再由 LLM 逐词标注标准英文词性、近似读音与
          IPA、词典原形和英语释义，并给出整句英译。
        </p>
      </article>
      <article class="starter__card card">
        <span class="starter__number">03</span>
        <h2>收藏生词</h2>
        <p>一键加入浏览器本地生词本，按词性、时间筛选，也可以用原词或英文释义搜索。</p>
      </article>
    </section>

    <p class="analyze-footnote">
      法语模式会按批次请求分析；英语模式会先单独请求翻译，再分析法语译文。完整成功后会把本次结果保存在本机分析历史（最多
      100 次）。
    </p>
  </section>
</template>

<style scoped>
.analyze-page {
  display: grid;
  gap: 1.5rem;
  align-content: start;
}

.composer {
  position: relative;
  display: grid;
  gap: 0.9rem;
  padding: 1.25rem;
  overflow: hidden;
}

.composer::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #2f56a7, #f5f1e8 52%, #c94f4f);
  content: '';
}

.mode-switch {
  display: inline-flex;
  justify-self: start;
  gap: 0.15rem;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-alt);
}

.mode-switch__button {
  padding: 0.4rem 0.8rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.2;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.mode-switch__button:hover:not(:disabled) {
  color: var(--text);
}

.mode-switch__button.is-active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.mode-switch__button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.composer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.composer__hint {
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.composer__count {
  flex: none;
  padding-top: 0.2rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}

.composer__count.is-over {
  color: var(--danger);
  font-weight: 700;
}

.composer__textarea {
  min-height: 10.5rem;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  line-height: 1.85;
}

.composer__banner {
  margin-top: 0.1rem;
}

.composer__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.composer__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-left: -0.4rem;
}

.analyze-error,
.compat-banner {
  margin-top: -0.35rem;
}

.translation-progress {
  align-items: center;
}

.translation-progress > .spinner {
  flex: none;
}

.translation-progress .banner__body p {
  margin-top: 0.15rem;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.6;
}

.translation-progress > .btn {
  flex: none;
}

.translation-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.2rem;
  border-left: 3px solid var(--accent);
}

.translation-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem 1rem;
}

.translation-card__eyebrow {
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.translation-card__note {
  color: var(--muted);
  font-size: 0.72rem;
}

.translation-card__text {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.1rem;
  line-height: 1.72;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.results {
  display: grid;
  gap: 1.1rem;
}

.results__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.8rem 1.2rem;
  padding-top: 0.35rem;
}

.results__title {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.45rem;
  font-weight: 600;
}

.results__meta {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.results__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.progress-block {
  display: grid;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.progress-block__text {
  color: var(--muted);
  font-size: 0.8rem;
}

.sentence-card {
  display: grid;
  gap: 0.7rem;
  padding: 1.1rem 1.25rem 1.2rem;
}

.sentence-card[data-status='error'] {
  border-color: var(--border-strong);
}

.sentence-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.sentence-card__index {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sentence-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.16rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--muted);
  font-size: 0.71rem;
  font-weight: 650;
}

.sentence-status[data-status='loading'] {
  background: var(--accent-soft);
  color: var(--accent);
}

.sentence-status[data-status='done'] {
  background: var(--success-soft);
  color: var(--success);
}

.sentence-status[data-status='error'] {
  background: var(--danger-soft);
  color: var(--danger);
}

.sentence-card__text {
  display: grid;
  gap: 0.3rem;
}

.sentence-card__source {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.18rem;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.sentence-card__translation {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.sentence-card__translation-label {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 0.04rem 0.34rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 650;
  line-height: 1.5;
  vertical-align: 0.05em;
}

.word-table {
  border-top: 1px solid var(--border);
}

.word-table__head,
.word-row {
  display: grid;
  grid-template-columns:
    minmax(5.5rem, 1fr) 4.4rem 5.4rem minmax(8.5rem, 1.3fr)
    minmax(4.6rem, 0.75fr) minmax(9rem, 2fr) 6.2rem;
  gap: 0.75rem;
  align-items: center;
}

.word-table__head {
  padding: 0.55rem 0.35rem;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.word-row {
  padding: 0.55rem 0.35rem;
  border-top: 1px solid var(--border);
}

.word-row:hover {
  background: var(--surface-hover);
}

.word-row__word {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.04rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.word-row__lemma {
  color: var(--muted);
  font-size: 0.84rem;
  font-style: italic;
  overflow-wrap: anywhere;
}

.word-row__form {
  color: var(--text);
  font-size: 0.73rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.word-row__form.is-empty {
  color: var(--muted);
}

.word-row__form-label {
  display: none;
  margin-right: 0.35rem;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 650;
}

.results__legend {
  margin-top: -0.55rem;
  color: var(--muted);
  font-size: 0.73rem;
  line-height: 1.65;
}

.word-row__pron {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}

.word-row__meaning {
  color: var(--text);
  font-size: 0.89rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.word-row__action {
  justify-self: end;
}

.word-row__saved {
  color: var(--success);
}

.sentence-card__state {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.86rem;
}

.sentence-card__state--error {
  color: var(--danger);
}

.starter {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.starter__card {
  display: grid;
  gap: 0.4rem;
  align-content: start;
  padding: 1.15rem;
}

.starter__number {
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 0.85rem;
  font-style: italic;
  letter-spacing: 0.06em;
}

.starter__card h2 {
  color: var(--text-strong);
  font-size: 0.98rem;
}

.starter__card p {
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.7;
}

.analyze-footnote {
  color: var(--muted);
  font-size: 0.76rem;
  text-align: center;
}

@media (max-width: 900px) {
  .starter {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .word-table__head {
    display: none;
  }

  .word-list {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.65rem;
  }

  .word-row {
    grid-template-areas:
      'word pos'
      'form form'
      'pron pron'
      'meaning meaning'
      'lemma action';
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.2rem 0.65rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
  }

  .word-row:hover {
    background: var(--surface-hover);
  }

  .word-row__word {
    grid-area: word;
  }

  .word-row__pos {
    grid-area: pos;
    justify-self: end;
  }

  .word-row__form {
    grid-area: form;
  }

  .word-row__form-label {
    display: inline;
  }

  .word-row__form.is-empty {
    display: none;
  }

  .word-row__meaning {
    grid-area: meaning;
    margin: 0.2rem 0 0.15rem;
  }

  .word-row__pron {
    grid-area: pron;
    padding-top: 0.15rem;
  }

  .word-row__lemma {
    grid-area: lemma;
    align-self: center;
  }

  .word-row__action {
    grid-area: action;
  }

  .sentence-card {
    padding: 1rem;
  }

  .sentence-card__source {
    font-size: 1.08rem;
  }

  .sentence-card__translation {
    font-size: 0.8rem;
  }
}

@media (max-width: 640px) {
  .composer {
    padding: 1rem;
  }

  .mode-switch {
    display: flex;
    width: 100%;
  }

  .mode-switch__button {
    flex: 1;
  }

  .translation-progress {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .translation-progress > .btn {
    width: 100%;
  }

  .translation-card {
    padding: 1rem;
  }

  .translation-card__text {
    font-size: 1rem;
  }

  .composer__textarea {
    min-height: 9rem;
    font-size: 1rem;
  }

  .composer__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .composer__footer > .btn {
    width: 100%;
  }

  .results__head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
