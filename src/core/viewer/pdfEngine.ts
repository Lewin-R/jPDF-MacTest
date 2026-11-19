import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  PDFWorker,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

let sharedWorker: PDFWorker | null = null

/**
 * The pdf.js worker all documents share. Starting a worker (loading and
 * compiling its 1.3 MB script) costs tens of milliseconds, so it is started
 * once (see warmUpPdfWorker) instead of per opened file.
 */
function pdfWorker(): PDFWorker {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new PDFWorker()
  return sharedWorker
}

/** Starts the shared pdf.js worker ahead of the first open. */
export function warmUpPdfWorker(): void {
  pdfWorker()
}

export interface PdfDoc {
  numPages: number
  /** True once destroy() was called; renders failing afterwards are expected. */
  readonly destroyed: boolean
  /** `i` is the 1-based page number. */
  getPage(i: number): Promise<PDFPageProxy>
  /**
   * Stops pdf.js from drawing these annotations (pdf.js ids, e.g. "12R"):
   * JuliePDF draws its own annotations in the overlay. Takes effect for pages
   * rendered with `annotationMode: AnnotationMode.ENABLE_STORAGE`.
   */
  suppressAnnotations(refs: Iterable<string>): void
  destroy(): Promise<void>
}

class PdfJsDoc implements PdfDoc {
  destroyed = false

  constructor(
    private readonly task: PDFDocumentLoadingTask,
    private readonly proxy: PDFDocumentProxy,
  ) {}

  get numPages(): number {
    return this.proxy.numPages
  }

  getPage(i: number): Promise<PDFPageProxy> {
    return this.proxy.getPage(i)
  }

  suppressAnnotations(refs: Iterable<string>): void {
    // The worker skips annotations whose storage entry says noView
    // (Annotation.mustBeViewed); see tests/core/viewer/annotationSuppression.test.ts.
    for (const ref of refs) this.proxy.annotationStorage.setValue(ref, { noView: true })
  }

  destroy(): Promise<void> {
    this.destroyed = true
    // Tears down the document in the shared worker.
    return this.task.destroy()
  }
}

/**
 * Loads a PDF. Throws `{code:'Encrypted'|'InvalidPdf', message}` on failure.
 * Takes ownership of `data`: pdf.js transfers (detaches) it to its worker,
 * which saves copying a whole file on the way to the first page.
 */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const task = getDocument({
    data: new Uint8Array(data),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    iccUrl: '/pdfjs/iccs/',
    wasmUrl: '/pdfjs/wasm/',
    // GPU canvases: about twice as fast to paint a full page at high DPI as
    // pdf.js' default software canvases, and less memory in the GPU process
    // (PageView re-renders a page whose canvas lost its GPU context).
    enableHWA: true,
    // Not owned by the loading task: destroying a document keeps the worker.
    worker: pdfWorker(),
  })
  try {
    return new PdfJsDoc(task, await task.promise)
  } catch (e) {
    void task.destroy()
    const message = e instanceof Error ? e.message : String(e)
    if (e instanceof PasswordException) throw { code: 'Encrypted', message }
    throw { code: 'InvalidPdf', message }
  }
}
