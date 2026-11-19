import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = []
    static failNext: unknown = null
    destroyed = false
    promise: Promise<void>
    constructor() {
      FakeWorker.instances.push(this)
      const fail = FakeWorker.failNext
      FakeWorker.failNext = null
      this.promise = fail ? Promise.reject(fail) : Promise.resolve()
    }
    destroy() {
      this.destroyed = true
    }
  }
  return { FakeWorker, getDocument: vi.fn() }
})

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  PasswordException: class extends Error {},
  PDFWorker: mocks.FakeWorker,
  getDocument: mocks.getDocument,
}))

const { loadPdf, warmUpPdfWorker } = await import('../../../src/core/viewer/pdfEngine')

function stubDocument() {
  mocks.getDocument.mockImplementation(() => ({
    promise: Promise.resolve({ numPages: 3 }),
    destroy: vi.fn(),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('warmUpPdfWorker', () => {
  it('logs a failed warm-up and loadPdf still works with a fresh worker', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.FakeWorker.failNext = new Error('no worker')
    warmUpPdfWorker()
    const failed = mocks.FakeWorker.instances.at(-1)!
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledOnce())
    expect(failed.destroyed).toBe(true)

    stubDocument()
    const doc = await loadPdf(new ArrayBuffer(8))
    expect(doc.numPages).toBe(3)
    const used = mocks.getDocument.mock.calls.at(-1)![0].worker
    expect(used).not.toBe(failed)
    expect(used.destroyed).toBe(false)
  })

  it('shares the warmed-up worker with loadPdf', async () => {
    warmUpPdfWorker()
    const warmed = mocks.FakeWorker.instances.at(-1)!
    await warmed.promise
    stubDocument()
    await loadPdf(new ArrayBuffer(8))
    expect(mocks.getDocument.mock.calls.at(-1)![0].worker).toBe(warmed)
  })
})
