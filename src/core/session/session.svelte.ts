import { openPdf } from '../ipc/api'
import {
  clampScale, computeLayout, fitWidthScale, pageAt, zoomAround, PAGE_GAP, type Layout,
} from '../viewer/layout'
import { loadPdf, type PdfDoc } from '../viewer/pdfEngine'
import { renderCache } from '../viewer/renderCache'

export interface PageSize {
  width: number
  height: number
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

export class DocumentSession {
  readonly id: string = crypto.randomUUID()
  path: string
  fileName: string
  doc: PdfDoc
  /** Rotated page sizes at scale 1 (points). */
  pageSizes: PageSize[]
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
  // Replaced by a history-derived value in Task 9.
  dirty = $state(false)

  private constructor(path: string, doc: PdfDoc, pageSizes: PageSize[]) {
    this.path = path
    this.fileName = fileNameOf(path)
    this.doc = doc
    this.pageSizes = pageSizes
  }

  static async open(path: string): Promise<DocumentSession> {
    const doc = await loadPdf(await openPdf(path))
    try {
      const pageSizes = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, i) => {
          const { width, height } = (await doc.getPage(i + 1)).getViewport({ scale: 1 })
          return { width, height }
        }),
      )
      return new DocumentSession(path, doc, pageSizes)
    } catch (e) {
      await doc.destroy()
      throw e
    }
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
    renderCache.evictPrefix(`${this.id}:`)
    return this.doc.destroy()
  }
}
