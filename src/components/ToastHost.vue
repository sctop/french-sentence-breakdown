<script setup lang="ts">
import { useToast, type ToastItem } from '@/composables/useToast'

const { items, dismiss } = useToast()

function runAction(toast: ToastItem): void {
  toast.action?.run()
  dismiss(toast.id)
}
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div
        v-for="toast in items"
        :key="toast.id"
        class="toast"
        :data-kind="toast.kind"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
      >
        <p class="toast__message">{{ toast.message }}</p>
        <button v-if="toast.action" type="button" class="toast__action" @click="runAction(toast)">
          {{ toast.action.label }}
        </button>
        <button type="button" class="toast__close" aria-label="关闭提示" @click="dismiss(toast.id)">
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 60;
  width: min(25rem, calc(100vw - 2rem));
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.toast {
  --toast-accent: var(--accent);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.78rem 0.85rem;
  border: 1px solid var(--border);
  border-left: 3px solid var(--toast-accent);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 0.86rem;
  pointer-events: auto;
}

.toast[data-kind='success'] {
  --toast-accent: var(--success);
}

.toast[data-kind='error'] {
  --toast-accent: var(--danger);
}

.toast__message {
  flex: 1;
  min-width: 0;
  line-height: 1.55;
}

.toast__action {
  flex: none;
  padding: 0.1rem 0.2rem;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
}

.toast__action:hover {
  text-decoration: underline;
}

.toast__close {
  flex: none;
  padding: 0.05rem 0.25rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
}

.toast__close:hover {
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 640px) {
  .toast-host {
    right: 1rem;
    bottom: 1rem;
    width: calc(100vw - 2rem);
  }
}
</style>
