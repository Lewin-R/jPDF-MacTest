import { render } from '@testing-library/svelte'
import { AnnotationMode } from 'pdfjs-dist'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PageView from '../../../src/core/viewer/PageView.svelte'
import { renderCache } from '../../../src/core/viewer/renderCache'
import { fakeRenderDoc, stubCanvas } from './fakeDoc'

let n = 0
let canvasStub: ReturnType<typeof stubCanvas>
let setSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  canvasStub = stubCanvas()
  setSpy = vi.spyOn(renderCache, 'set')
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(doc: ReturnType<typeof fakeRenderDoc>['doc'], scale = 1) {
  return render(PageView, {
    props: {
      doc,
      cacheId: `pv${++n}`,
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      scale,
      left: 0,
      top: 16,
    },
  })
}

describe('PageView render lifecycle', () => {
  it('renders with annotation storage so managed annotations can be suppressed', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    expect(renders[0].annotationMode).toBe(AnnotationMode.ENABLE_STORAGE)
  })

  it('caches and draws a completed render', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    renders[0].finish()
    await vi.waitFor(() => expect(canvasStub.bitmaps).toHaveLength(1))
    canvasStub.bitmaps[0].resolve()
    await vi.waitFor(() => expect(setSpy).toHaveBeenCalledOnce())
    expect(canvasStub.drawImage).toHaveBeenCalledWith(canvasStub.bitmaps[0].bmp, 0, 0)
  })

  it('cancels the in-flight render on unmount and caches nothing', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    const { unmount } = mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    unmount()
    expect(renders[0].cancel).toHaveBeenCalledOnce()
    await new Promise((r) => setTimeout(r, 0))
    expect(canvasStub.createImageBitmap).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('cancels the previous render when the scale changes', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    const { rerender } = mount(doc, 1)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    await rerender({ scale: 2 })
    expect(renders[0].cancel).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(renders).toHaveLength(2))
    expect(renders[1].scale).toBe(2)
  })

  it('closes a bitmap that arrives after cancellation', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    const { unmount } = mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    renders[0].finish()
    await vi.waitFor(() => expect(canvasStub.bitmaps).toHaveLength(1))
    unmount()
    canvasStub.bitmaps[0].resolve()
    const { bmp } = canvasStub.bitmaps[0]
    await vi.waitFor(() => expect(bmp.close).toHaveBeenCalledOnce())
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('does not log failures of a destroyed doc', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    await doc.destroy()
    renders[0].fail(new Error('Worker was destroyed'))
    await new Promise((r) => setTimeout(r, 0))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('logs genuine render failures', async () => {
    const { doc, renders } = fakeRenderDoc(1)
    mount(doc)
    await vi.waitFor(() => expect(renders).toHaveLength(1))
    renders[0].fail(new Error('broken page'))
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledOnce())
  })
})
