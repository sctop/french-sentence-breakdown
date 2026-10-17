<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import ToastHost from '@/components/ToastHost.vue'
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <div class="app-shell">
    <AppHeader />

    <main id="main" class="app-main" tabindex="-1">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="site-footer__inner">
        <p>本地优先 · 生词本、分析历史与 API 配置只保存在当前浏览器。</p>
        <p class="site-footer__note">分析请求会直接发送到你配置的 LLM 接口。</p>
      </div>
    </footer>

    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-main {
  flex: 1;
}

.app-main:focus {
  outline: none;
}

.skip-link {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 100;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-160%);
  transition: transform 0.18s ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.site-footer {
  margin-top: auto;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 55%, transparent);
}

.site-footer__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35rem 1.5rem;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.3rem 1.5rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.site-footer__note {
  opacity: 0.78;
}

@media (max-width: 640px) {
  .site-footer__inner {
    padding: 1rem;
    font-size: 0.74rem;
  }
}
</style>
