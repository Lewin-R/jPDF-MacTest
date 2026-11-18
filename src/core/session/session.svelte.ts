import { openPdf } from '../ipc/api'
import { loadPdf, type PdfDoc } from '../viewer/pdfEngine'

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
  currentPage = $state(1)
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

  dispose(): Promise<void> {
    return this.doc.destroy()
  }
}
