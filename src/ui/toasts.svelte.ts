export type ToastKind = 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run(): void
}

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

const MAX = 3
const DURATION_MS: Record<ToastKind, number> = { info: 4000, warning: 6000, error: 8000 }

export class ToastStore {
  items = $state<ToastItem[]>([])
  private seq = 0
  private timers = new Map<number, ReturnType<typeof setTimeout>>()

  /** Shows a toast (newest last, at most 3); returns its id. */
  show(message: string, kind: ToastKind = 'info', action?: ToastAction): number {
    const id = ++this.seq
    this.items.push({ id, message, kind, action })
    while (this.items.length > MAX) this.dismiss(this.items[0].id)
    this.timers.set(id, setTimeout(() => this.dismiss(id), DURATION_MS[kind]))
    return id
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    const i = this.items.findIndex((t) => t.id === id)
    if (i >= 0) this.items.splice(i, 1)
  }
}

export const toasts = new ToastStore()
