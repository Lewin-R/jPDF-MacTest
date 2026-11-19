/**
 * LRU cache of rendered pages, bounded by pixel memory. Entries leaving the
 * cache are handed to `release` so their memory is freed immediately.
 *
 * Pinned entries (pages on screen) are never evicted: their memory cannot be
 * freed while they are shown anyway. They stay in the cache and count in
 * `size`, but the budget only bounds the unpinned entries, i.e. the pages
 * kept for scrolling back.
 *
 * One global instance (`renderCache`) is shared by all sessions so the memory
 * bound holds no matter how many tabs are open. Keys are (see pageSource.renderKey)
 * `${sessionId}:${pageNumber}@${scaleBucket}#${what is shown}` (page numbers 1-based); a
 * session evicts its own entries with `evictPrefix(`${id}:`)` on dispose.
 * Storing a page at one scale drops that page's entries at other scales.
 */
export class RenderCache<T> {
  // Map iteration order is insertion order: first entry = least recently used.
  private entries = new Map<string, T>()
  private bytes = 0

  /**
   * `maxBytes`: budget for the unpinned entries as measured by `sizeOf`.
   * `release` is called for every entry that is evicted or replaced by
   * another value. `pinned` tells whether an entry is in use (never evicted).
   */
  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (entry: T) => number,
    private readonly release: (entry: T) => void,
    private readonly pinned: (entry: T) => boolean = () => false,
  ) {}

  /** Bytes currently held, pinned entries included. */
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
    this.trim(key)
  }

  /**
   * Evicts least recently used unpinned entries until they fit the budget
   * (runs on every `set`; call it when entries may have become unpinned).
   */
  trim(newest?: string): void {
    let unpinned = 0
    for (const e of this.entries.values()) if (!this.pinned(e)) unpinned += this.sizeOf(e)
    for (const [key, e] of this.entries) {
      if (unpinned <= this.maxBytes) return
      // The newest entry stays even if it alone exceeds the budget.
      if (key === newest || this.pinned(e)) continue
      unpinned -= this.sizeOf(e)
      this.drop(key, e, true)
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
 * Rendered page canvases. A page shows the cached canvas itself (no copy);
 * canvases in the DOM (the visible pages and the overscan) are pinned, so
 * they are always accounted for and the budget bounds the pages kept off
 * screen for scrolling back. 64 MB is the smallest round budget that still
 * holds one fit-width A4 page at 2.5x (2964x4195 px = 50 MB): with the
 * overscan page that keeps scrolling back two pages instant. On a 1x–1.5x
 * display it holds about 3–8 pages.
 */
export const renderCache = new RenderCache<HTMLCanvasElement>(
  64 * 1024 * 1024,
  (c) => c.width * c.height * 4,
  releaseCanvas,
  (c) => c.isConnected,
)
