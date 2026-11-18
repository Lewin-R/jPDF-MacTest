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
  cancel: ReturnType<typeof vi.fn>
  /** Completes the render (or makes it fail with `fail(err)`). */
  finish: () => void
  fail: (e: unknown) => void
}

/** Fake PdfDoc whose page.render returns a controllable RenderTask. */
export function fakeRenderDoc(numPages: number, size = { width: 600, height: 800 }) {
  const renders: FakeRender[] = []
  const doc = {
    numPages,
    destroyed: false,
    getPage: vi.fn(async (page: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: size.width * scale,
        height: size.height * scale,
      }),
      render: vi.fn(({ viewport }: { viewport: { width: number } }) => {
        const d = deferred<void>()
        const cancel = vi.fn(() => d.reject(new Error('Rendering cancelled')))
        renders.push({
          page,
          scale: viewport.width / size.width,
          cancel,
          finish: () => d.resolve(),
          fail: d.reject,
        })
        return { promise: d.promise, cancel }
      }),
    })),
    destroy: vi.fn(async () => {
      doc.destroyed = true
    }),
  }
  return { doc, renders }
}

/** Stubs canvas 2D and createImageBitmap (jsdom has neither). */
export function stubCanvas() {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  const bitmaps: { bmp: ImageBitmap; resolve: () => void }[] = []
  const createImageBitmap = vi.fn(() => {
    const d = deferred<ImageBitmap>()
    const bmp = { width: 600, height: 800, close: vi.fn() } as unknown as ImageBitmap
    bitmaps.push({ bmp, resolve: () => d.resolve(bmp) })
    return d.promise
  })
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  return { drawImage, bitmaps, createImageBitmap }
}
