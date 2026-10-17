<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ThemeToggle from './ThemeToggle.vue'
import { useVocabularyStore } from '@/stores/vocabulary'

const vocabulary = useVocabularyStore()
const badge = computed(() => (vocabulary.count > 99 ? '99+' : String(vocabulary.count)))
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <RouterLink to="/" class="brand" aria-label="法语逐词解析首页">
        <span class="brand__mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="brand__text">
          <span class="brand__name">法语逐词解析</span>
          <span class="brand__tag">MOT À MOT</span>
        </span>
      </RouterLink>

      <nav class="site-nav" aria-label="主导航">
        <RouterLink to="/" class="site-nav__link">句子解析</RouterLink>
        <RouterLink to="/history" class="site-nav__link">历史</RouterLink>
        <RouterLink to="/vocabulary" class="site-nav__link">
          生词本
          <span v-if="vocabulary.count" class="site-nav__badge">{{ badge }}</span>
        </RouterLink>
        <RouterLink to="/settings" class="site-nav__link">设置</RouterLink>
      </nav>

      <div class="site-header__actions">
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--border);
  background: var(--header-bg);
  backdrop-filter: blur(16px);
}

.site-header__inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0.85rem 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text-strong);
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.brand:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.brand__mark {
  display: flex;
  width: 1.95rem;
  height: 1.95rem;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  transform: rotate(-4deg);
  box-shadow: var(--shadow-sm);
}

.brand__mark span {
  flex: 1;
}

.brand__mark span:nth-child(1) {
  background: #2f56a7;
}

.brand__mark span:nth-child(2) {
  background: #fffdf8;
}

.brand__mark span:nth-child(3) {
  background: #c94f4f;
}

.brand__text {
  display: grid;
  line-height: 1.2;
}

.brand__name {
  font-family: var(--font-serif);
  font-size: 1.04rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.brand__tag {
  color: var(--muted);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.24em;
}

.site-nav {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: auto;
}

.site-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.42rem 0.72rem;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.87rem;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.site-nav__link:hover {
  background: var(--surface-alt);
  color: var(--text);
}

.site-nav__link.router-link-exact-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.site-nav__badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.25rem;
  margin-left: 0.12rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1.4;
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 760px) {
  .site-header__inner {
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.7rem 1rem;
  }

  .brand__tag {
    display: none;
  }

  .site-header__actions {
    margin-left: auto;
  }

  .site-nav {
    order: 3;
    width: 100%;
    margin-left: 0;
    overflow-x: auto;
    padding-bottom: 0.1rem;
  }
}
</style>
