import { computed, readonly, ref, watch } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeOption {
  value: ThemePreference
  label: string
  description: string
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'system', label: '跟随系统', description: '随系统的亮色/深色模式自动切换' },
  { value: 'light', label: '浅色', description: '暖色纸感，适合明亮环境' },
  { value: 'dark', label: '深色', description: '低亮度深色，适合夜间使用' },
]

const STORAGE_KEY = 'fsb:theme'
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f5f1e8',
  dark: '#10131a',
}

function readPreference(): ThemePreference {
  try {
    if (typeof window === 'undefined') return 'system'
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Ignore unavailable storage; follow the system preference instead.
  }
  return 'system'
}

const mediaQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const systemDark = ref(mediaQuery?.matches ?? false)
const preference = ref<ThemePreference>(readPreference())

const resolved = computed<ResolvedTheme>(() => {
  if (preference.value === 'system') return systemDark.value ? 'dark' : 'light'
  return preference.value
})

mediaQuery?.addEventListener('change', (event) => {
  systemDark.value = event.matches
})

function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

watch(resolved, (theme) => applyTheme(theme), { immediate: true })

export function useTheme() {
  function setPreference(next: ThemePreference): void {
    preference.value = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The in-memory choice still works for this visit.
    }
  }

  return {
    preference: readonly(preference),
    resolved,
    setPreference,
  }
}
