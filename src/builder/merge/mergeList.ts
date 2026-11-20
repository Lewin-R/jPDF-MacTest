/**
 * The file list of the merge page (pure helpers). Files are merged whole, in
 * list order; page-level edits happen afterwards in the builder's Pages view.
 */

export interface MergeItem {
  /** Unique within the list (the same file may be listed twice). */
  id: number
  path: string
  name: string
  /** Page count; null while the file is being read. */
  pages: number | null
  /** Why the file cannot be merged (it blocks merging until removed). */
  error: string | null
}

/** `items` with the entry at `from` moved to `to` (clamped); the same list if `from` is out of range. */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || from >= items.length) return items
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
  return next
}

export function totalPages(items: readonly MergeItem[]): number {
  return items.reduce((sum, i) => sum + (i.pages ?? 0), 0)
}

/** At least two files, all read and none failed. */
export function readyToMerge(items: readonly MergeItem[]): boolean {
  return items.length >= 2 && items.every((i) => i.pages !== null && i.error === null)
}

/** The suggested target: `<first file's name> merged.pdf` in its folder. */
export function mergedName(firstPath: string): string {
  return `${firstPath.replace(/\.pdf$/i, '')} merged.pdf`
}

/**
 * Where a dragged row lands: the number of other rows whose middle (`mids`,
 * same coordinates as `y`, in list order) is above the pointer.
 */
export function dropIndex(y: number, mids: readonly number[]): number {
  let n = 0
  while (n < mids.length && mids[n] < y) n++
  return n
}

/** The listed files open in a tab with unsaved changes (merging reads files from disk), each once. */
export function blockers(paths: readonly string[], unsaved: (path: string) => boolean): string[] {
  return [...new Set(paths)].filter(unsaved)
}
