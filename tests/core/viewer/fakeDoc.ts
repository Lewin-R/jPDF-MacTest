import { vi } from 'vitest'

export function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

export interface FakeRender {
  page: number
  scale: number
  annotationMode: number | undefined
  /** The canvas pdf.js was asked to draw into. */
  canvas: HTMLCanvasElement | undefined
  cancel: ReturnType<typeof vi.fn>
  /** Completes the render (or makes it fail with `fail(err)`). */
  finish: () => void
  fail: (e: unknown) => void
}

/** Fake PdfDoc whose page.render returns a controllable RenderTask. */
export function fakeRenderDoc(numPages: number, size = { width: 600, height: 800 }) {
  const renders: FakeRender[] = []
  // One proxy per page, as pdf.js caches them.
  const pages = new Map<number, ReturnType<typeof makePage>>()
  const makePage = (page: number) => ({
    cleanup: vi.fn(() => true),
    getTextContent: async () => ({ items: [], styles: {} }),
    getViewport: ({ scale }: { scale: number }) => ({
      width: size.width * scale,
      height: size.height * scale,
    }),
    render: vi.fn(
      ({
        viewport,
        annotationMode,
        canvas,
      }: {
        viewport: { width: number }
        annotationMode?: number
        canvas?: HTMLCanvasElement
      }) => {
        const d = deferred<void>()
        const cancel = vi.fn(() => d.reject(new Error('Rendering cancelled')))
        renders.push({
          page,
          scale: viewport.width / size.width,
          annotationMode,
          canvas,
          cancel,
          finish: () => d.resolve(),
          fail: d.reject,
        })
        return { promise: d.promise, cancel }
      },
    ),
  })
  const doc = {
    numPages,
    destroyed: false,
    getPage: vi.fn(async (page: number) => {
      if (!pages.has(page)) pages.set(page, makePage(page))
      return pages.get(page)!
    }),
    suppressAnnotations: vi.fn(),
    destroy: vi.fn(async () => {
      doc.destroyed = true
    }),
  }
  return { doc, renders }
}
