import type { DocumentSession } from '../core/session/session.svelte'

export class TabsStore {
  sessions = $state<DocumentSession[]>([])
  activeId = $state<string | null>(null)

  readonly active: DocumentSession | null = $derived(
    this.sessions.find((s) => s.id === this.activeId) ?? null,
  )

  add(s: DocumentSession): void {
    const key = s.path.toLowerCase()
    const existing = this.sessions.find((x) => x.path.toLowerCase() === key)
    if (existing) {
      this.activeId = existing.id
      return
    }
    this.sessions.push(s)
    this.activeId = s.id
  }

  // The dirty prompt is added in Task 17.
  async close(id: string): Promise<void> {
    const idx = this.sessions.findIndex((s) => s.id === id)
    if (idx < 0) return
    const [removed] = this.sessions.splice(idx, 1)
    if (this.activeId === id) {
      this.activeId = (this.sessions[idx] ?? this.sessions[idx - 1])?.id ?? null
    }
    await removed.dispose()
  }

  next(): void {
    this.step(1)
  }

  prev(): void {
    this.step(-1)
  }

  private step(delta: number): void {
    const n = this.sessions.length
    if (n === 0) return
    const i = this.sessions.findIndex((s) => s.id === this.activeId)
    this.activeId = this.sessions[(i + delta + n) % n].id
  }
}

export const tabs = new TabsStore()
