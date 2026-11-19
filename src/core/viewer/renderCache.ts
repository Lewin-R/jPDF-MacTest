/**
 * LRU cache of rendered pages, bounded by total pixel memory. Entries leaving
 * the cache are handed to `release` so their memory is freed immediately.
 *
 * One global instance (`renderCache`) is shared by all sessions so the memory
 * bound holds no matter how many tabs are open. Keys are
 * `${sessionId}:${pageNumber}@${scaleBucket}` (page numbers 1-based); a
 * session evicts its own entries with `evictPrefix(`${id}:`)` on dispose.
 * Storing a page at one scale drops that page's entries at other scales.
 */
export class RenderCache<T> {
  // Map iteration order is insertion order: first entry = least recently used.
  private entries = new Map<string, T>()
  private bytes = 0

  /**
   * `maxBytes`: budget for all entries as measured by `sizeOf`. `release`
   * is called for every entry that is evicted or replaced by another value.
   */
  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (entry: T) => number,
    private readonly release: (entry: T) => void,
  ) {}

  /** Bytes currently held. */
  get size(): number {
    return this.bytes
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry
  }

  /** Whether `entry` itself is cached (under any key). */
  holds(entry: T): boolean {
    for (const e of this.entries.values()) if (e === entry) return true
    return false
  }

  set(key: string, entry: T): void {
    const page = pageOf(key)
    for (const [k, old] of this.entries) {
      if (pageOf(k) === page) this.drop(k, old, old !== entry)
    }
    this.entries.set(key, entry)
    this.bytes += this.sizeOf(entry)
    // The newest entry stays even if it alone exceeds the budget.
    while (this.bytes > this.maxBytes && this.entries.size > 1) {
      const [oldestKey, oldest] = this.entries.entries().next().value!
      this.drop(oldestKey, oldest, true)
    }
  }

  /** Drops and releases `entry` wherever it is cached. */
  evict(entry: T): void {
    for (const [key, e] of this.entries) {
      if (e === entry) this.drop(key, e, true)
    }
  }

  evictPrefix(prefix: string): void {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix)) this.drop(key, entry, true)
    }
  }

  private drop(key: string, entry: T, release: boolean): void {
    this.entries.delete(key)
    this.bytes -= this.sizeOf(entry)
    if (release) this.release(entry)
  }
}

function pageOf(key: string): string {
  const at = key.lastIndexOf('@')
  return at < 0 ? key : key.slice(0, at)
}

/** Frees a page canvas' pixels, unless a page still shows it (it frees it on unmount). */
export function releaseCanvas(c: HTMLCanvasElement): void {
  if (c.isConnected) return
  c.width = 0
  c.height = 0
}

/**
 * Rendered page canvases. A page shows the cached canvas itself (no copy), so
 * the pages on screen count against this budget too. 192 MB: about four
 * pages at fit width on a 2.5x display, or ten on a 1.5x display.
 */
export const renderCache = new RenderCache<HTMLCanvasElement>(
  192 * 1024 * 1024,
  (c) => c.width * c.height * 4,
  releaseCanvas,
)
