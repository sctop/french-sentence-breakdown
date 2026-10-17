<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PosBadge from '@/components/PosBadge.vue'
import { useToast } from '@/composables/useToast'
import { buildFullBackup } from '@/lib/backup'
import { downloadJson } from '@/lib/download'
import { formatDateTime, toLocalDateKey } from '@/lib/format'
import { POS_LABELS, POS_TAGS, type PosTag } from '@/lib/pos'
import { MAX_IMPORT_BYTES, buildVocabularyExport, type VocabularyEntry } from '@/lib/vocabulary'
import { normalizeForSearch } from '@/lib/text'
import { useHistoryStore } from '@/stores/history'
import { useVocabularyStore } from '@/stores/vocabulary'

type TimeFilter = 'all' | 'today' | '7d' | '30d' | 'custom'
type SortMode = 'newest' | 'oldest' | 'alpha'

const PAGE_SIZE = 40

const vocabulary = useVocabularyStore()
const history = useHistoryStore()
const toast = useToast()

const search = ref('')
const selectedPos = ref<PosTag[]>([])
const timeFilter = ref<TimeFilter>('all')
const customStart = ref('')
const customEnd = ref('')
const sortMode = ref<SortMode>('newest')
const visibleCount = ref(PAGE_SIZE)
const showClearConfirm = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

function localDayStart(offsetDays = 0): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays).getTime()
}

function localDayEnd(offsetDays = 0): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays + 1).getTime() - 1
}

function dateInputStart(value: string): number | null {
  if (!value) return null
  const parts = value.split('-')
  if (parts.length !== 3) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const time = new Date(year, month - 1, day).getTime()
  return Number.isNaN(time) ? null : time
}

function dateInputEnd(value: string): number | null {
  const start = dateInputStart(value)
  if (start === null) return null
  const date = new Date(start)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1
}

const timeRange = computed<{ start: number | null; end: number | null }>(() => {
  if (timeFilter.value === 'all') return { start: null, end: null }

  if (timeFilter.value === 'custom') {
    let start = dateInputStart(customStart.value)
    let end = dateInputEnd(customEnd.value)
    if (start !== null && end !== null && start > end) {
      ;[start, end] = [end, start]
    }
    return { start, end }
  }

  if (timeFilter.value === 'today') {
    return { start: localDayStart(), end: localDayEnd() }
  }
  if (timeFilter.value === '7d') {
    return { start: localDayStart(-6), end: localDayEnd() }
  }
  return { start: localDayStart(-29), end: localDayEnd() }
})

const posCounts = computed<Record<PosTag, number>>(() => {
  const counts = {} as Record<PosTag, number>
  for (const tag of POS_TAGS) counts[tag] = 0
  for (const entry of vocabulary.entries) counts[entry.pos] += 1
  return counts
})

function addedTime(entry: VocabularyEntry): number {
  const time = Date.parse(entry.addedAt)
  return Number.isNaN(time) ? 0 : time
}

const normalizedQuery = computed(() => normalizeForSearch(search.value))

const filteredEntries = computed(() => {
  const query = normalizedQuery.value
  const range = timeRange.value
  const tags = selectedPos.value

  const entries = vocabulary.entries.filter((entry) => {
    if (tags.length > 0 && !tags.includes(entry.pos)) return false

    const time = addedTime(entry)
    if (range.start !== null && time < range.start) return false
    if (range.end !== null && time > range.end) return false

    if (query) {
      const haystack = [
        normalizeForSearch(entry.word),
        normalizeForSearch(entry.meaning),
        normalizeForSearch(entry.lemma),
      ].join(' ')
      if (!haystack.includes(query)) return false
    }
    return true
  })

  return entries.sort((left, right) => {
    if (sortMode.value === 'alpha') {
      const byWord = left.word.localeCompare(right.word, 'fr', { sensitivity: 'base' })
      if (byWord !== 0) return byWord
      return addedTime(right) - addedTime(left)
    }
    if (sortMode.value === 'oldest') return addedTime(left) - addedTime(right)
    return addedTime(right) - addedTime(left)
  })
})

const visibleEntries = computed(() => filteredEntries.value.slice(0, visibleCount.value))
const remainingCount = computed(() =>
  Math.max(0, filteredEntries.value.length - visibleEntries.value.length),
)
const hasAnyEntries = computed(() => vocabulary.count > 0)
const hasFilters = computed(
  () => Boolean(search.value.trim()) || selectedPos.value.length > 0 || timeFilter.value !== 'all',
)

