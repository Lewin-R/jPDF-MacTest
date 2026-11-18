import { openPdf } from '../ipc/api'
import {
  clampScale, computeLayout, fitWidthScale, pageAt, zoomAround, PAGE_GAP, type Layout,
} from '../viewer/layout'
import { loadPdf, type PdfDoc } from '../viewer/pdfEngine'
import { renderCache } from '../viewer/renderCache'
import { History } from './history.svelte'
import { AnnotationStore } from './store.svelte'

export interface PageSize {
  width: number
  height: number
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

const SIZE_CHUNK = 16

async function pageSizeOf(doc: PdfDoc, page: number): Promise<PageSize> {
  const { width, height } = (await doc.getPage(page)).getViewport({ scale: 1 })
  return { width, height }
}

function sameSize(a: PageSize, b: PageSize): boolean {
  return a.width === b.width && a.height === b.height
}

export class DocumentSession {
  readonly id: string = crypto.randomUUID()
  path: string
  fileName: string
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
  readonly store = new AnnotationStore()
  readonly history = new History(this.store)

  get dirty(): boolean {
    return this.history.isDirty
  }

  private constructor(path: string, doc: PdfDoc, first: PageSize) {
    this.path = path
    this.fileName = fileNameOf(path)
    this.doc = doc
    this.pageSizes = Array.from({ length: doc.numPages }, () => first)
    this.pageSizesLoaded = this.loadRemainingSizes().catch((e: unknown) => {
      if (!this.disposed) console.error(`Failed to read page sizes of ${path}`, e)
    })
  }

  /** Opens a PDF. Resolves as soon as page 1's size is known (fast first page). */
  static async open(path: string): Promise<DocumentSession> {
    const doc = await loadPdf(await openPdf(path))
    try {
      return new DocumentSession(path, doc, await pageSizeOf(doc, 1))
    } catch (e) {
      await doc.destroy()
      throw e
    }
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
    this.viewportW = width
    this.viewportH = height
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
