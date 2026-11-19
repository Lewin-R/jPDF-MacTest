import { frameSize, layoutLines, normalizeRotation } from '../geometry/textLayout'
import type { Command } from './history.svelte'
import { newId, type Annotation, type Rect } from './model'
import {
  insertEntry, remapForDelete, remapForInsert, removeEntry, rotateEntry, type PageEntry,
} from './pages'
import type { AnnotationStore } from './store.svelte'

/** Owner of the page list the page commands edit (the DocumentSession). */
export interface PageHost {
  pages: PageEntry[]
}

/**
 * One undo step changing the page list and the annotations together. The
 * first `do` computes the new page list (`apply`); undo puts back the exact
 * previous list and every annotation object that `apply` moved, redo the
 * computed list again.
 */
function pageCommand(
  label: string,
  host: PageHost,
  apply: (s: AnnotationStore, pages: PageEntry[]) => PageEntry[],
  revert: (s: AnnotationStore) => void,
): Command {
  let before: PageEntry[] = []
  let after: PageEntry[] | null = null
  /** Annotations as they were before `apply` moved or replaced them. */
  let originals: Annotation[] = []
  return {
    label,
    do: (s) => {
      before = host.pages
      originals = s.all()
      const next = apply(s, before)
      after ??= next
      host.pages = after
    },
    undo: (s) => {
      revert(s)
      // Same ids, same pages again: restore the exact objects (z-order unchanged).
      for (const a of originals) if (s.get(a.id) !== a && s.get(a.id)?.page === a.page) s.update(a.id, a)
      host.pages = before
    },
  }
}

/** Copy of a page after it, with independent copies (new ids) of its annotations. */
export function duplicatePage(host: PageHost, i: number): Command {
  let copies: Annotation[] | null = null
  return pageCommand(
    'Duplicate page',
    host,
    (s, pages) => {
      copies ??= s.byPage(i).map((a) => ({ ...a, id: newId(), page: i + 1, sourceRef: null }))
      s.remapPages(remapForInsert(i + 1))
      copies.forEach((a) => s.add(a))
      return insertEntry(pages, i + 1, { ...pages[i] })
    },
    (s) => {
      copies?.forEach((a) => s.remove(a.id))
      s.remapPages((p) => remapForDelete(i + 1)(p) ?? p)
    },
  )
}

/** Deletes page `i` and its annotations; null when it is the only page. */
export function deletePage(host: PageHost, i: number): Command | null {
  if (host.pages.length <= 1) return null
  let removed: Annotation[] = []
  return pageCommand(
    'Delete page',
    host,
    (s, pages) => {
      removed = s.byPage(i)
      removed.forEach((a) => s.remove(a.id))
      s.remapPages((p) => remapForDelete(i)(p) ?? p)
      return removeEntry(pages, i)
    },
    (s) => {
      s.remapPages(remapForInsert(i))
      // In z-order: each add lands at the end of the page.
      removed.forEach((a) => s.add(a))
    },
  )
}

/** Inserts an empty page after page `after`. */
export function insertBlankPage(
  host: PageHost,
  after: number,
  blank: { width: number; height: number; rotate: number },
): Command {
  return pageCommand(
    'Insert empty page',
    host,
    (s, pages) => {
      s.remapPages(remapForInsert(after + 1))
      return insertEntry(pages, after + 1, { kind: 'blank', ...blank })
    },
    (s) => s.remapPages((p) => remapForDelete(after + 1)(p) ?? p),
  )
}

/**
 * `r` turned a quarter about its centre (width and height swapped), then
 * kept inside `box` when given: scaled down about its centre (keeping the
 * aspect ratio) only if it is larger than the box, then shifted in.
 */
export function turnedRect(r: Rect, box?: Rect): Rect {
  const cx = (r[0] + r[2]) / 2
  const cy = (r[1] + r[3]) / 2
  let w = r[3] - r[1]
  let h = r[2] - r[0]
  if (!box) return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
  const k = Math.min(1, (box[2] - box[0]) / w, (box[3] - box[1]) / h)
  w *= k
  h *= k
  const x1 = Math.min(Math.max(cx - w / 2, box[0]), box[2] - w)
  const y1 = Math.min(Math.max(cy - h / 2, box[1]), box[3] - h)
  return [x1, y1, x1 + w, y1 + h]
}

/**
 * Turns page `i` by `delta` (±90) degrees. `fileRotation` is the /Rotate of
 * its file page (0 for an empty page, whose rotation is absolute): text boxes
 * on the page stay upright on screen, so they are wrapped again to their
 * width at the new rotation; pasted images stay upright and keep their shape
 * on screen, so their rect turns a quarter about its centre, kept inside
 * `pageBox` (the page's unrotated user-space box) when given.
 */
export function rotatePage(host: PageHost, i: number, delta: number, fileRotation: number, pageBox?: Rect): Command {
  return pageCommand(
    'Rotate page',
    host,
    (s, pages) => {
      const next = rotateEntry(pages, i, delta)
      const rotation = fileRotation + next[i].rotate
      for (const a of s.byPage(i)) {
        if (a.kind === 'freetext') {
          s.update(a.id, { ...a, lines: layoutLines(a.text, a.fontSize, frameSize(a.rect, rotation).width) })
        } else if (a.kind === 'image' && normalizeRotation(delta) % 180 !== 0) {
          s.update(a.id, { ...a, rect: turnedRect(a.rect, pageBox) })
        }
      }
      return next
    },
    () => {},
  )
}
