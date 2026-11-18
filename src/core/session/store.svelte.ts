import { SvelteMap } from 'svelte/reactivity'
import type { Annotation } from './model'

/**
 * Annotations of one document. Reactive per annotation id and per page, so a
 * page component re-renders only when its own annotations change.
 *
 * Change tracking: an annotation is in changedSince() if it was added or
 * updated since load/markSaved and is still present (a re-added annotation
 * counts as added, even if unchanged since the last save). deletedSourceRefs()
 * are the sourceRefs of annotations that had one at load/markSaved and are
 * currently absent; re-adding one drops it from that set.
 */
export class AnnotationStore {
  private byId = new SvelteMap<string, Annotation>()
  private pages = new SvelteMap<number, Annotation[]>()
  private changed = new Set<string>()
  /** id -> sourceRef of annotations present in the file at load/last save. */
  private baseline = new Map<string, string>()

  /** Insertion order = z-order. */
  byPage(page: number): Annotation[] {
    return this.pages.get(page) ?? []
  }

  get(id: string): Annotation | undefined {
    return this.byId.get(id)
  }

  all(): Annotation[] {
    return [...this.byId.values()]
  }

  add(a: Annotation): void {
    if (this.byId.has(a.id)) throw new Error(`Annotation ${a.id} already exists`)
    this.byId.set(a.id, a)
    this.pages.set(a.page, [...this.byPage(a.page), a])
    this.changed.add(a.id)
  }

  update(id: string, next: Annotation): void {
    const old = this.byId.get(id)
    if (!old) throw new Error(`Annotation ${id} not found`)
    if (next.id !== id) throw new Error('update must not change the id')
    this.byId.set(id, next) // keeps its position in the Map
    if (old.page === next.page) {
      this.pages.set(old.page, this.byPage(old.page).map((x) => (x.id === id ? next : x)))
    } else {
      this.dropFromPage(old)
      this.pages.set(next.page, [...this.byPage(next.page), next])
    }
    this.changed.add(id)
  }

  remove(id: string): void {
    const old = this.byId.get(id)
    if (!old) return
    this.byId.delete(id)
    this.dropFromPage(old)
    this.changed.delete(id)
  }

  /** Replaces all content with annotations read from the file. */
  load(list: Annotation[]): void {
    this.byId.clear()
    this.pages.clear()
    const perPage = new Map<number, Annotation[]>()
    for (const a of list) {
      this.byId.set(a.id, a)
      perPage.set(a.page, [...(perPage.get(a.page) ?? []), a])
    }
    for (const [p, l] of perPage) this.pages.set(p, l)
    this.resetTracking()
  }

  deletedSourceRefs(): string[] {
    const out: string[] = []
    for (const [id, ref] of this.baseline) if (!this.byId.has(id)) out.push(ref)
    return out
  }

  changedSince(): Annotation[] {
    return this.all().filter((a) => this.changed.has(a.id))
  }

  /** Applies sourceRefs returned by a save (without counting as a change) and resets tracking. */
  markSaved(refs: Record<string, string>): void {
    for (const [id, ref] of Object.entries(refs)) {
      const a = this.byId.get(id)
      if (!a) continue
      const next = { ...a, sourceRef: ref }
      this.byId.set(id, next)
      this.pages.set(a.page, this.byPage(a.page).map((x) => (x.id === id ? next : x)))
    }
    this.resetTracking()
  }

  private dropFromPage(a: Annotation): void {
    const rest = this.byPage(a.page).filter((x) => x.id !== a.id)
    if (rest.length) this.pages.set(a.page, rest)
    else this.pages.delete(a.page)
  }

  private resetTracking(): void {
    this.changed.clear()
    this.baseline.clear()
    for (const a of this.byId.values()) if (a.sourceRef) this.baseline.set(a.id, a.sourceRef)
  }
}