watch([search, selectedPos, timeFilter, customStart, customEnd, sortMode], () => {
  visibleCount.value = PAGE_SIZE
})

function togglePos(tag: PosTag): void {
  selectedPos.value = selectedPos.value.includes(tag)
    ? selectedPos.value.filter((item) => item !== tag)
    : [...selectedPos.value, tag]
}

function clearPosFilters(): void {
  selectedPos.value = []
}

function clearFilters(): void {
  search.value = ''
  selectedPos.value = []
  timeFilter.value = 'all'
  customStart.value = ''
  customEnd.value = ''
  visibleCount.value = PAGE_SIZE
}

function posLabel(tag: PosTag): string {
  return POS_LABELS[tag]
}

function lemmaDisplay(entry: VocabularyEntry): string {
  if (!entry.lemma) return ''
  if (entry.lemma.toLowerCase() === entry.word.toLowerCase()) return ''
  return entry.lemma
}

function deleteEntry(entry: VocabularyEntry): void {
  const removed = vocabulary.remove(entry.id)
  if (!removed) return
  toast.info(`已删除「${removed.word}」`, {
    label: '撤销',
    run: () => {
      if (vocabulary.restore(removed)) toast.success('已恢复到生词本。')
      else toast.info('这个词已经在生词本中了。')
    },
  })
}

function clearVocabulary(): void {
  const removedCount = vocabulary.count
  vocabulary.clear()
  showClearConfirm.value = false
  toast.success(`已清空 ${removedCount} 个生词。`)
}

function loadMore(): void {
  visibleCount.value += PAGE_SIZE
}

function exportVocabulary(): void {
  if (!vocabulary.count) return
  try {
    const filename = `french-vocabulary-${toLocalDateKey(new Date())}.json`
    downloadJson(filename, buildVocabularyExport(vocabulary.entries))
    toast.success(`已导出 ${vocabulary.count} 个生词。`)
  } catch {
    toast.error('导出失败，请重试。')
  }
}

function exportEverything(): void {
  if (vocabulary.count === 0 && history.starredCount === 0) return
  try {
    const filename = `french-learning-backup-${toLocalDateKey(new Date())}.json`
    downloadJson(filename, buildFullBackup(vocabulary.entries, history.starred))
    toast.success(`已导出 ${vocabulary.count} 个生词与 ${history.starredCount} 条星标历史。`)
  } catch {
    toast.error('导出失败，请重试。')
  }
}

