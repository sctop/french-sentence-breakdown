<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { buildFullBackup } from '@/lib/backup'
import { downloadJson } from '@/lib/download'
import { formatDateTime, toLocalDateKey } from '@/lib/format'
import { MAX_HISTORY_RECORDS, buildStarredHistoryExport, type HistoryRecord } from '@/lib/history'
import { useAnalysisStore } from '@/stores/analysis'
import { useHistoryStore } from '@/stores/history'
import { useVocabularyStore } from '@/stores/vocabulary'

interface HistorySection {
  key: 'starred' | 'recent'
  title: string
  note: string
  starred: boolean
  records: HistoryRecord[]
}

const history = useHistoryStore()
const analysis = useAnalysisStore()
const vocabulary = useVocabularyStore()
const router = useRouter()
const toast = useToast()

const showClearConfirm = ref(false)
const hasAnyRecords = computed(() => history.totalCount > 0)
const canExportFull = computed(() => vocabulary.count > 0 || history.starredCount > 0)

const sections = computed<HistorySection[]>(() => {
  const allSections: HistorySection[] = [
    {
      key: 'starred',
      title: '星标记录',
      note: '星标记录会持久保存在本机，不参与普通历史的 100 条上限，也不会被清空普通历史删除。',
      starred: true,
      records: history.starred,
    },
    {
      key: 'recent',
      title: '普通历史',
      note: `最多保留 ${MAX_HISTORY_RECORDS} 次完整分析，超出后自动淘汰最早记录。`,
      starred: false,
      records: history.records,
    },
  ]
  return allSections.filter((section) => section.records.length > 0)
})

function loadRecord(record: HistoryRecord): void {
  analysis.loadHistoryRecord(record)
  toast.info('已载入这次分析，可继续收藏生词。')
  void router.push('/')
}

function starRecord(record: HistoryRecord): void {
  if (!history.star(record.id)) return
  toast.success('已加入星标，记录会持久保留。')
}

function unstarRecord(record: HistoryRecord): void {
  if (!history.unstar(record.id)) return
  toast.info('已取消星标，记录回到普通历史。')
}

function deleteRecord(record: HistoryRecord): void {
  if (history.remove(record.id)) toast.info('已删除一条普通历史。')
}

function clearHistory(): void {
  const countBefore = history.count
  const cleared = history.clear()
  showClearConfirm.value = false
  if (cleared) toast.success(`已清空 ${countBefore} 条普通历史，星标记录已保留。`)
}

function exportStarred(): void {
  if (history.starredCount === 0) return
  try {
    downloadJson(
      `french-starred-history-${toLocalDateKey(new Date())}.json`,
      buildStarredHistoryExport(history.starred),
    )
    toast.success(`已导出 ${history.starredCount} 条星标历史。`)
  } catch {
    toast.error('导出星标历史失败，请重试。')
  }
}

function exportEverything(): void {
  if (!canExportFull.value) return
  try {
    downloadJson(
      `french-learning-backup-${toLocalDateKey(new Date())}.json`,
      buildFullBackup(vocabulary.entries, history.starred),
    )
    toast.success(`已导出 ${vocabulary.count} 个生词与 ${history.starredCount} 条星标历史。`)
  } catch {
    toast.error('导出失败，请重试。')
  }
}
</script>

