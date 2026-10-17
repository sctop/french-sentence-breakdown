import { ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

const items = ref<ToastItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

function push(kind: ToastKind, message: string, action?: ToastAction): number {
  if (items.value.length >= 4) {
    const oldest = items.value[0]
    if (oldest) dismiss(oldest.id)
  }

  const id = nextId
  nextId += 1
  items.value = [...items.value, { id, kind, message, action }]

  const duration = kind === 'error' ? 6500 : 4000
  timers.set(
    id,
    setTimeout(() => dismiss(id), duration),
  )
  return id
}

export function useToast() {
  return {
    items,
    dismiss,
    success: (message: string, action?: ToastAction) => push('success', message, action),
    info: (message: string, action?: ToastAction) => push('info', message, action),
    error: (message: string, action?: ToastAction) => push('error', message, action),
  }
}
