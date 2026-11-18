import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

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
    // Destroying the loading task tears down the worker and the document.
    return this.task.destroy()
  }
}

/** Loads a PDF. Throws `{code:'Encrypted'|'InvalidPdf', message}` on failure. */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    iccUrl: '/pdfjs/iccs/',
    wasmUrl: '/pdfjs/wasm/',
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
