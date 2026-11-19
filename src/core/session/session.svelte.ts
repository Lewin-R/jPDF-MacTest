import { openPdf, readAnnotations } from '../ipc/api'
import {
  clampScale, computeLayout, fitWidthScale, pageAt, zoomAround, PAGE_GAP, type Layout,
} from '../viewer/layout'
import { loadPdf, type PdfDoc } from '../viewer/pdfEngine'
import { renderCache } from '../viewer/renderCache'
import { frameSize, layoutLines } from '../geometry/textLayout'
import { toasts } from '../../ui/toasts.svelte'
import { History } from './history.svelte'
import type { Annotation } from './model'
import { AnnotationStore } from './store.svelte'
import { SessionToolState } from './toolState.svelte'

export interface ViewAnchor {
  /** Resolves when the viewport size next changes. */
  resized: Promise<void>
  restore(): void
}

export interface PageSize {
  width: number
  height: number
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

const SIZE_CHUNK = 16

/**
 * JuliePDF-managed annotations of the file. pdf.js opens some damaged files
 * the annotation reader rejects; those still open, without editable annotations.
 */
async function readManaged(path: string): Promise<Annotation[]> {
  try {
    return await readAnnotations(path)
  } catch (e) {
    console.error(`Failed to read annotations of ${path}`, e)
    toasts.show('Annotations in this file could not be loaded', 'warning')
    return []
  }
}

/**
 * The reader returns freetext annotations without `lines`: wraps their text
 * to each box's on-screen width (which depends on the page's /Rotate).
 */
async function withFreeTextLines(doc: PdfDoc, annotations: Annotation[]): Promise<Annotation[]> {
  const pages = [...new Set(annotations.filter((a) => a.kind === 'freetext').map((a) => a.page))]
  if (pages.length === 0) return annotations
  const rotations = new Map<number, number>()
  await Promise.all(
    pages.map(async (p) => {
      const page = await doc.getPage(p + 1).catch(() => null)
      rotations.set(p, page?.rotate ?? 0)
    }),
  )
  return annotations.map((a) =>
    a.kind === 'freetext'
      ? { ...a, lines: layoutLines(a.text, a.fontSize, frameSize(a.rect, rotations.get(a.page) ?? 0).width) }
      : a,
  )
}

async function pageSizeOf(doc: PdfDoc, page: number): Promise<PageSize> {
  const { width, height } = (await doc.getPage(page)).getViewport({ scale: 1 })
  return { width, height }
}

function sameSize(a: PageSize, b: PageSize): boolean {
  return a.width === b.width && a.height === b.height
}

export class DocumentSession {
  readonly id: string = crypto.randomUUID()
  /** Where the document is saved; changes on Save As. */
  path: string = $state('')
  fileName: string = $state('')
  doc: PdfDoc
  /**
   * Rotated page sizes at scale 1 (points). Starts as page 1's size for every
   * page; the real sizes are filled in the background (see pageSizesLoaded).
   */
  pageSizes: PageSize[] = $state.raw([])
  /** Resolves once every page's real size is known (or the session is disposed). */
  readonly pageSizesLoaded: Promise<void>
  scale = $state(1)
  scrollTop = $state(0)
  scrollLeft = $state(0)
  /** 1-based page number shown in the status bar. */
  currentPage = $state(1)
  /** Size of the viewer's scroll viewport (client area), set by the Viewer. */
  viewportW = $state(0)
  viewportH = $state(0)
  /** False until initView has applied the initial fit-width scale. */
  viewInitialized = false

  readonly layout: Layout = $derived.by(() => computeLayout(this.pageSizes, this.scale))

  /** Set by goToPage so the echoing scroll event keeps the requested page. */
  private pinnedTop: number | null = null
  private disposed = false
  private viewportWaiters: (() => void)[] = []
  readonly store = new AnnotationStore()
  readonly history = new History(this.store)
  /** Selection and live tool preview; created here, never lazily (see SessionToolState). */
  readonly toolState = new SessionToolState()

  get dirty(): boolean {
    return this.history.isDirty
  }

  /**
   * Finishes an in-progress edit (an open text box), set by the tool that owns
   * it. Save and close call commitPendingEdit first so the edit is included.
   */
  pendingEdit: (() => void) | null = null

  commitPendingEdit(): void {
    const commit = this.pendingEdit
    this.pendingEdit = null
    commit?.()
  }

  private constructor(path: string, doc: PdfDoc, first: PageSize, annotations: Annotation[]) {
    this.setPath(path)
    this.doc = doc
    // Before the first render: pdf.js must not draw what the overlay draws.
    this.suppress(annotations.flatMap((a) => (a.sourceRef ? [a.sourceRef] : [])))
    this.store.load(annotations)
    this.pageSizes = Array.from({ length: doc.numPages }, () => first)
    this.pageSizesLoaded = this.loadRemainingSizes().catch((e: unknown) => {
      if (!this.disposed) console.error(`Failed to read page sizes of ${path}`, e)
    })
  }

  /**
   * Opens a PDF with its JuliePDF-managed annotations. Resolves as soon as
   * page 1's size is known (fast first page).
   */
  static async open(path: string): Promise<DocumentSession> {
    const [bytes, read] = await Promise.all([openPdf(path), readManaged(path)])
    const doc = await loadPdf(bytes)
    try {
      const annotations = await withFreeTextLines(doc, read)
      return new DocumentSession(path, doc, await pageSizeOf(doc, 1), annotations)
    } catch (e) {
      await doc.destroy()
      throw e
    }
  }

