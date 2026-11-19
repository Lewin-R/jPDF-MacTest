import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRenderDoc } from './fakeDoc'

const mocks = vi.hoisted(() => ({ doc: null as unknown }))
vi.mock('../../../src/core/ipc/api', () => ({
  openPdf: async () => new ArrayBuffer(8),
  readAnnotations: async () => [],
}))
vi.mock('../../../src/core/viewer/pdfEngine', () => ({ loadPdf: async () => mocks.doc }))

import { DocumentSession } from '../../../src/core/session/session.svelte'
import Viewer from '../../../src/core/viewer/Viewer.svelte'
import { renderCache } from '../../../src/core/viewer/renderCache'

// jsdom has no layout: give elements a writable scroll position and a no-op ResizeObserver.
const scrollProps = ['scrollTop', 'scrollLeft'] as const
beforeEach(() => {
  for (const prop of scrollProps) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: Record<string, number>) {
        return this[`_${prop}`] ?? 0
      },
      set(this: Record<string, number>, v: number) {
        this[`_${prop}`] = v
      },
    })
  }
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => {
  for (const prop of scrollProps) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Viewer', () => {
  it('renders only pages in range and cancels renders of pages that leave it', async () => {
    const { doc, renders } = fakeRenderDoc(20)
    mocks.doc = doc
    const session = await DocumentSession.open('C:/docs/v.pdf')
    await session.pageSizesLoaded
    const setSpy = vi.spyOn(renderCache, 'set')
    const { container } = render(Viewer, { props: { session } })
    session.setViewport(800, 600)
    await tick()
    // Viewport 0–600 shows page 1; overscan adds page 2.
    await vi.waitFor(() => expect(renders.map((r) => r.page).sort()).toEqual([1, 2]))
    expect(container.querySelectorAll('.page')).toHaveLength(2)

    session.goToPage(10)
    await tick()
    expect(renders.filter((r) => r.page <= 2).every((r) => r.cancel.mock.calls.length === 1)).toBe(true)
    await vi.waitFor(() => expect(renders.map((r) => r.page)).toContain(10))
    const pages = [...container.querySelectorAll('.page')]
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.length).toBeLessThanOrEqual(4)
    expect(setSpy).not.toHaveBeenCalled()
    await session.dispose()
  })
})