function openImportPicker(): void {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (file.size > MAX_IMPORT_BYTES) {
    toast.error('文件过大，单个导入文件不能超过 5MB。')
    return
  }

  isImporting.value = true
  try {
    const text = await file.text()
    const outcome = vocabulary.importFromText(text)
    if (!outcome.ok) {
      toast.error(outcome.error)
      return
    }
    clearFilters()
    const invalidText = outcome.invalid > 0 ? `，忽略无效 ${outcome.invalid} 个` : ''
    toast.success(
      `导入完成：新增 ${outcome.added} 个，跳过重复 ${outcome.skipped} 个${invalidText}。`,
    )
  } catch {
    toast.error('读取文件失败，请重试。')
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <section class="page vocabulary-page">
    <header class="page-header">
      <p class="eyebrow">VOCABULAIRE · 生词本</p>
      <h1 class="page-title">你的法语生词本</h1>
      <p class="page-subtitle">
        收藏过的词会连同词性、英文释义、读音和来源句一起保存在当前浏览器。按词性、时间筛选，或用原词与释义搜索。
      </p>
      <div class="vocab-actions">
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="vocabulary.count === 0"
          @click="exportVocabulary"
        >
          导出生词本
        </button>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="vocabulary.count === 0 && history.starredCount === 0"
          title="导出生词本与星标分析历史的合并备份"
          @click="exportEverything"
        >
          导出生词本 + 星标
        </button>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="isImporting"
          @click="openImportPicker"
        >
          {{ isImporting ? '导入中…' : '导入生词本' }}
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept=".json,application/json"
          @change="handleFileSelect"
        />
      </div>
      <p v-if="history.starredCount > 0" class="vocab-export-hint">
        建议同时导出：使用「导出生词本 + 星标」一起备份生词本和
        {{ history.starredCount }} 条星标分析历史。
      </p>
    </header>

    <section v-if="hasAnyEntries" class="toolbar card">
      <div class="toolbar__top">
        <div class="search-box">
          <svg
            class="search-box__icon"
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <label class="visually-hidden" for="vocab-search">搜索生词</label>
          <input
            id="vocab-search"
            v-model="search"
            class="input search-box__input"
            type="text"
            inputmode="search"
            placeholder="搜索原词或英文释义…"
          />
          <button
            v-if="search"
            type="button"
            class="search-box__clear"
            aria-label="清除搜索"
            @click="search = ''"
          >
            ×
          </button>
        </div>
        <p class="toolbar__stats">
          共 {{ vocabulary.count }} 个 · 当前 {{ filteredEntries.length }} 个
        </p>
      </div>

      <div class="toolbar__group">
        <span class="toolbar__label">词性</span>
        <div class="chips">
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': selectedPos.length === 0 }"
            @click="clearPosFilters"
          >
            全部
          </button>
          <button
            v-for="tag in POS_TAGS"
            :key="tag"
            type="button"
            class="chip"
            :class="{ 'chip--active': selectedPos.includes(tag) }"
            :title="`${tag} · ${posLabel(tag)}`"
            @click="togglePos(tag)"
          >
            {{ tag }}
            <span class="chip__count">{{ posCounts[tag] }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar__filters">
        <label class="filter">
          <span class="filter__label">时间范围</span>
          <select v-model="timeFilter" class="select filter__select">
            <option value="all">全部时间</option>
            <option value="today">今天</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
            <option value="custom">自定义</option>
          </select>
        </label>

        <template v-if="timeFilter === 'custom'">
          <label class="filter">
            <span class="filter__label">开始日期</span>
            <input v-model="customStart" class="input filter__select" type="date" />
          </label>
          <label class="filter">
            <span class="filter__label">结束日期</span>
            <input v-model="customEnd" class="input filter__select" type="date" />
          </label>
        </template>

        <label class="filter">
          <span class="filter__label">排序</span>
          <select v-model="sortMode" class="select filter__select">
            <option value="newest">最新添加</option>
            <option value="oldest">最早添加</option>
            <option value="alpha">字母 A–Z</option>
          </select>
        </label>

        <button
          v-if="hasFilters"
          type="button"
          class="btn btn--ghost btn--sm toolbar__reset"
          @click="clearFilters"
        >
          清除筛选
        </button>
      </div>
    </section>

    <section v-if="!hasAnyEntries" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">Aa</span>
      <h2 class="empty-state__title">生词本还是空的</h2>
      <p>去解析一个句子，点击词语旁的「+ 生词本」即可收藏；也可以导入以前导出的 JSON 生词文件。</p>
      <div class="empty-state__actions">
        <RouterLink to="/" class="btn btn--primary btn--sm">去解析句子</RouterLink>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="isImporting"
          @click="openImportPicker"
        >
          导入生词本
        </button>
      </div>
    </section>

    <template v-else>
      <section v-if="filteredEntries.length === 0" class="empty-state">
        <span class="empty-state__mark" aria-hidden="true">?</span>
        <h2 class="empty-state__title">没有匹配的生词</h2>
        <p>试试更换搜索关键词，或清除当前的词性与时间筛选。</p>
        <button type="button" class="btn btn--secondary btn--sm" @click="clearFilters">
          清除筛选条件
        </button>
      </section>

      <template v-else>
        <ul class="entry-list">
          <li v-for="entry in visibleEntries" :key="entry.id" class="entry card">
            <div class="entry__main">
              <div class="entry__headline">
                <span class="entry__word" lang="fr">{{ entry.word }}</span>
                <PosBadge :pos="entry.pos" />
              </div>
              <div v-if="entry.respelling || entry.ipa" class="entry__pron">
                <span v-if="entry.respelling" class="pron-line">
                  <span class="pron-tag">英语近似</span>
                  <span class="pron-value pron-value--respelling" lang="en">
                    {{ entry.respelling }}
                  </span>
                </span>
                <span v-if="entry.ipa" class="pron-line">
                  <span class="pron-tag">IPA</span>
                  <span class="pron-value pron-value--ipa">{{ entry.ipa }}</span>
                </span>
              </div>
              <p class="entry__meaning" lang="en">{{ entry.meaning }}</p>
              <p v-if="lemmaDisplay(entry)" class="entry__lemma">
                原形：<span lang="fr">{{ entry.lemma }}</span>
              </p>
              <p v-if="entry.context" class="entry__context" lang="fr" :title="entry.context">
                “{{ entry.context }}”
              </p>
            </div>
            <div class="entry__aside">
              <time class="entry__time" :datetime="entry.addedAt">
                {{ formatDateTime(entry.addedAt) }}
              </time>
              <button
                type="button"
                class="btn btn--ghost btn--sm entry__delete"
                :aria-label="`删除生词 ${entry.word}`"
                @click="deleteEntry(entry)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>

        <div v-if="remainingCount > 0" class="load-more">
          <button type="button" class="btn btn--secondary btn--sm" @click="loadMore">
            显示更多（还有 {{ remainingCount }} 个）
          </button>
        </div>

        <div class="clear-zone">
          <button
            v-if="!showClearConfirm"
            type="button"
            class="btn btn--ghost btn--sm clear-zone__trigger"
            @click="showClearConfirm = true"
          >
            清空生词本
          </button>
          <div v-else class="clear-confirm" role="alert">
            <span>确定清空全部 {{ vocabulary.count }} 个生词？此操作不可撤销。</span>
            <div class="clear-confirm__actions">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                @click="showClearConfirm = false"
              >
                取消
              </button>
              <button type="button" class="btn btn--danger btn--sm" @click="clearVocabulary">
                确定清空
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.vocabulary-page {
  display: grid;
  gap: 1.35rem;
  align-content: start;
}

.vocab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.vocab-export-hint {
  margin-top: 0.5rem;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.6;
}

.toolbar {
  display: grid;
  gap: 1rem;
  padding: 1.1rem 1.2rem;
}

.toolbar__top {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-box__icon {
  position: absolute;
  top: 50%;
  left: 0.85rem;
  color: var(--muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.search-box__input {
  padding-left: 2.35rem;
  padding-right: 2.2rem;
}

.search-box__clear {
  position: absolute;
  top: 50%;
  right: 0.45rem;
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1;
  transform: translateY(-50%);
}

.search-box__clear:hover {
  background: var(--surface-alt);
  color: var(--text);
}

.toolbar__stats {
  flex: none;
  color: var(--muted);
  font-size: 0.79rem;
  font-variant-numeric: tabular-nums;
}

.toolbar__group {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.toolbar__label {
  flex: none;
  padding-top: 0.32rem;
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 650;
}

.toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}

.filter {
  display: grid;
  gap: 0.28rem;
}

.filter__label {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.filter__select {
  width: auto;
  min-width: 8.3rem;
  padding: 0.45rem 0.65rem;
  font-size: 0.83rem;
}

.toolbar__reset {
  margin-left: auto;
}

.entry-list {
  display: grid;
  gap: 0.7rem;
}

.entry {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1rem 1.2rem;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.entry:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.entry__main {
  min-width: 0;
}

.entry__headline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}

.entry__word {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.34rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.entry__meaning {
  margin-top: 0.3rem;
  color: var(--text);
  font-size: 0.94rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.entry__pron {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.9rem;
  margin-top: 0.35rem;
}

.entry__lemma {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.8rem;
}

.entry__context {
  display: -webkit-box;
  margin-top: 0.55rem;
  padding-left: 0.7rem;
  overflow: hidden;
  border-left: 2px solid var(--border);
  color: var(--muted);
  font-family: var(--font-serif);
  font-size: 0.87rem;
  font-style: italic;
  line-height: 1.6;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.entry__aside {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  min-width: 7.4rem;
}

.entry__time {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.5;
  text-align: right;
}

.entry__delete {
  color: var(--muted);
}

.entry__delete:hover {
  color: var(--danger);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 0.35rem 0;
}

.clear-zone {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.35rem;
}

.clear-zone__trigger {
  color: var(--muted);
}

.clear-zone__trigger:hover {
  color: var(--danger);
}

.clear-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--text);
  font-size: 0.82rem;
}

.clear-confirm__actions {
  display: flex;
  gap: 0.4rem;
}

.empty-state__mark {
  display: grid;
  place-items: center;
  width: 3.3rem;
  height: 3.3rem;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-alt);
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 1.5rem;
  font-style: italic;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

@media (max-width: 760px) {
  .toolbar__top {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toolbar__top,
  .search-box {
    width: 100%;
  }

  .toolbar__group {
    flex-direction: column;
    gap: 0.45rem;
  }

  .toolbar__label {
    padding-top: 0;
  }

  .toolbar__filters {
    align-items: stretch;
  }

  .filter {
    flex: 1 1 8rem;
  }

  .filter__select {
    width: 100%;
    min-width: 0;
  }

  .toolbar__reset {
    margin-left: 0;
  }

  .entry {
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.9rem 1rem;
  }

  .entry__aside {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-width: 0;
    padding-top: 0.35rem;
    border-top: 1px solid var(--border);
  }

  .entry__time {
    text-align: left;
  }

  .clear-zone {
    justify-content: stretch;
  }

  .clear-zone__trigger {
    width: 100%;
  }
}
</style>
