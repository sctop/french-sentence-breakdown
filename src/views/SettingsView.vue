<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { THEME_OPTIONS, useTheme, type ThemePreference } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'
import { testApiConnection, type ApiSettings } from '@/lib/llm'
import { MAX_HISTORY_RECORDS } from '@/lib/history'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { useVocabularyStore } from '@/stores/vocabulary'

const settings = useSettingsStore()
const vocabulary = useVocabularyStore()
const history = useHistoryStore()
const toast = useToast()
const { preference, setPreference } = useTheme()

const form = reactive<ApiSettings>({ ...settings.settings })
const showKey = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const formError = ref('')
const fieldErrors = reactive({ baseUrl: '', model: '' })

const keyInputType = computed(() => (showKey.value ? 'text' : 'password'))
const keyStatus = computed(() =>
  settings.settings.apiKey ? '已保存密钥' : '未保存密钥（本地接口可留空）',
)

function syncForm(): void {
  form.baseUrl = settings.settings.baseUrl
  form.apiKey = settings.settings.apiKey
  form.model = settings.settings.model
}

function saveSettings(): void {
  formError.value = ''
  fieldErrors.baseUrl = ''
  fieldErrors.model = ''
  testResult.value = null

  const result = settings.save({ ...form })
  if (!result.ok) {
    const message = result.error ?? '设置保存失败。'
    if (message.includes('本地存储')) {
      syncForm()
      formError.value = message
    } else if (message.includes('地址')) {
      fieldErrors.baseUrl = message
    } else if (message.includes('模型')) {
      fieldErrors.model = message
    } else {
      formError.value = message
    }
    return
  }

  syncForm()
  toast.success('设置已保存。')
}

async function runConnectionTest(): Promise<void> {
  formError.value = ''
  fieldErrors.baseUrl = ''
  fieldErrors.model = ''
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await testApiConnection({ ...form })
  } catch {
    testResult.value = { ok: false, message: '测试失败，请稍后重试。' }
  } finally {
    testing.value = false
  }
}

function chooseTheme(value: ThemePreference): void {
  setPreference(value)
}
</script>

