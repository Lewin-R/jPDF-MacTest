import { fireEvent, render } from '@testing-library/svelte'
import type { PageViewport } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import '../../../src/annotations'
import type { PagePointerEvent, ToolHandler } from '../../../src/core/registry/tools'
import type { Annotation, FreeTextAnnotation, InkAnnotation } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import Overlay from '../../../src/core/viewer/Overlay.svelte'

// Page 100pt tall at scale 2.
const vp = {
  scale: 2,
  rotation: 0,
  width: 200,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, 100 - y / 2],
} as unknown as PageViewport

const box: FreeTextAnnotation = {
  id: 'a', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'freetext',
  rect: [10, 70, 60, 90], text: 'hi', lines: ['hi'], fontSize: 10, textColor: [0, 0, 0], background: null,
}
const ink: InkAnnotation = {
  id: 'i', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'ink',
  strokes: [[[20, 20], [40, 40]]], color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role: 'pen',
}

function mount(props: Record<string, unknown>, list: Annotation[] = [box, ink]) {
  const store = new AnnotationStore()
  store.load(list)
  const r = render(Overlay, { props: { pageNumber: 1, scale: 2, store, viewport: vp, ...props } })
  const svg = r.container.querySelector('svg')!
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0 }) as DOMRect
  return { ...r, svg, store }
}

const attrs = (el: Element | null) => el && ['x', 'y', 'width', 'height'].map((k) => Number(el.getAttribute(k)))

describe('Overlay selection', () => {
  it('outlines the selected text box with e/w handles only', () => {
    const { container } = mount({ selection: ['a'] })
    // rect [10, 70, 60, 90] → screen [20, 20, 120, 60]
    expect(attrs(container.querySelector('.selection-box'))).toEqual([20, 20, 100, 40])
    const handles = [...container.querySelectorAll('.handle')]
    expect(handles.map((h) => h.getAttribute('data-handle'))).toEqual(['e', 'w'])
    // The east edge's handle: an upright pill (6 x 21, round ends) centred on (120, 40).
    expect(attrs(handles[0])).toEqual([117, 29.5, 6, 21])
    expect(handles[0].getAttribute('rx')).toBe('3')
  })

  it('gives ink all eight handles and highlights none', () => {
    const { container } = mount({ selection: ['i'] })
    expect(container.querySelectorAll('.handle')).toHaveLength(8)
    const hl: Annotation = {
      id: 'h', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'highlight',
      quads: [[0, 10, 10, 10, 0, 0, 10, 0]], color: [1, 1, 0], opacity: 0.4,
    }
    const other = mount({ selection: ['h'] }, [hl])
    expect(other.container.querySelector('.selection-box')).not.toBeNull()
    expect(other.container.querySelectorAll('.handle')).toHaveLength(0)
  })

  it('draws corners as circles and edges as pills lying along their edge', () => {
    const { container } = mount({ selection: ['i'] })
    // Ink bounds [19, 19, 41, 41] → screen [38, 118, 82, 162].
    const nw = container.querySelector('[data-handle="nw"]')!
    expect(nw.tagName.toLowerCase()).toBe('circle')
    expect(['cx', 'cy', 'r'].map((k) => Number(nw.getAttribute(k)))).toEqual([38, 118, 4.5])
    const n = container.querySelector('[data-handle="n"]')!
    expect(n.tagName.toLowerCase()).toBe('rect')
    expect(attrs(n)).toEqual([49.5, 115, 21, 6])
  })

  it('enlarges the handle under the pointer, and lets go when the pointer leaves', async () => {
    const { container } = mount({ selection: ['a'] })
    const page = container
    const east = () => container.querySelector('[data-handle="e"]')!
    const west = () => container.querySelector('[data-handle="w"]')!
    await fireEvent.pointerMove(page, { clientX: 121, clientY: 44, buttons: 0 })
    expect(east().classList.contains('hover')).toBe(true)
    expect(west().classList.contains('hover')).toBe(false)
    await fireEvent.pointerMove(page, { clientX: 70, clientY: 40, buttons: 0 })
    expect(east().classList.contains('hover')).toBe(false)
    await fireEvent.pointerMove(page, { clientX: 20, clientY: 40, buttons: 0 })
    expect(west().classList.contains('hover')).toBe(true)
    await fireEvent.pointerLeave(page)
    expect(west().classList.contains('hover')).toBe(false)
  })

  it('follows the dragged preview, and draws nothing for a hidden selection or another page', () => {
    const moved = { ...box, rect: [20, 70, 70, 90] as FreeTextAnnotation['rect'] }
    const dragging = mount({ selection: ['a'], preview: moved, hidden: new Set(['a']) })
    expect(attrs(dragging.container.querySelector('.selection-box'))![0]).toBe(40)
    const editing = mount({ selection: ['a'], hidden: new Set(['a']) })
    expect(editing.container.querySelector('.selection-box')).toBeNull()
    const elsewhere = mount({ selection: ['a'], pageNumber: 2 })
    expect(elsewhere.container.querySelector('.selection-box')).toBeNull()
  })
})

describe('Overlay hover pass-through', () => {
  function passTool() {
    const onPassThroughDown = vi.fn()
    const onPointerDown = vi.fn()
    const tool: ToolHandler = {
      // Something of the tool's is left of x = 50pt.
      passThroughAt: (e: PagePointerEvent) => e.pdf[0] >= 50,
      onPassThroughDown,
      onPointerDown,
    }
    return { tool, onPassThroughDown, onPointerDown }
  }

  it('lets input through to the page except where the tool has something', async () => {
    const { tool, onPassThroughDown, onPointerDown } = passTool()
    const { svg, container } = mount({ tool })
    expect(svg.classList.contains('interactive')).toBe(false)

    await fireEvent.pointerMove(container, { clientX: 20, clientY: 20, buttons: 0 })
    expect(svg.classList.contains('interactive')).toBe(true)
    await fireEvent.pointerDown(svg, { button: 0, clientX: 20, clientY: 20, pointerId: 1 })
    expect(onPointerDown).toHaveBeenCalledOnce()
    expect(onPassThroughDown).not.toHaveBeenCalled()
    await fireEvent.pointerUp(svg, { clientX: 20, clientY: 20, pointerId: 1 })

    await fireEvent.pointerMove(container, { clientX: 150, clientY: 20, buttons: 0 })
    expect(svg.classList.contains('interactive')).toBe(false)
    // A press on the text layer (here: the page itself) is reported to the tool.
    await fireEvent.pointerDown(container, { button: 0, clientX: 150, clientY: 20, pointerId: 2 })
    expect(onPassThroughDown).toHaveBeenCalledOnce()
    expect(onPassThroughDown.mock.calls[0][0].pdf).toEqual([75, 90])
  })

  it('does not switch while a button is held (a text selection drag)', async () => {
    const { tool } = passTool()
    const { svg, container } = mount({ tool })
    await fireEvent.pointerMove(container, { clientX: 20, clientY: 20, buttons: 1 })
    expect(svg.classList.contains('interactive')).toBe(false)
  })
})
