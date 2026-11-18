import { fireEvent, render } from '@testing-library/svelte'
import type { PageViewport } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import type { PagePointerEvent, ToolHandler } from '../../../src/core/registry/tools'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import Overlay from '../../../src/core/viewer/Overlay.svelte'

// Page 100pt tall at scale 2.
const vp = {
  scale: 2,
  width: 200,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, 100 - y / 2],
} as unknown as PageViewport

function mount(tool: ToolHandler | null, rect = { left: 10, top: 20, width: 200, height: 200 }) {
  const r = render(Overlay, { props: { pageNumber: 3, scale: 2, store: new AnnotationStore(), viewport: vp, tool, cursor: 'crosshair' } })
  const svg = r.container.querySelector('svg')!
  svg.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }) as DOMRect
  const captured = new Set<number>()
  svg.setPointerCapture = vi.fn((id: number) => void captured.add(id))
  svg.releasePointerCapture = vi.fn((id: number) => void captured.delete(id))
  svg.hasPointerCapture = (id: number) => captured.has(id)
  return { ...r, svg }
}

function spyTool() {
  const events: [string, PagePointerEvent][] = []
  const tool: ToolHandler = {
    onPointerDown: (e) => void events.push(['down', e]),
    onPointerMove: (e) => void events.push(['move', e]),
    onPointerUp: (e) => void events.push(['up', e]),
  }
  return { tool, events }
}

describe('Overlay pointer routing', () => {
  it('is click-through without a tool', () => {
    const { svg } = mount(null)
    expect(svg.classList.contains('interactive')).toBe(false)
  })

  it('forwards down/move/up with page, pdf and screen coordinates', async () => {
    const { tool, events } = spyTool()
    const { svg } = mount(tool)
    expect(svg.classList.contains('interactive')).toBe(true)
    expect(svg.style.cursor).toBe('crosshair')

    await fireEvent.pointerDown(svg, { button: 0, clientX: 30, clientY: 60, pointerId: 7 })
    expect(svg.setPointerCapture).toHaveBeenCalledWith(7)
    await fireEvent.pointerMove(svg, { clientX: 50, clientY: 60, pointerId: 7 })
    await fireEvent.pointerUp(svg, { clientX: 50, clientY: 80, pointerId: 7 })

    expect(events.map(([k]) => k)).toEqual(['down', 'move', 'up'])
    const [, down] = events[0]
    expect(down.page).toBe(2)
    expect(down.screen).toEqual([20, 40])
    expect(down.pdf).toEqual([10, 80])
    expect(down.vp).toBe(vp)
    expect(down.native.pointerId).toBe(7)
    expect(events[2][1].pdf).toEqual([20, 70])
  })

  it('ignores moves without a captured pointer and non-primary buttons', async () => {
    const { tool, events } = spyTool()
    const { svg } = mount(tool)
    await fireEvent.pointerMove(svg, { clientX: 50, clientY: 60, pointerId: 1 })
    await fireEvent.pointerDown(svg, { button: 2, clientX: 50, clientY: 60, pointerId: 1 })
    await fireEvent.pointerUp(svg, { clientX: 50, clientY: 60, pointerId: 1 })
    expect(events).toEqual([])
  })

  it('maps through a CSS-scaled box (zoom preview) to viewport units', async () => {
    const { tool, events } = spyTool()
    // Box shown at half size: 100 CSS px for a 200-unit viewport.
    const { svg } = mount(tool, { left: 0, top: 0, width: 100, height: 100 })
    await fireEvent.pointerDown(svg, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    expect(events[0][1].screen).toEqual([10, 10])
    expect(events[0][1].pdf).toEqual([10, 90])
  })

  it('pointercancel ends the gesture', async () => {
    const { tool, events } = spyTool()
    const { svg } = mount(tool)
    await fireEvent.pointerDown(svg, { button: 0, clientX: 30, clientY: 60, pointerId: 2 })
    await fireEvent.pointerCancel(svg, { clientX: 30, clientY: 60, pointerId: 2 })
    await fireEvent.pointerMove(svg, { clientX: 40, clientY: 60, pointerId: 2 })
    expect(events.map(([k]) => k)).toEqual(['down', 'up'])
  })
})
