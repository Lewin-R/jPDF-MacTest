/**
 * The document's page list as the user sees it (pure helpers). Page
 * operations (duplicate, delete, insert empty page, rotate) edit this list;
 * the file keeps its pages until the next save, which writes the list as a
 * page plan (see pagePlan).
 */
import { normalizeRotation as normRotate } from '../geometry/textLayout'

export type PageEntry =
  | {
      kind: 'source'
      /** 0-based page index in the loaded file. */
      source: number
      /** Extra rotation on top of the file page's /Rotate. */
      rotate: number
    }
  | {
      kind: 'blank'
      /** Unrotated size in points. */
      width: number
      height: number
      /** Absolute rotation. */
      rotate: number
    }

export interface PageSize {
  width: number
  height: number
}

/** One page of a save plan (same JSON shape as the Rust PageSpec). */
export type PageSpec =
  | { kind: 'source'; index: number; rotate: number }
  | { kind: 'blank'; width: number; height: number; rotate: number }

/** The file's own page order: one unrotated source entry per page. */
export function identityPages(numPages: number): PageEntry[] {
  return Array.from({ length: numPages }, (_, source) => ({ kind: 'source', source, rotate: 0 }))
}

/** Whether `pages` is the file's own page order, unrotated (nothing to write). */
export function isIdentity(pages: readonly PageEntry[], numPages: number): boolean {
  return (
    pages.length === numPages &&
    pages.every((p, i) => p.kind === 'source' && p.source === i && normRotate(p.rotate) === 0)
  )
}

export function insertEntry(pages: readonly PageEntry[], at: number, entry: PageEntry): PageEntry[] {
  const next = pages.slice()
  next.splice(at, 0, entry)
  return next
}

export function removeEntry(pages: readonly PageEntry[], at: number): PageEntry[] {
  return pages.filter((_, i) => i !== at)
}

/** `pages` with page `i` turned by `delta` degrees (±90). */
export function rotateEntry(pages: readonly PageEntry[], i: number, delta: number): PageEntry[] {
  return pages.map((p, k) => (k === i ? { ...p, rotate: normRotate(p.rotate + delta) } : p))
}

/** New page index of an annotation after a page was inserted at `at`. */
export function remapForInsert(at: number): (page: number) => number {
  return (page) => (page >= at ? page + 1 : page)
}

/** New page index after page `at` was deleted; null for annotations on that page. */
export function remapForDelete(at: number): (page: number) => number | null {
  return (page) => (page === at ? null : page > at ? page - 1 : page)
}

/**
 * For each page, whether it is the first one showing its file page. Saving
 * keeps a file page's object (and its foreign annotations) there only;
 * later copies are new pages without them.
 */
export function firstOccurrences(pages: readonly PageEntry[]): boolean[] {
  const seen = new Set<number>()
  return pages.map((p) => {
    if (p.kind !== 'source') return true
    if (seen.has(p.source)) return false
    seen.add(p.source)
    return true
  })
}

function turned(size: PageSize, rotate: number): PageSize {
  return normRotate(rotate) % 180 === 0 ? size : { width: size.height, height: size.width }
}

/**
 * Display size of every entry at scale 1. `sourceSizes` are the file pages'
 * sizes with their own /Rotate applied (as pdf.js reports them).
 */
export function pageSizesOf(pages: readonly PageEntry[], sourceSizes: readonly PageSize[]): PageSize[] {
  return pages.map((p) => {
    if (p.kind === 'blank') return turned({ width: p.width, height: p.height }, p.rotate)
    const size = sourceSizes[p.source] ?? sourceSizes[0] ?? { width: 612, height: 792 }
    return normRotate(p.rotate) === 0 ? size : turned(size, p.rotate)
  })
}

/** The plan the writer builds the saved page tree from; `fileRotations[i]` is file page i's /Rotate. */
export function pagePlan(pages: readonly PageEntry[], fileRotations: readonly number[]): PageSpec[] {
  return pages.map((p) =>
    p.kind === 'blank'
      ? { kind: 'blank', width: p.width, height: p.height, rotate: normRotate(p.rotate) }
      : { kind: 'source', index: p.source, rotate: normRotate((fileRotations[p.source] ?? 0) + p.rotate) },
  )
}
