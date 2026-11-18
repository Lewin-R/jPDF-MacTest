import type { AnnotationStore } from './store.svelte'

export interface Command { label: string; do(s: AnnotationStore): void; undo(s: AnnotationStore): void }

interface Entry { cmd: Command; id: number }

/**
 * Undo/redo stack. Dirty-tracking uses a unique id per executed command (the
 * "state id" of a history position) rather than a counter, so undoing to the
 * clean point and then executing something else is correctly dirty.
 */
export class History {
  private stack = $state.raw<Entry[]>([])
  /** Number of applied entries in `stack`. */
  private index = $state(0)
  /** State id of position 0 (changes when the oldest entries are dropped). */
  private baseId = $state(0)
  private cleanId = $state(0)
  private seq = 0
  private _version = $state(0)

  constructor(private store: AnnotationStore, private limit = 200) {}

  get canUndo(): boolean { return this.index > 0 }
  get canRedo(): boolean { return this.index < this.stack.length }
  /** Increments on every execute/undo/redo. */
  get version(): number { return this._version }
  get isDirty(): boolean { return this.currentId() !== this.cleanId }

  execute(cmd: Command): void {
    cmd.do(this.store)
    const next = this.stack.slice(0, this.index)
    next.push({ cmd, id: ++this.seq })
    if (next.length > this.limit) {
      this.baseId = next[next.length - this.limit - 1].id
      next.splice(0, next.length - this.limit)
    }
    this.stack = next
    this.index = next.length
    this._version++
  }

  undo(): boolean {
    if (this.index === 0) return false
    this.stack[this.index - 1].cmd.undo(this.store)
    this.index--
    this._version++
    return true
  }

  redo(): boolean {
    if (this.index >= this.stack.length) return false
    this.stack[this.index].cmd.do(this.store)
    this.index++
    this._version++
    return true
  }

  markClean(): void {
    this.cleanId = this.currentId()
  }

  private currentId(): number {
    return this.index > 0 ? this.stack[this.index - 1].id : this.baseId
  }
}
