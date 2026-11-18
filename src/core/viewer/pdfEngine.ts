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
  getPage(i: number): Promise<PDFPageProxy>
  destroy(): Promise<void>
}

class PdfJsDoc implements PdfDoc {
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

  destroy(): Promise<void> {
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
