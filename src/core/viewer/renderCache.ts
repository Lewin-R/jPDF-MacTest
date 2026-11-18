/**
 * LRU cache of rendered page bitmaps. Evicted or replaced bitmaps are closed
 * so their GPU/CPU memory is released immediately.
 *
 * One global instance (`renderCache`) is shared by all sessions so the memory
 * bound holds no matter how many tabs are open. Keys are
 * `${sessionId}:${pageNumber}@${scaleBucket}` (page numbers 1-based); a
 * session evicts its own entries with `evictPrefix(`${id}:`)` on dispose.
 */
export class RenderCache {
  // Map iteration order is insertion order: first entry = least recently used.
  private entries = new Map<string, ImageBitmap>()

  constructor(private readonly maxEntries: number) {}

  get(key: string): ImageBitmap | undefined {
    const bmp = this.entries.get(key)
    if (bmp === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, bmp)
    return bmp
  }

  set(key: string, bmp: ImageBitmap): void {
    const old = this.entries.get(key)
    if (old !== undefined) {
      this.entries.delete(key)
      if (old !== bmp) old.close()
    }
    this.entries.set(key, bmp)
    while (this.entries.size > this.maxEntries) {
      const [oldestKey, oldest] = this.entries.entries().next().value!
      this.entries.delete(oldestKey)
      oldest.close()
    }
  }

  evictPrefix(prefix: string): void {
    for (const [key, bmp] of this.entries) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key)
        bmp.close()
      }
    }
  }
}

export const renderCache = new RenderCache(12)