  setPath(path: string): void {
    this.path = path
    this.fileName = fileNameOf(path)
  }

  /**
   * Hides annotations with these sourceRefs from pdf.js rendering. Refs stay
   * suppressed for the life of the pdf.js document (it keeps the bytes it was
   * opened with, so annotations deleted since loading must stay hidden too).
   */
  suppress(refs: Iterable<string>): void {
    this.doc.suppressAnnotations(refs)
  }

  private async loadRemainingSizes(): Promise<void> {
    // Let the first page's render request reach the worker before ours.
    await new Promise((r) => setTimeout(r, 0))
    const n = this.doc.numPages
    for (let start = 2; start <= n && !this.disposed; start += SIZE_CHUNK) {
      const end = Math.min(n, start + SIZE_CHUNK - 1)
      const chunk = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, k) => pageSizeOf(this.doc, start + k)),
      )
      if (this.disposed) return
      const old = this.pageSizes
      if (chunk.every((s, k) => sameSize(s, old[start - 1 + k]))) continue
      const next = old.slice()
      chunk.forEach((s, k) => (next[start - 1 + k] = s))
      this.applyPageSizes(next)
    }
  }

  /** Replaces pageSizes, keeping the current page's position in the viewport. */
  private applyPageSizes(sizes: PageSize[]): void {
    const p = this.currentPage - 1
    const oldTop = this.layout.tops[p]
    this.pageSizes = sizes
    const delta = this.layout.tops[p] - oldTop
    if (delta === 0) return
    this.scrollTop += delta
    if (this.pinnedTop !== null) this.pinnedTop += delta
  }

  setViewport(width: number, height: number): void {
    const changed = width !== this.viewportW || height !== this.viewportH
    this.viewportW = width
    this.viewportH = height
    if (changed) this.viewportWaiters.splice(0).forEach((r) => r())
  }

  /**
   * Scrolls by a delta (pan gestures). The Viewer applies the new position to
   * its scroll container and echoes the clamped result back through setScroll.
   */
  scrollBy(dx: number, dy: number): void {
    this.scrollTop = Math.max(0, this.scrollTop + dy)
    this.scrollLeft = Math.max(0, this.scrollLeft + dx)
  }

  /** Records the viewer's scroll position (from scroll events). */
  setScroll(top: number, left: number): void {
    this.scrollTop = top
    this.scrollLeft = left
    if (this.pinnedTop !== null && Math.abs(top - this.pinnedTop) < 1) return
    this.pinnedTop = null
    this.currentPage = pageAt(this.layout, top + this.viewportH / 3) + 1
  }

  /**
   * Zooms to `scale` (clamped) keeping the content point under `anchor`
   * (viewport coordinates, default: viewport centre) fixed on screen.
   */
  zoomTo(scale: number, anchor?: { x: number; y: number }): void {
    const s1 = clampScale(scale)
    if (s1 === this.scale) return
    const a = anchor ?? { x: this.viewportW / 2, y: this.viewportH / 2 }
    const l1 = computeLayout(this.pageSizes, s1)
    const pos = zoomAround(
      this.layout, l1, this.scale, s1, a,
      { top: this.scrollTop, left: this.scrollLeft }, this.viewportW,
    )
    this.scale = s1
    this.setScroll(pos.top, pos.left)
  }

  fitWidth(): void {
    const maxW = Math.max(...this.pageSizes.map((p) => p.width))
    this.zoomTo(fitWidthScale(maxW, this.viewportW))
  }

  /** First display: fit width, scrolled to the top. Later calls do nothing. */
  initView(): void {
    if (this.viewInitialized) return
    this.viewInitialized = true
    this.fitWidth()
    this.setScroll(0, 0)
  }

  /**
   * Remembers the current page and how far into it the viewport is (as a
   * fraction of the page height, so it survives a zoom change). `resized`
   * resolves when the viewport size next changes; `restore` puts the position
   * back, unless the user scrolled in the meantime.
   */
  anchorView(): ViewAnchor {
    const p = Math.max(0, this.currentPage - 1)
    const height = (this.pageSizes[p]?.height ?? 1) * this.scale
    const fraction = (this.scrollTop - (this.layout.tops[p] ?? 0)) / height
    const top0 = this.scrollTop
    const scale0 = this.scale
    const left = this.scrollLeft
    const resized = new Promise<void>((resolve) => this.viewportWaiters.push(resolve))
    const restore = () => {
      if (this.disposed) return
      // A resize may clamp the scroll position; anything else is the user moving.
      const clamped = Math.min(top0, Math.max(0, this.layout.totalHeight - this.viewportH))
      if (this.scale === scale0 && Math.abs(this.scrollTop - clamped) >= 1) return
      const h = (this.pageSizes[p]?.height ?? 1) * this.scale
      this.setScroll(Math.max(0, (this.layout.tops[p] ?? 0) + fraction * h), left)
    }
    return { resized, restore }
  }

  /** Scrolls so 1-based page `page` (clamped to the document) is at the top. */
  goToPage(page: number): void {
    const n = this.pageSizes.length
    if (n === 0) return
    const p = Math.min(n, Math.max(1, Math.round(page)))
    const l = this.layout
    const maxTop = Math.max(0, l.totalHeight - this.viewportH)
    const top = Math.min(maxTop, Math.max(0, l.tops[p - 1] - PAGE_GAP))
    this.scrollTop = top
    this.currentPage = p
    this.pinnedTop = top
  }

  dispose(): Promise<void> {
    this.disposed = true
    renderCache.evictPrefix(`${this.id}:`)
    return this.doc.destroy()
  }
}
