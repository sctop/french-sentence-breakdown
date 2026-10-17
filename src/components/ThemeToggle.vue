<script setup lang="ts">
import { THEME_OPTIONS, useTheme } from '@/composables/useTheme'

const { preference, setPreference } = useTheme()
</script>

<template>
  <div class="theme-toggle" role="group" aria-label="主题模式">
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.value"
      type="button"
      class="theme-toggle__button"
      :class="{ 'is-active': preference === option.value }"
      :aria-pressed="preference === option.value"
      :title="`${option.label}：${option.description}`"
      @click="setPreference(option.value)"
    >
      <svg
        v-if="option.value === 'light'"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.42-1.42"
        />
      </svg>
      <svg
        v-else-if="option.value === 'dark'"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
      <span class="visually-hidden">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  gap: 0.12rem;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}

.theme-toggle__button {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.theme-toggle__button:hover {
  background: var(--surface-alt);
  color: var(--text);
}

.theme-toggle__button.is-active {
  background: var(--accent);
  color: var(--accent-contrast);
}

.theme-toggle__button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
