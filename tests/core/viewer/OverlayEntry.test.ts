import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { PagePointerEvent, ToolHandler } from '../../../src/core/registry/tools'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import Overlay from '../../../src/core/viewer/Overlay.svelte'
import { fakeRenderDoc } from './fakeDoc'

describe('Overlay page entries', () => {
  it('an empty page gets a synthetic viewport of its rotated size, without a pdf.js page', async () => {
    const { doc } = fakeRenderDoc(1)
    const events: PagePointerEvent[] = []
    const tool: ToolHandler = { onPointerDown: (e) => void events.push(e) }
    const r = render(Overlay, {
      props: {
        doc,
        pageNumber: 2,
        entry: { kind: 'blank', width: 100, height: 200, rotate: 90 },
        scale: 2,
        store: new AnnotationStore(),
        tool,
      },
    })
    const svg = r.container.querySelector('svg')!
    await vi.waitFor(() => expect(svg.getAttribute('viewBox')).toBe('0 0 400 200'))
    expect(doc.getPage).not.toHaveBeenCalled()
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect
    svg.setPointerCapture = vi.fn()
    await fireEvent.pointerDown(svg, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
    expect(events).toHaveLength(1)
    // Quarter turn clockwise: the top-left corner on screen is the PDF origin.
    expect(events[0].page).toBe(1)
    expect(events[0].vp.rotation).toBe(90)
    expect(events[0].pdf[0]).toBeCloseTo(0)
    expect(events[0].pdf[1]).toBeCloseTo(0)
  })

  it('a rotated file page gets the combined rotation', async () => {
    const { doc } = fakeRenderDoc(2)
    const page = await doc.getPage(2)
    Object.assign(page, { rotate: 270 })
    const getViewport = vi.spyOn(page, 'getViewport')
    render(Overlay, {
      props: { doc, pageNumber: 1, entry: { kind: 'source', source: 1, rotate: 180 }, scale: 1.5, store: new AnnotationStore() },
    })
    await vi.waitFor(() => expect(getViewport).toHaveBeenCalledWith({ scale: 1.5, rotation: 90 }))
  })
})