<template>
  <section class="page settings-page">
    <header class="page-header">
      <p class="eyebrow">PRÉFÉRENCES · 设置</p>
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">
        配置 OpenAI Chat Completions 兼容接口与页面外观。接口地址、密钥和模型只保存在当前浏览器。
      </p>
    </header>

    <form class="card settings-card" @submit.prevent="saveSettings">
      <div class="settings-card__head">
        <div>
          <h2 class="section-title">API 服务</h2>
          <p class="settings-card__hint">分析请求由浏览器直接发往下面的接口。</p>
        </div>
        <span class="config-status" :data-configured="settings.isConfigured">
          {{ settings.isConfigured ? '已配置' : '未配置' }}
        </span>
      </div>

      <div class="field">
        <label class="field__label" for="api-base">API 地址</label>
        <input
          id="api-base"
          v-model.trim="form.baseUrl"
          class="input"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://api.openai.com/v1"
        />
        <p class="field__hint">
          可填写 Base URL（如 https://api.openai.com/v1），也可直接填写完整的 …/chat/completions
          地址。接口需要允许浏览器跨域（CORS）访问。
        </p>
        <p v-if="fieldErrors.baseUrl" class="field__error" role="alert">
          {{ fieldErrors.baseUrl }}
        </p>
      </div>

      <div class="field">
        <div class="field__label-row">
          <label class="field__label" for="api-key">API 密钥</label>
          <button
            type="button"
            class="field__toggle"
            :aria-pressed="showKey"
            @click="showKey = !showKey"
          >
            {{ showKey ? '隐藏' : '显示' }}
          </button>
        </div>
        <input
          id="api-key"
          v-model.trim="form.apiKey"
          class="input"
          :type="keyInputType"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-..."
        />
        <p class="field__hint">
          密钥仅以明文保存在当前浏览器的 localStorage
          中，请求时只发给你填写的接口。请勿在公共设备上使用。 若接口无需鉴权可以留空；OpenAI
          官方接口必须填写。
        </p>
      </div>

      <div class="field">
        <label class="field__label" for="api-model">模型</label>
        <input
          id="api-model"
          v-model.trim="form.model"
          class="input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="gpt-4o-mini"
        />
        <p class="field__hint">
          例如 gpt-4o-mini、deepseek-chat 等。模型需要支持 Chat Completions；不支持 JSON Schema
          严格模式时，应用会自动降级为 JSON 兼容模式。
        </p>
        <p v-if="fieldErrors.model" class="field__error" role="alert">
          {{ fieldErrors.model }}
        </p>
      </div>

      <div v-if="formError" class="banner banner--error" role="alert">
        <div class="banner__body">{{ formError }}</div>
      </div>

      <div
        v-if="testResult"
        class="banner"
        :class="testResult.ok ? 'banner--success' : 'banner--error'"
        role="status"
      >
        <div class="banner__body">{{ testResult.message }}</div>
      </div>

      <div class="settings-actions">
        <button type="submit" class="btn btn--primary">保存设置</button>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="testing"
          @click="runConnectionTest"
        >
          <span v-if="testing" class="spinner" aria-hidden="true"></span>
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
      </div>

      <p class="settings-note">
        测试连接会请求接口的 /models
        端点，用于检查地址与鉴权，不消耗分析额度；部分兼容接口不提供该端点。
      </p>
    </form>

    <section class="card settings-panel">
      <div>
        <h2 class="section-title">外观</h2>
        <p class="settings-card__hint">选择后立即生效，并记住下一次打开时的偏好。</p>
      </div>
      <div class="theme-options" role="group" aria-label="主题模式">
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          type="button"
          class="theme-option"
          :class="{ 'is-active': preference === option.value }"
          :aria-pressed="preference === option.value"
          @click="chooseTheme(option.value)"
        >
          <span class="theme-option__name">{{ option.label }}</span>
          <span class="theme-option__desc">{{ option.description }}</span>
          <span v-if="preference === option.value" class="theme-option__check" aria-hidden="true">
            ✓
          </span>
        </button>
      </div>
    </section>

    <section class="card settings-panel">
      <div>
        <h2 class="section-title">数据与隐私</h2>
        <p class="settings-card__hint">
          本站没有后端。生词本、分析历史、主题和 API
          配置都存储在当前浏览器的本地存储中，不会同步到其他设备。
        </p>
      </div>

      <dl class="data-list">
        <div>
          <dt>生词本</dt>
          <dd>{{ vocabulary.count }} 个生词</dd>
        </div>
        <div>
          <dt>分析历史</dt>
          <dd>
            普通 {{ history.count }} / {{ MAX_HISTORY_RECORDS }} 次 · 星标
            {{ history.starredCount }} 条
          </dd>
        </div>
        <div>
          <dt>密钥状态</dt>
          <dd>{{ keyStatus }}</dd>
        </div>
        <div>
          <dt>分析数据</dt>
          <dd>仅发送到你配置的 API 服务</dd>
        </div>
      </dl>

      <p class="privacy-note">
        分析历史（含星标记录）会在本机保存你提交的原文和解析结果；星标记录不会被普通历史清理删除。
        localStorage 中的密钥是明文，任何能在本站运行的脚本或能访问此浏览器配置的人都可能读取它。
        建议使用权限受限的密钥，并避免在公共电脑上保存。
      </p>

      <div class="settings-links">
        <RouterLink to="/history" class="text-link">查看分析历史</RouterLink>
        <RouterLink to="/vocabulary" class="text-link">查看生词本</RouterLink>
        <RouterLink to="/" class="text-link">去解析句子</RouterLink>
      </div>
    </section>
  </section>
</template>

<style scoped>
.settings-page {
  display: grid;
  gap: 1.35rem;
  align-content: start;
}

.settings-card {
  display: grid;
  gap: 1.05rem;
  padding: 1.25rem;
}

.settings-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.settings-card__hint {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.7;
}

.config-status {
  flex: none;
  padding: 0.2rem 0.62rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.config-status[data-configured='true'] {
  border-color: transparent;
  background: var(--success-soft);
  color: var(--success);
}

.field__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.field__toggle {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 650;
}

.field__toggle:hover {
  text-decoration: underline;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  padding-top: 0.2rem;
}

.settings-note {
  color: var(--muted);
  font-size: 0.74rem;
  line-height: 1.65;
}

.settings-panel {
  display: grid;
  gap: 0.9rem;
  padding: 1.25rem;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.theme-option {
  position: relative;
  display: grid;
  gap: 0.22rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-align: left;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.theme-option:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}

.theme-option.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.theme-option__name {
  color: var(--text-strong);
  font-size: 0.87rem;
  font-weight: 650;
}

.theme-option__desc {
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.55;
}

.theme-option__check {
  position: absolute;
  top: 0.6rem;
  right: 0.7rem;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
}

.data-list {
  display: grid;
  gap: 0.55rem;
  margin: 0;
}

.data-list > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border);
}

.data-list > div:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.data-list dt {
  color: var(--muted);
  font-size: 0.8rem;
}

.data-list dd {
  margin: 0;
  color: var(--text);
  font-size: 0.84rem;
  text-align: right;
}

.privacy-note {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--text);
  font-size: 0.79rem;
  line-height: 1.7;
}

.settings-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.83rem;
}

@media (max-width: 760px) {
  .theme-options {
    grid-template-columns: 1fr;
  }

  .settings-card,
  .settings-panel {
    padding: 1rem;
  }
}
</style>
