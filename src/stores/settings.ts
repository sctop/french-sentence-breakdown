import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readJson, writeJson } from '@/lib/storage'
import { validateApiSettings, type ApiSettings } from '@/lib/llm'

const STORAGE_KEY = 'fsb:api:v1'

const EMPTY_SETTINGS: ApiSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
}

function loadSettings(): ApiSettings {
  const stored = readJson<unknown>(STORAGE_KEY, null)
  if (typeof stored !== 'object' || stored === null) return { ...EMPTY_SETTINGS }

  const record = stored as Record<string, unknown>
  return {
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model: typeof record.model === 'string' ? record.model : '',
  }
}

export interface SettingsSaveResult {
  ok: boolean
  error?: string
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ApiSettings>(loadSettings())

  const isConfigured = computed(
    () => Boolean(settings.value.baseUrl.trim()) && Boolean(settings.value.model.trim()),
  )

  function save(next: ApiSettings): SettingsSaveResult {
    const validation = validateApiSettings(next)
    if (!validation.ok) return { ok: false, error: validation.error }

    settings.value = validation.settings

    if (!writeJson(STORAGE_KEY, settings.value)) {
      return {
        ok: false,
        error: '设置已在本页生效，但无法写入浏览器本地存储，刷新后可能丢失。',
      }
    }
    return { ok: true }
  }

  return { settings, isConfigured, save }
})