<template>
  <section class="page history-page">
    <header class="page-header">
      <p class="eyebrow">HISTORIQUE · 分析历史</p>
      <h1 class="page-title">分析历史</h1>
      <p class="page-subtitle">
        每次完整的法语解析或英→法翻译解析都会保存在这里；普通历史最多保留 100
        次，超出后淘汰最早记录。
        星标记录会单独持久保存，不参与该上限。失败或取消的分析不会写入历史。建议使用「导出生词本 +
        星标」一起备份两类数据。
      </p>
      <div class="history-actions">
        <RouterLink to="/" class="btn btn--secondary btn--sm">去解析句子</RouterLink>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="history.starredCount === 0"
          @click="exportStarred"
        >
          导出星标历史
        </button>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="!canExportFull"
          title="导出生词本与星标分析历史的合并备份"
          @click="exportEverything"
        >
          导出生词本 + 星标
        </button>
      </div>
      <p class="history-counts">
        普通历史 {{ history.count }} / {{ MAX_HISTORY_RECORDS }} · 星标
        {{ history.starredCount }} 条
      </p>
    </header>

    <section v-if="!hasAnyRecords" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">100</span>
      <h2 class="empty-state__title">还没有分析历史</h2>
      <p>
        去输入一段法语或英语并完成一次分析；成功的结果会自动记在这里。之后可以给重要记录加星标，让它们长期保留。
      </p>
      <RouterLink to="/" class="btn btn--primary btn--sm">去分析第一段</RouterLink>
    </section>

    <template v-else>
      <section
        v-for="section in sections"
        :key="section.key"
        class="history-section"
        :class="{ 'history-section--starred': section.starred }"
      >
        <div class="history-section__head">
          <div class="history-section__title-row">
            <span v-if="section.starred" class="history-star" aria-hidden="true">★</span>
            <h2 class="history-section__title">{{ section.title }}</h2>
            <span class="history-section__count">{{ section.records.length }} 条</span>
          </div>
          <p class="history-section__note">{{ section.note }}</p>
        </div>

        <ul class="history-list">
          <li
            v-for="record in section.records"
            :key="record.id"
            class="history-item card"
            :class="{ 'history-item--starred': section.starred }"
          >
            <div class="history-item__main">
              <div class="history-item__meta">
                <time :datetime="record.createdAt">{{ formatDateTime(record.createdAt) }}</time>
                <span class="history-item__dot" aria-hidden="true">·</span>
                <span>{{ record.sentences.length }} 句</span>
                <span class="history-item__dot" aria-hidden="true">·</span>
                <span>{{ record.tokenCount }} 词</span>
                <span v-if="record.usedCompatMode" class="history-item__compat">兼容模式</span>
                <span v-if="record.mode === 'english'" class="history-item__mode">英→法</span>
                <span v-if="section.starred" class="history-item__star-badge">
                  <span aria-hidden="true">★</span> 星标
                </span>
              </div>
              <p
                class="history-item__preview"
                :lang="record.mode === 'english' ? 'en' : 'fr'"
                :title="record.input"
              >
                {{ record.input }}
              </p>
            </div>
            <div class="history-item__actions">
              <button type="button" class="btn btn--primary btn--sm" @click="loadRecord(record)">
                载入解析页
              </button>
              <button
                v-if="section.starred"
                type="button"
                class="btn btn--secondary btn--sm"
                @click="unstarRecord(record)"
              >
                取消星标
              </button>
              <button
                v-else
                type="button"
                class="btn btn--secondary btn--sm"
                @click="starRecord(record)"
              >
                <span aria-hidden="true">☆</span> 星标
              </button>
              <button
                v-if="!section.starred"
                type="button"
                class="btn btn--ghost btn--sm history-item__delete"
                @click="deleteRecord(record)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
      </section>

      <p class="history-note">
        星标记录会一直保留，只有取消星标后才会回到普通历史；清理浏览器数据仍会删除全部本地记录。
      </p>

      <div v-if="history.count > 0" class="history-footer">
        <button
          v-if="!showClearConfirm"
          type="button"
          class="btn btn--ghost btn--sm history-clear"
          @click="showClearConfirm = true"
        >
          清空普通历史
        </button>
        <div v-else class="clear-confirm" role="alert">
          <span>确定清空全部 {{ history.count }} 条普通历史？星标记录会被保留。</span>
          <div class="clear-confirm__actions">
            <button type="button" class="btn btn--ghost btn--sm" @click="showClearConfirm = false">
              取消
            </button>
            <button type="button" class="btn btn--danger btn--sm" @click="clearHistory">
              确定清空
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.history-page {
  display: grid;
  gap: 1.35rem;
  align-content: start;
}

.history-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.history-counts {
  color: var(--muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.history-section {
  display: grid;
  gap: 0.55rem;
}

.history-section__head {
  display: grid;
  gap: 0.15rem;
  padding: 0 0.2rem;
}

.history-section__title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.history-section__title {
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 1.22rem;
  font-weight: 600;
}

.history-section--starred .history-section__title {
  color: var(--accent);
}

.history-star {
  color: var(--accent);
  font-size: 1rem;
}

.history-section__count {
  color: var(--muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.history-section__note {
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.6;
}

.history-list {
  display: grid;
  gap: 0.7rem;
}

.history-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1rem 1.2rem;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.history-item--starred {
  border-left: 3px solid var(--accent);
}

.history-item:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.history-item__main {
  min-width: 0;
}

.history-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.73rem;
}

.history-item__dot {
  opacity: 0.6;
}

.history-item__compat,
.history-item__mode,
.history-item__star-badge {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 650;
}

.history-item__compat {
  background: var(--accent-soft);
  color: var(--accent);
}

.history-item__mode {
  background: var(--surface-alt);
  color: var(--text);
}

.history-item__star-badge {
  background: var(--surface-alt);
  color: var(--accent);
}

.history-item__preview {
  display: -webkit-box;
  margin-top: 0.4rem;
  overflow: hidden;
  color: var(--text-strong);
  font-family: var(--font-serif);
  font-size: 0.98rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.history-item__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.history-item__delete {
  color: var(--muted);
}

.history-item__delete:hover {
  color: var(--danger);
}

.history-note {
  color: var(--muted);
  font-size: 0.74rem;
  line-height: 1.7;
  text-align: center;
}

.history-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.35rem;
}

.history-clear {
  color: var(--muted);
}

.history-clear:hover {
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
  font-size: 1.02rem;
  font-style: italic;
}

@media (max-width: 760px) {
  .history-item {
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.9rem 1rem;
  }

  .history-item__actions {
    justify-content: space-between;
    width: 100%;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }

  .history-footer {
    justify-content: stretch;
  }

  .history-clear {
    width: 100%;
  }

  .clear-confirm {
    width: 100%;
  }
}
</style>
